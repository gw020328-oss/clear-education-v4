<?php
namespace clear_moodle_probe;
use function clear_synthetic\require_rule;
use function clear_synthetic\safe_int;

// Input rules mirror the pinned B .3 contract. Identity and policy come from the server registry.
function wire_request(array $request,string $kind): void {
    $fields=$kind==='confirmation'
        ? ['version','attemptRef','requestRef','issuerEpoch','bindingScopeHash']
        : ['version','requestRef','issuerEpoch','bindingScopeHash','confirmationRef'];
    $keys=array_keys($request);sort($keys);sort($fields);
    require_rule($keys===$fields && $request['version']==='clear-moodle-'.$kind.'.3','REQUEST');
    require_rule(strlen(json_encode($request,JSON_THROW_ON_ERROR))<=16384,'REQUEST');
    foreach($fields as $field) {
        if($field==='version'){continue;}
        $pattern=$field==='bindingScopeHash'?'/^[a-f0-9]{64}$/D':'/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/D';
        require_rule(is_string($request[$field]) && preg_match($pattern,$request[$field])===1,'REQUEST');
    }
}
function check_attempt(array $a,array $request,array $profile,int $now): void {
    require_rule($a['issuer']===$request['issuerEpoch'] && $a['scopehash']===$request['bindingScopeHash'] &&
        $a['status']==='ACTIVE' && $now<(int)$a['expiry'] &&
        (int)$a['userid']===(int)$profile['target']['user'] &&
        (int)$a['courseid']===(int)$profile['target']['course'] &&
        (int)$a['moduleid']===(int)$profile['target']['module'],'ATTEMPT_BINDING');
    foreach(['installationref','courseref','subjectref','audience'] as $field) {
        require_rule(preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/D',$a[$field])===1,'REGISTRY_REF');
    }
    foreach(['rosterrevision','trustepoch','expiry'] as $field) {
        require_rule(ctype_digit((string)$a[$field]) && strlen((string)$a[$field])<=16 && safe_int((int)$a[$field])>0,'REGISTRY_INTEGER');
    }
}
function response_scope(array $a): array {
    return ['installationRef'=>$a['installationref'],'courseRef'=>$a['courseref'],
        'subjectRef'=>$a['subjectref'],'audience'=>$a['audience'],'issuerEpoch'=>$a['issuer'],
        'trustEpoch'=>(int)$a['trustepoch'],'rosterRevision'=>(int)$a['rosterrevision'],'bindingScopeHash'=>$a['scopehash']];
}
