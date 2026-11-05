<?php
$tests = 0;
function runCase($name,$changes,$action,$success,$scope=null) {
    global $tests;
    file_put_contents('/activity-reader-scope.json',json_encode($scope ?? ['serviceId'=>2,'userId'=>3]));
    @unlink('/scratch/token-state.json');
    for ($attempt=0; $attempt < ($success ? 2 : 1); $attempt++) {
    @unlink('/scratch/result.json');
    $pipes=[];
    $p=proc_open([PHP_BINARY,'/reader.php'],[['pipe','r'],['pipe','w'],['pipe','w']],$pipes,null,['READER_CASE'=>json_encode($changes)]);
    fwrite($pipes[0],json_encode(['action'=>$action,'token'=>str_repeat('a',32)])); fclose($pipes[0]);
    $out=stream_get_contents($pipes[1]); fclose($pipes[1]);
    $err=stream_get_contents($pipes[2]); fclose($pipes[2]); $exit=proc_close($p);
    $r=json_decode(file_get_contents('/scratch/result.json'),true);
    $ok=$success ? ($exit===0 && $out==='{"revoked":true}' && $r['deletes']===[['token'=>str_repeat('a',32),'externalserviceid'=>2,'userid'=>3]] && $r['remaining']===3)
        : ($exit!==0 && $r['deletes']===[] && $r['remaining']===4);
    if (!$ok) { fwrite(STDERR,"FAIL $name\n"); exit(1); }
    }
    echo "PASS $name\n"; $tests++;
}
foreach (['membershipLost','roleLost','enrolLost','suspended','deleted'] as $loss) {
    runCase("revoke after $loss",[$loss=>true],'revoke',true);
    foreach (['prepare','issue'] as $action) runCase("$action rejects $loss",[$loss=>true],$action,false);
}
runCase('wrong service',[],'revoke',false,['serviceId'=>9,'userId'=>3]);
runCase('wrong user',[],'revoke',false,['serviceId'=>2,'userId'=>9]);
runCase('wrong origin',['origin'=>'https://wrong.invalid'],'revoke',false);
runCase('wrong dbhost',['dbhost'=>'wrong'],'revoke',false);
echo "$tests real PHP cases passed (isolated DB doubles; no live service).\n";
