<?php
// GPL-3.0-or-later. Based on the shared 2026-10-14 prototype.
// 2026-10-15: isolated local export revision hooks; not a payment authorizer.
namespace local_clearwatch;
class engine {
    public static function fail($reason) { throw new \invalid_parameter_exception($reason); }
    public static function nowms() { return (int)floor(microtime(true)*1000); }
    public static function day($ms) { return (new \DateTimeImmutable('@'.intdiv($ms,1000)))->setTimezone(new \DateTimeZone('Asia/Seoul'))->format('Y-m-d'); }
    public static function meets($elapsed,$duration,$bps) { return $elapsed*10000 >= $duration*$bps; }
    public static function integer($v,$min,$max) { if (!is_int($v)||$v<$min||$v>$max) self::fail('BAD_INTEGER'); return $v; }
    public static function policy($cmid) {
        global $DB;
        $p=$DB->get_record('local_clearwatch_policy',['cmid'=>$cmid]);
        if (!$p) self::fail('NO_PINNED_POLICY');
        $files=get_file_storage()->get_area_files(\context_module::instance($cmid)->id,'mod_videocheck','video',0,'id',false);
        if (count($files)!==1 || reset($files)->get_contenthash()!==$p->contenthash) self::fail('MEDIA_CHANGED');
        return $p;
    }
    public static function state($userid,$cmid,$policy) {
        global $DB;
        $s=$DB->get_record('local_clearwatch_state',['userid'=>$userid,'cmid'=>$cmid]);
        if ($s && $s->policyhash!==$policy->policyhash) self::fail('POLICY_CHANGED');
        return $s ?: (object)['userid'=>$userid,'cmid'=>$cmid,'policyhash'=>$policy->policyhash,'elapsedms'=>0,'positionms'=>0,'coverage'=>'[]','closedms'=>0,'creditday'=>''];
    }
    public static function evidence($userid,$cmid) {
        $p=self::policy($cmid); $s=self::state($userid,$cmid,$p);
        $ranges=json_decode($s->coverage,true);$coverage=0;
        foreach($ranges as $r)$coverage+=$r[1]-$r[0];
        return ['cmid'=>$cmid,'policyHash'=>$p->policyhash,'elapsedMs'=>(int)$s->elapsedms,'durationMs'=>(int)$p->durationms,
        'coverageMs'=>$coverage,'positionMs'=>(int)$s->positionms,'timeConditionMet'=>self::meets((int)$s->elapsedms,(int)$p->durationms,(int)$p->thresholdbps),
        'normalCloseAcknowledged'=>(int)$s->closedms>0,'closedAtMs'=>(int)$s->closedms,'credited'=>$s->creditday!=='','creditDay'=>$s->creditday,
        'assurance'=>'SERVER_BOUNDED_CLIENT_TELEMETRY','humanAttentionProven'=>false,'paymentAuthorized'=>false];
    }
    public static function facts_key($s) { return json_encode([(int)$s->elapsedms,(int)$s->positionms,json_decode($s->coverage,true),(int)$s->closedms,(string)$s->creditday]); }
    public static function merge($ranges,$new) {
        foreach($new as $n)$ranges[]=[$n['from'],$n['to']];
        usort($ranges,fn($a,$b)=>$a[0]<=>$b[0]);$out=[];
        foreach($ranges as $r){$i=count($out)-1;if($i>=0 && $r[0]<=$out[$i][1])$out[$i][1]=max($out[$i][1],$r[1]);else $out[]=$r;}
        return $out;
    }
    // All elapsed time remains browser telemetry; server bounds prevent fast-forwarded claims, not live bots.
    public static function command($userid,$cmid,$courseid,$op,$x) {
        global $DB;
        if (!is_array($x)) self::fail('BAD_PAYLOAD');
        $lock=\core\lock\lock_config::get_lock_factory('local_clearwatch')->get_lock('learner:'.$userid,5);
        if (!$lock) self::fail('BUSY');
        try {
            $tx=$DB->start_delegated_transaction(); $p=self::policy($cmid);$s=self::state($userid,$cmid,$p);$now=self::nowms(); $previous=empty($s->id)?null:self::facts_key($s);
            if ($op==='begin') {
                if ($x!==[]) self::fail('BEGIN_PAYLOAD_NOT_EMPTY');
                if (empty($s->id))$s->id=$DB->insert_record('local_clearwatch_state',$s);
                if ($s->creditday==='') { $s->closedms=0; $DB->update_record('local_clearwatch_state',$s); }
                $DB->set_field('local_clearwatch_session','active',0,['userid'=>$userid,'active'=>1]);
                $token=bin2hex(random_bytes(32));
                $session=(object)['userid'=>$userid,'cmid'=>$cmid,'tokenhash'=>hash('sha256',$token),'policyhash'=>$p->policyhash,'active'=>1,
                  'startedms'=>$now,'lastms'=>$now,'lastseq'=>0,'creditedms'=>0,'positionms'=>(int)$s->positionms,'playing'=>0];
                $id=$DB->insert_record('local_clearwatch_session',$session);
                $result=['sessionId'=>$id,'token'=>$token,'seq'=>0,'evidence'=>self::evidence($userid,$cmid)];
                if ($previous!==self::facts_key($s)) \local_clearapi\exporter::changed($userid,$courseid,'SESSION_OPEN');
                $tx->allow_commit();return $result;
            }
            $allowed=['sessionId','token','seq','intervals','positionMs','playing'];
            if($op==='seek')$allowed[]='targetMs';
            $keys=array_keys($x);sort($keys);sort($allowed);if($keys!==$allowed)self::fail('UNSUPPORTED_FIELDS');
            $sid=self::integer($x['sessionId'],1,PHP_INT_MAX);$seq=self::integer($x['seq'],1,PHP_INT_MAX);
            $session=$DB->get_record('local_clearwatch_session',['id'=>$sid,'userid'=>$userid,'cmid'=>$cmid]);
            if(!$session||!is_string($x['token'])||!hash_equals($session->tokenhash,hash('sha256',$x['token'])))self::fail('SESSION_BINDING');
            $fingerprint=hash('sha256',json_encode([$op,$x]));
            if($prev=$DB->get_record('local_clearwatch_event',['sessionid'=>$sid,'seq'=>$seq])){
                if(!hash_equals($prev->fingerprint,$fingerprint))self::fail('REPLAY_CHANGED');
                $tx->allow_commit();return json_decode($prev->response,true);
            }
            if(!$session->active)self::fail('SESSION_SUPERSEDED');
            if($session->policyhash!==$p->policyhash)self::fail('POLICY_CHANGED');
            if($seq!==((int)$session->lastseq)+1)self::fail('SEQUENCE_GAP');
            if(!in_array($op,['pulse','seek','finish'],true))self::fail('BAD_OPERATION');
            $delta=$now-(int)$session->lastms;
            if($delta<0 || $delta>4000)self::fail('SESSION_GAP_RESTART_REQUIRED');
            if(!is_bool($x['playing'])||!is_array($x['intervals'])||count($x['intervals'])>100)self::fail('BAD_INTERVALS');
            $pos=(int)$session->positionms;$active=0;
            foreach($x['intervals'] as $i){
                if(!is_array($i)||count($i)!==4)self::fail('BAD_INTERVAL');
                $from=self::integer($i['from']??null,0,(int)$p->durationms);
                $to=self::integer($i['to']??null,0,(int)$p->durationms);
                $wall=self::integer($i['wallMs']??null,0,4000);
                $rate=self::integer($i['rateMilli']??null,500,2000);
                if(abs($from-$pos)>2||$to<$from)self::fail('DISCONTINUOUS_MEDIA');
                // Derive elapsed equivalent from media delta/rate; never credit pause/wait duration.
                $equivalent=($to-$from)*1000/$rate;
                if($equivalent>$wall+50)self::fail('IMPLAUSIBLE_MEDIA_ADVANCE');
                $active+=min($wall,(int)floor($equivalent));$pos=$to;
            }
            // Compare to total unused server-time budget: request arrival jitter must not
            // reject legitimate playback, and the total must never exceed elapsed time.
            $budget=max(0,$now-(int)$session->startedms-(int)$session->creditedms);
            if($active>4000 || $active>$budget+100)self::fail('SERVER_ELAPSED_EXCEEDED');
            $position=self::integer($x['positionMs'],0,(int)$p->durationms);
            if(abs($position-$pos)>2)self::fail('POSITION_MISMATCH');
            $credit=min($active,$budget);
            // Milliseconds can only accumulate within real server session elapsed time.
            if($s->creditday===''){
                $s->elapsedms=(int)$s->elapsedms+$credit;
                $s->coverage=json_encode(self::merge(json_decode($s->coverage,true),$x['intervals']));
                $s->positionms=$position;
            }
            if($op==='seek'){
                if($x['intervals']!==[]||$x['playing'])self::fail('SEEK_MUST_BE_PAUSED');
                $position=self::integer($x['targetMs'],0,(int)$p->durationms);
                if($s->creditday==='')$s->positionms=$position;
            }
            if($op==='finish'){
                if($x['playing'])self::fail('FINISH_MUST_BE_PAUSED');
                if($s->creditday===''){
                    $s->closedms=$now;
                    if(self::meets((int)$s->elapsedms,(int)$p->durationms,(int)$p->thresholdbps)){
                        $s->creditday=self::day($now);
                        $DB->insert_record('local_clearwatch_credit',(object)['userid'=>$userid,'cmid'=>$cmid,'courseid'=>$courseid,
                          'policyhash'=>$p->policyhash,'creditday'=>$s->creditday,'closedms'=>$now,'elapsedms'=>$s->elapsedms]);
                    }
                }
                $session->active=0;
            }
            $DB->update_record('local_clearwatch_state',$s);
            $session->lastms=$now;$session->lastseq=$seq;$session->positionms=$position;$session->playing=(int)$x['playing'];
            $session->creditedms=(int)$session->creditedms+$credit;
            $DB->update_record('local_clearwatch_session',$session);
            $result=['seq'=>$seq,'acceptedMs'=>$credit,'evidence'=>self::evidence($userid,$cmid)];
            $DB->insert_record('local_clearwatch_event',(object)['sessionid'=>$sid,'seq'=>$seq,'fingerprint'=>$fingerprint,'response'=>json_encode($result)]);
            if ($previous!==self::facts_key($s)) \local_clearapi\exporter::changed($userid,$courseid,'PLAYBACK');
            $tx->allow_commit();return $result;
        } catch (\Throwable $e) { if(isset($tx))$tx->rollback($e); throw $e; } finally {$lock->release();}
    }
}
