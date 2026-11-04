<?php
namespace clear_moodle_probe;
require_once __DIR__.'/collector.php';
require_once __DIR__.'/../synthetic-profile/strict_database_candidate.php';
require_once __DIR__.'/guarded_database.php';
require_once __DIR__.'/wire.php';
use function clear_synthetic\require_rule;
use function clear_synthetic\safe_int;
use function clear_synthetic\canonical;

function row($pg,array $profile,int $sessionid,int $now): array {
    global $CFG;
    require_rule(preg_match('/^[a-z][a-z0-9_]*$/D',$CFG->prefix)===1,'PREFIX');
    $t=$profile['target'];
    $sql=str_replace('PREFIX',$CFG->prefix,file_get_contents(__DIR__.'/page.sql'));
    $result=pg_query_params($pg,$sql,[$sessionid,$t['user'],$t['course'],$t['module'],$now]);
    require_rule($result!==false && pg_num_rows($result)===1,'SOURCE_UNAVAILABLE');
    $r=pg_fetch_assoc($result);
    foreach(['sessionid','userid','timecreated','timemodified','generation','revision','timeend','completionrows'] as $field) {
        require_rule(ctype_digit($r[$field]) && strlen($r[$field])<=16,'UNSAFE_INTEGER');
        $r[$field]=safe_int((int)$r[$field]);
    }
    require_rule($r['completionrows']<=1 && ($r['completionstate']===null || in_array($r['completionstate'],['0','1'],true)), 'COMPLETION_STATE');
    require_rule($r['timemodified']<=$now && $now<$r['timemodified']+$profile['cfg']['sessiontimeout'],'SESSION_EXPIRED');
    return $r;
}
function pg_from_config(string $role) {
    global $CFG;
    require_rule(in_array($role,['runtime','reader'],true),'ROLE');
    // Public fixture credentials, supported only by this disposable harness.
    return pg_connect('host='.$CFG->dbhost.' dbname=moodle user=clear_moodle_'.$role.' password=synthetic-'.$role,PGSQL_CONNECT_FORCE_NEW);
}
function mint(guarded_database $handler,string $sid,array $request,array $profile,?callable $barrier=null): array {
    try {
        global $USER,$SESSION,$DB;
        require_rule(!$DB->is_transaction_started(),'OUTER_TRANSACTION');
        require_rule(($_SESSION['USER']??null)===$USER && ($_SESSION['SESSION']??null)===$SESSION,'NATIVE_IDENTITY_LINK');
        wire_request($request,'confirmation');
        require_rule(session_status()===PHP_SESSION_ACTIVE && session_id()===$sid,'NATIVE_SESSION_REQUIRED');
        $encoded=session_encode();
        require_rule(is_string($encoded),'SESSION_ENCODING');
        return mint_locked($handler,$sid,$encoded,$request,$profile,$barrier);
    } finally {
        // End native persistence. This does not freeze PHP globals; the HTTP host must end its action.
        if(session_status()===PHP_SESSION_ACTIVE){session_abort();}
        $handler->close();
    }
}
function mint_locked(guarded_database $handler,string $sid,string $sessionbytes,array $request,array $profile,?callable $barrier=null): array {
    global $DB,$CFG,$USER,$SESSION;
    require_rule(getenv('CLEAR_ACTUAL_MOODLE_PROBE')==='1','SYNTHETIC_ONLY');
    require_rule((int)$USER->id===(int)$profile['target']['user'],'IDENTITY');
    \clear_synthetic\reject_assumed_identity($USER,$_SESSION);
    $check=pg_from_config('reader');
    validate_profile($check,$profile);
    pg_close($check);
    $transaction=$DB->start_delegated_transaction();
    try {
        $authority=(int)$DB->get_field_sql('SELECT clear_probe.lock_authority()');
        $a=(array)$DB->get_record_sql('SELECT * FROM clear_probe.attempts WHERE attemptref=?',[$request['attemptRef']],MUST_EXIST);
        check_attempt($a,$request,$profile,time());
        $s=$DB->get_record_sql('SELECT id,userid,timecreated,timemodified FROM {sessions} WHERE sid=? FOR UPDATE',[$sid],MUST_EXIST);
        require_rule((int)$s->userid===(int)$USER->id,'IDENTITY');
        require_rule($handler->flush_for_confirmation($sid,$sessionbytes,$USER,$_SESSION)===(int)$s->id,'SESSION_RECEIPT');
        // Runtime SELECT stays on the same locked connection. Profile can no longer change and commit.
        $metadata=$DB->get_field_sql('SELECT clear_probe.metadata_pin()');
        require_rule(hash_equals($profile['metadata'],$metadata),'PROFILE_DRIFT');
        $generation=safe_int((int)$DB->get_field_sql('SELECT generation FROM clear_probe.generations WHERE sessionid=?',[$s->id]));
        $check=pg_from_config('reader');
        // Revalidate current source permissions through the fixed actual-Moodle query before issuing.
        // The reader sees the pre-flush session generation until commit. Authority/source gates are fenced.
        $source=row($check,$profile,(int)$s->id,time());
        require_rule($source['revision']===$authority,'AUTHORITY_FENCE');
        pg_close($check);
        if($barrier!==null) {$barrier();} // Available only in this SYNTHETIC_ONLY harness.
        \clear_synthetic\reject_assumed_identity($USER,$_SESSION);
        require_rule(($_SESSION['USER']??null)===$USER && ($_SESSION['SESSION']??null)===$SESSION,'NATIVE_IDENTITY_LINK');
        require_rule((int)$USER->id===(int)$s->userid && session_encode()===$sessionbytes,'SESSION_MEMORY_CHANGED');
        $now=time();
        $expiry=min($now+120,(int)$a['expiry'],(int)$s->timemodified+(int)$profile['cfg']['sessiontimeout']);
        if($source['timeend']>0){$expiry=min($expiry,$source['timeend']);}
        require_rule($now<$expiry,'SESSION_EXPIRED');
        $ref=bin2hex(random_bytes(32));
        $hash=hash('sha256',canonical($profile));
        $DB->get_field_sql('SELECT clear_probe.insert_confirmation(?,?,?,?,?,?,?,?,?,?,?,?)',[
            $ref,$s->id,$USER->id,safe_int($authority),$generation,$hash,$request['issuerEpoch'],$request['bindingScopeHash'],$profile['installationEpoch'],$now,$expiry,$request['attemptRef']]);
        $transaction->allow_commit();
        // Releasing without session_write_close avoids a post-commit memory write from this adapter.
        $handler->close();
        return ['confirmationRef'=>$ref,'expiresAtExclusive'=>$expiry];
    } catch(\Throwable $e) {
        try {$transaction->rollback($e);} finally {$handler->close();}
    }
}
function observe(array $request,array $profile,?callable $snapshotbarrier=null): array {
    return lookup($request,$profile,'observations',$snapshotbarrier);
}
function confirmation(array $request,array $profile,?callable $snapshotbarrier=null): array {
    return lookup($request,$profile,'confirmation',$snapshotbarrier);
}
function lookup(array $request,array $profile,string $kind,?callable $snapshotbarrier=null): array {
    require_rule(getenv('CLEAR_ACTUAL_MOODLE_PROBE')==='1','SYNTHETIC_ONLY');
    wire_request($request,$kind);
    $pg=pg_from_config('reader');
    $start=time();$mono=hrtime(true);
    try {
        require_rule(pg_query($pg,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')!==false,'SNAPSHOT');
        // First SQL read acquires a new snapshot after the request was checked.
        $column=$kind==='confirmation'?'attemptref':'ref';
        $value=$kind==='confirmation'?$request['attemptRef']:$request['confirmationRef'];
        // Conservative lower bound: SQL execution/transfer delay must not make an old snapshot look new.
        $observed=time();
        $result=pg_query_params($pg,'SELECT * FROM clear_probe.confirmations WHERE '.$column.'=$1',[$value]);
        require_rule($result!==false && pg_num_rows($result)===1,'CONFIRMATION');
        $c=pg_fetch_assoc($result);
        if($snapshotbarrier!==null){$snapshotbarrier();}
        require_rule(hash_equals($c['issuer'],$request['issuerEpoch']) && hash_equals($c['scopehash'],$request['bindingScopeHash']) &&
            hash_equals($c['profilehash'],hash('sha256',canonical($profile))) && hash_equals($c['installation'],$profile['installationEpoch']), 'CONFIRMATION_BINDING');
        $ar=pg_query_params($pg,'SELECT * FROM clear_probe.attempts WHERE attemptref=$1',[$c['attemptref']]);
        require_rule($ar!==false && pg_num_rows($ar)===1,'ATTEMPT');
        $a=pg_fetch_assoc($ar);check_attempt($a,$request,$profile,time());
        validate_profile($pg,$profile);
        $r=row($pg,$profile,(int)$c['sessionid'],time());
        require_rule((int)$c['userid']===$r['userid'] && (int)$c['generation']===$r['generation'] && (int)$c['authority']===$r['revision'],'STALE_CONFIRMATION');
        $checked=time();$expiry=min((int)$c['expiry'],(int)$a['expiry'],$r['timemodified']+(int)$profile['cfg']['sessiontimeout']);
        if($r['timeend']>0){$expiry=min($expiry,$r['timeend']);}
        require_rule((int)$c['confirmedat']<=$start && $start<=$observed && $observed<=$checked && $checked-$start<=5 && hrtime(true)-$mono<=5000000000 && $checked<$expiry,'EXPIRED');
        require_rule(pg_query($pg,'COMMIT')!==false,'SNAPSHOT');
        $common=[...response_scope($a),'requestRef'=>$request['requestRef'],'confirmationRef'=>$c['ref'],
            'moodleSessionGeneration'=>hash('sha256',canonical([$profile['installationEpoch'],$r['sessionid'],$r['generation']])),
            'enrolmentRevision'=>$r['revision'],'observedAt'=>$observed,'checkedAt'=>$checked,'expiresAtExclusive'=>$expiry];
        if($kind==='confirmation') {
            return ['version'=>'clear-moodle-confirmation.3','attemptRef'=>$c['attemptref'],
                'accountHint'=>'Synthetic student','confirmedAt'=>(int)$c['confirmedat'],...$common];
        }
        return ['version'=>'clear-moodle-observations.3',...$common,'scope'=>'READ_PREVIEW','sourceStatus'=>'OBSERVED_AT',
            'observations'=>[['targetRef'=>'core-page-manual-mark','status'=>$r['completionstate']==='1'?'COMPLETE':'INCOMPLETE','observedAt'=>$observed]]];
    } finally {pg_close($pg);}
}
