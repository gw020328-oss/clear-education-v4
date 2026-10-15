<?php
// GPL-3.0-or-later. Source truth remains local Moodle + browser telemetry.
namespace local_clearapi;
class exporter {
    public static function canonical($v) {
        if (is_array($v)) { if (!array_is_list($v)) ksort($v,SORT_STRING); foreach($v as &$x) $x=self::canonical($x); }
        return $v;
    }
    public static function hash($domain,$v) { return hash('sha256',$domain."\n".json_encode(self::canonical($v),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE)); }
    public static function configuration($userid,$courseid) {
        $c=json_decode(get_config('local_clearapi','course_'.$courseid) ?: '',true);
        if (!$c || !isset($c['accounts'][(string)$userid])) throw new \invalid_parameter_exception('EXPORT_ACCOUNT_UNBOUND');
        if (!isset($c['accessUntil']) || $c['accessUntil']<time()) throw new \invalid_parameter_exception('EXPORT_ACCESS_EXPIRED');
        if (!is_int($c['pageSize']) || $c['pageSize']<1 || $c['pageSize']>100 || !is_array($c['activities'])
            || !count($c['activities']) || count($c['activities'])>10000
            || count(array_unique(array_column($c['activities'],'cmid')))!==count($c['activities'])
            || count(array_unique(array_column($c['activities'],'activityId')))!==count($c['activities'])
            || '0x'.self::hash('CLEAR-MVP-ACTIVITIES',array_column($c['activities'],'activityId'))!==$c['activitySetHash']) throw new \invalid_parameter_exception('EXPORT_CONFIG_INVALID');
        $c['sourceBinding']=array_merge($c['sourceBinding'],$c['accounts'][(string)$userid]); return $c;
    }
    // Caller must hold the same learner lock and DB transaction as the writer.
    public static function changed($userid,$courseid,$cause) {
        global $DB;
        if (!in_array($cause,['PLAYBACK','SESSION_OPEN','LAB_CORRECTION','INITIAL_EXPORT','CACHE_REFRESH','OBSERVED_CHANGE','BINDING_CONFIG'],true)) throw new \invalid_parameter_exception('EXPORT_CAUSE');
        $head=$DB->get_record('local_clearapi_head',compact('userid','courseid'));
        if (!$head) $head=(object)['userid'=>$userid,'courseid'=>$courseid,'generation'=>0,'fingerprint'=>'','artifact'=>''];
        $head->generation++; $head->artifact=''; $head->fingerprint='';
        if (isset($head->id)) $DB->update_record('local_clearapi_head',$head); else $head->id=$DB->insert_record('local_clearapi_head',$head);
        $DB->insert_record('local_clearapi_audit',(object)['userid'=>$userid,'courseid'=>$courseid,'generation'=>$head->generation,'causekey'=>$cause]);
    }
    public static function snapshot($userid,$courseid) {
        global $DB;
        $lock=\core\lock\lock_config::get_lock_factory('local_clearwatch')->get_lock('learner:'.$userid,5);
        if (!$lock) throw new \invalid_parameter_exception('EXPORT_BUSY');
        try {
            if ($DB->is_transaction_started()) throw new \invalid_parameter_exception('EXPORT_NESTED_TRANSACTION');
            $tx=$DB->start_delegated_transaction();
            $c=self::configuration($userid,$courseid); $rows=[];
            // Moodle's pgsql driver uses internal savepoints and READ COMMITTED.
            // One SELECT supplies an atomic MVCC view of configuration, policy,
            // media metadata and all learning states; no driver/savepoint hack.
            $ids=array_column($c['activities'],'cmid'); [$insql,$params]=$DB->get_in_or_equal($ids,SQL_PARAMS_NAMED,'activity');
            $params['learner']=$userid; $params['configkey']='course_'.$courseid;
            $query="SELECT cm.id,cm.course,cm.visible,mods.name AS modulename,cfg.value AS configjson,
                p.durationms,p.contenthash,p.policyhash,s.id AS stateid,s.elapsedms,s.positionms,s.coverage,s.closedms,s.creditday,s.policyhash AS statepolicy,
                files.filecount,files.mediahash
                FROM {course_modules} cm JOIN {modules} mods ON mods.id=cm.module
                JOIN {config_plugins} cfg ON cfg.plugin='local_clearapi' AND cfg.name=:configkey
                LEFT JOIN {local_clearwatch_policy} p ON p.cmid=cm.id
                LEFT JOIN {local_clearwatch_state} s ON s.cmid=cm.id AND s.userid=:learner
                LEFT JOIN {context} ctx ON ctx.contextlevel=70 AND ctx.instanceid=cm.id
                LEFT JOIN (SELECT contextid,COUNT(*) AS filecount,MIN(contenthash) AS mediahash FROM {files}
                    WHERE component='mod_videocheck' AND filearea='video' AND itemid=0 AND filename<>'.' GROUP BY contextid) files ON files.contextid=ctx.id
                WHERE cm.id $insql";
            $source=$DB->get_records_sql($query,$params);
            foreach($c['activities'] as $a) {
                $base=['activityId'=>$a['activityId'],'lectureId'=>$a['lectureId'],'cmid'=>$a['cmid'],'activityType'=>$a['activityType']];
                try {
                    $r=$source[$a['cmid']]??null;
                    if (!$r || $r->course!=$courseid || !$r->visible || $r->modulename!=='videocheck'
                        || !has_capability('mod/videocheck:view',\context_module::instance($a['cmid']),$userid)) throw new \Exception('UNAVAILABLE');
                    $fresh=json_decode($r->configjson,true); $fresh['sourceBinding']=array_merge($fresh['sourceBinding'],$fresh['accounts'][(string)$userid]);
                    if (self::canonical($fresh)!==self::canonical($c)) throw new \invalid_parameter_exception('EXPORT_CONFIG_CHANGED');
                    if ($r->policyhash!==$a['sourcePolicyHash'] || (string)$r->durationms!==$a['durationMs']
                        || (int)$r->filecount!==1 || $r->mediahash!==$r->contenthash || ($r->stateid && $r->statepolicy!==$r->policyhash)) throw new \Exception('UNAVAILABLE');
                    $covered=0;
                    if($r->stateid) {
                        $ranges=json_decode($r->coverage,true); if(!is_array($ranges))throw new \Exception('UNAVAILABLE');
                        foreach($ranges as $range) {
                            if(!is_array($range)||count($range)!==2||!is_int($range[0])||!is_int($range[1])
                                ||$range[0]<0||$range[1]<$range[0]||$range[1]>(int)$r->durationms)throw new \Exception('UNAVAILABLE');
                            $covered+=$range[1]-$range[0];
                        }
                    }
                    $rows[]=array_merge($base,['sourceStatus'=>$r->stateid?'PRESENT':'NO_RECORD','sourcePolicyHash'=>$r->policyhash,
                        'durationMs'=>(string)$r->durationms,'effectiveMs'=>$r->stateid?(string)$r->elapsedms:null,'mediaCoveredMs'=>$r->stateid?(string)$covered:null,
                        'lastPositionMs'=>$r->stateid?(string)$r->positionms:null,'normalCloseAcknowledged'=>$r->stateid?(bool)$r->closedms:false,
                        'closedAtMs'=>$r->stateid&&$r->closedms?(string)$r->closedms:null,'creditDay'=>$r->stateid&&$r->creditday?$r->creditday:null,
                        'sourceReportedCredit'=>$r->stateid?(bool)$r->creditday:false,'providerProgressBps'=>null,'speedCompliance'=>'UNKNOWN',
                        'captureChannel'=>$r->stateid?'LOCAL_CLEARWATCH_ONLINE_PROTOCOL':null]);
                } catch (\Throwable $e) { $rows[]=array_merge($base,['sourceStatus'=>'UNAVAILABLE']); }
            }
            $versions=['clearwatch'=>(string)get_config('local_clearwatch','version'),'clearapi'=>(string)get_config('local_clearapi','version')];
            $fingerprint=self::hash('CLEAR-LOCAL-STATE',['config'=>$c,'versions'=>$versions,'rows'=>$rows]);
            $head=$DB->get_record('local_clearapi_head',compact('userid','courseid'));
            if (!$head) { self::changed($userid,$courseid,'INITIAL_EXPORT'); $head=$DB->get_record('local_clearapi_head',compact('userid','courseid')); }
            if ($head->artifact!=='' && $head->fingerprint===$fingerprint) {
                $cached=json_decode($head->artifact,true);
                if ($cached['validUntil']>=time()) { $tx->allow_commit(); return $cached; }
            }
            if ($head->artifact!=='') { self::changed($userid,$courseid,$head->fingerprint===$fingerprint?'CACHE_REFRESH':'OBSERVED_CHANGE'); $head=$DB->get_record('local_clearapi_head',compact('userid','courseid')); }
            // Upper-second observation bound is explicit; client must wait until
            // that second before freshness checks. Record milliseconds stay exact.
            $observed=(int)ceil(microtime(true)); $revision='r'.$head->generation; $pages=[];
            foreach($rows as &$row) $row['recordRevision']=$revision; unset($row);
            $pageSize=$c['pageSize'];
            for($offset=0;$offset<count($rows);$offset+=$pageSize) {
                $part=array_slice($rows,$offset,$pageSize);
                $pages[]=['pageId'=>'page-'.count($pages),'offset'=>$offset,'rowCount'=>count($part),'pageHash'=>self::hash('CLEAR-LOCAL-PAGE',$part)];
            }
            $cause=$DB->get_field('local_clearapi_audit','causekey',['userid'=>$userid,'courseid'=>$courseid,'generation'=>$head->generation]);
            $artifact=['profile'=>'clear-local-moodle.1','sourceBinding'=>$c['sourceBinding'],'revision'=>$revision,'cause'=>$cause,'sourceVersions'=>$versions,
                'observedAt'=>$observed,'validUntil'=>$observed+300,'periodStart'=>$c['periodStart'],'periodEndExclusive'=>$c['periodEndExclusive'],
                'coverageStart'=>$c['periodStart'],'coverageEndExclusive'=>min($observed,$c['periodEndExclusive']),
                'activitySetHash'=>$c['activitySetHash'],'inventoryVersion'=>$c['inventoryVersion'],'totalRows'=>count($rows),
                'pages'=>$pages,'terminalPageId'=>$pages[count($pages)-1]['pageId'],'labOnly'=>true];
            $artifact['manifestHash']=self::hash('CLEAR-LOCAL-MANIFEST',$artifact); $artifact['rows']=$rows;
            $head->artifact=json_encode($artifact); $head->fingerprint=$fingerprint; $DB->update_record('local_clearapi_head',$head);
            $tx->allow_commit(); return $artifact;
        } catch (\Throwable $e) { if(isset($tx)) $tx->rollback($e); throw $e; } finally { $lock->release(); }
    }
}
