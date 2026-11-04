<?php
// Run in a separate CLI process from the native HTTP server. Cookies stay in this process only.
if(getenv('CLEAR_ACTUAL_MOODLE_PROBE')!=='1' || getenv('CLEAR_HTTP_LIFECYCLE_PROBE')!=='1'){exit(1);}
$checks=0;
function check(bool $ok,string $name): void {
    global $checks;
    if(!$ok){fwrite(STDERR,"FAIL $name\n");exit(1);}
    $checks++;echo "PASS $name\n";
}
function fixture(string $op): array {
    $p=proc_open([PHP_BINARY,__DIR__.'/http_fixture.php',$op],[1=>['pipe','w'],2=>['pipe','w']],$pipes);
    $out=stream_get_contents($pipes[1]);$err=stream_get_contents($pipes[2]);
    fclose($pipes[1]);fclose($pipes[2]);$code=proc_close($p);
    check($code===0 && $err==='',"CLI $op remains isolated");
    return json_decode($out,true,512,JSON_THROW_ON_ERROR);
}
function call_http(string $path,array &$jar,?array $body=null,string $method='POST',array $extraheaders=[]): array {
    $headers=['Content-Type: application/json',...$extraheaders];
    if($jar){$headers[]='Cookie: '.implode('; ',array_map(fn($k,$v)=>"$k=$v",array_keys($jar),array_values($jar)));}
    $context=stream_context_create(['http'=>['method'=>$method,'header'=>implode("\r\n",$headers),
        'content'=>$body===null?'':json_encode($body),'ignore_errors'=>true,'follow_location'=>0,'timeout'=>60]]);
    $text=file_get_contents('http://127.0.0.1:18765'.$path,false,$context);
    $cookie=false;$location=null;$secureattrs=true;
    foreach($http_response_header as $h) {
        if(preg_match('/^Set-Cookie: ([^=]+)=([^;]*)(.*)$/i',$h,$m)) {
            $jar[$m[1]]=$m[2];$cookie=true;
            $secureattrs=$secureattrs && stripos($m[3],'httponly')!==false && stripos($m[3],'samesite')!==false;
        }
        if(str_starts_with($h,'Location: ')){$location=substr($h,10);}
    }
    preg_match('/^HTTP\/\S+ (\d+)/',$http_response_header[0],$m);
    return ['status'=>(int)$m[1],'data'=>json_decode($text,true),'text'=>$text,'cookie'=>$cookie,'attrs'=>$secureattrs,'location'=>$location];
}
function rejected(array $r,string $name): void {
    check($r['status']===403 && $r['text']==='{"ok":false,"code":"REJECTED"}' && !$r['cookie'],$name.' / fixed error without session or cookie');
}
function client(): array {
    $jar=[];$r=call_http('/session',$jar,null,'GET');
    check($r['status']===200 && $r['data']['result']['loggedIn']===false && $r['cookie'] && $r['attrs'],'native anonymous cookie / HttpOnly SameSite');
    $old=$jar;$key=$r['data']['result']['sesskey'];
    $r=call_http('/fixture-login',$jar,['sesskey'=>$key]);
    check($r['status']===200 && ($r['data']['result']['loggedIn']??false) && $old!==$jar,'manager login regenerates anonymous cookie');
    $stale=call_http('/session',$old,null,'GET');
    check($stale['data']['result']['loggedIn']===false,'old anonymous cookie cannot acquire logged-in identity');
    return [$jar,$r['data']['result']['sesskey']];
}
function lookup(array $request): array {$jar=[];return call_http('/lookup',$jar,['request'=>$request]);}
function inspect_attempt(array $request): ?array {
    foreach(fixture('inspect')['rows'] as $row){if($row['attemptref']===$request['attemptRef']){return $row;}}
    return null;
}
function confirm(array &$jar,string $key,array $request,string $mode='normal'): array {
    return call_http('/confirm',$jar,['sesskey'=>$key,'confirm'=>true,'request'=>$request,'fixtureCase'=>$mode]);
}
$requests=fixture('prepare');
[$jar,$key]=client();
rejected(lookup($requests['normal']),'lookup before explicit confirmation fails closed');
check(inspect_attempt($requests['normal'])===null,'lookup cannot mint');
rejected(call_http('/confirm',$jar,null,'GET'),'GET cannot confirm');
rejected(call_http('/confirm',$jar,['request'=>$requests['csrf'],'confirm'=>true]),'missing sesskey');
rejected(call_http('/confirm',$jar,['request'=>$requests['csrf'],'confirm'=>true,'sesskey'=>'wrong-key']),'wrong sesskey');
rejected(call_http('/confirm',$jar,['request'=>$requests['csrf'],'sesskey'=>$key]),'missing explicit consent');
$anonymous=[];
rejected(confirm($anonymous,$key,$requests['csrf']),'cross-session sesskey');
check(inspect_attempt($requests['csrf'])===null,'CSRF failures issue nothing');

foreach(['nested','rollback'] as $mode) {
    rejected(confirm($jar,$key,$requests[$mode],$mode),$mode.' transaction');
    check(json_decode(file_get_contents('/tmp/clear-http-rollback.json'),true)===['unchanged'=>true],$mode.' rollback preserves exact persistent session bytes');
    check(inspect_attempt($requests[$mode])===null,$mode.' cannot commit a confirmation');
    rejected(lookup($requests[$mode]),$mode.' cannot resurrect authority via lookup');
    $r=call_http('/session',$jar,null,'GET');
    check($r['data']['result']['loggedIn']===true,$mode.' preserves original login after rollback');
}

foreach(['normal','redirect','shutdown'] as $mode) {
    // Each successful confirmation has a distinct core-managed native session.
    [$jar,$key]=client();
    if(file_exists('/tmp/clear-http-terminal.json')){unlink('/tmp/clear-http-terminal.json');}
    $r=confirm($jar,$key,$requests[$mode],$mode);
    check($r['status']===($mode==='redirect'?303:200) && ($r['data']['ok']??false),$mode.' explicit confirmation succeeds');
    if($mode==='redirect') {check($r['location']==='/done','redirect target has no session/confirmation data');}
    $before=inspect_attempt($requests[$mode]);
    check($before!==null && $before['confirmedgeneration']===$before['currentgeneration'],$mode.' persists final generation');
    $terminal=json_decode(file_get_contents('/tmp/clear-http-terminal.json'),true);
    check($terminal===['nativeClosed'=>true,'restartBlocked'=>true,'handlerOpenBlocked'=>true,'handlerWriteBlocked'=>true],$mode.' native restart and shutdown persistence sealed');
    $found=lookup($requests[$mode]);
    check($found['status']===200 && ($found['data']['ok']??false) && !$found['cookie'],$mode.' read-only lookup succeeds without session creation');
    $after=inspect_attempt($requests[$mode]);
    check($before===$after,$mode.' response / lookup leaves persisted bytes and generation unchanged');
    if($mode==='normal') {
        check(in_array('timemodified',$r['data']['result']['fixtureTrackingFields'],true),'first reuse manager metadata receipt advances before mint');
        $delayed=fixture('delay');
        check($delayed['response']['checkedAt']-$delayed['response']['observedAt']>=3 &&
            $delayed['received']['mono']-$delayed['started']['mono']<5000,'SQL return delay remains part of snapshot age within five-second limit');
    }
    rejected(confirm($jar,$key,$requests[$mode]),$mode.' repeated explicit confirmation cannot replay');
}

foreach(['logout','regenerate','mutation'] as $mode) {
    [$jar,$key]=client();
    $r=confirm($jar,$key,$requests[$mode]);
    check(($r['data']['ok']??false) && lookup($requests[$mode])['status']===200,$mode.' baseline confirmation valid');
    $old=$jar;
    $r=call_http('/'.($mode==='mutation'?'mutate':$mode),$jar,['sesskey'=>$key]);
    check(($r['data']['ok']??false),$mode.' core manager action succeeds');
    rejected(lookup($requests[$mode]),$mode.' invalidates prior confirmation');
    $row=inspect_attempt($requests[$mode]);
    if($mode==='mutation') {
        check((int)$row['currentgeneration']>(int)$row['confirmedgeneration'],'persisted role-switch advances generation');
    } else {
        check($jar!==$old && (int)$row['sessionexists']===0,$mode.' removes old row and changes cookie');
        $r=call_http('/session',$old,null,'GET');
        check($r['data']['result']['loggedIn']===false,$mode.' old cookie cannot revive authenticated session');
        rejected(lookup($requests[$mode]),$mode.' old cookie request cannot revive confirmation');
    }
}
foreach(['idle','ip','external-data','external-identity'] as $mode) {
    [$jar,$key]=client();
    $r=call_http('/confirm',$jar,['sesskey'=>$key,'confirm'=>true,'request'=>$requests[$mode]],'POST',['X-Clear-Fixture: '.$mode]);
    if(in_array($mode,['idle','ip'],true)) {
        check(($r['data']['ok']??false) && lookup($requests[$mode])['status']===200,$mode.' manager metadata update allows confirmation');
        check(in_array($mode==='idle'?'timemodified':'lastip',$r['data']['result']['fixtureTrackingFields'],true),$mode.' uses actual manager update_session receipt');
    } else {
        rejected($r,$mode.' between read and manager metadata update');
        check(inspect_attempt($requests[$mode])===null,$mode.' cannot be laundered by metadata receipt');
    }
}
echo "PASS $checks HTTP lifecycle checks\n";
