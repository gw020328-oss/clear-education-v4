<?php
require __DIR__.'/../local_clearbridge/peer/protocol.php';
use function local_clearbridge\peer\{check,canonical,encode,decode,accept,response,signing_bytes};
use local_clearbridge\peer\ReplayStore;
$count=0;
function test(string $name,callable $f): void {global $count;$f();$count++;echo "PASS $name\n";}
function denied(callable $f): void {try {$f();} catch (Throwable $e) {return;}throw new Exception('EXPECTED_REJECTION');}
function rawwire(array $m,string $body,string $key): string {
    $bytes="CLEAR\0PREVIEW\0PEER\0HMAC-SHA256\0V1\0";
    foreach (\local_clearbridge\peer\FIELDS as $f) {$s=(string)$m[$f];$bytes.=pack('N',strlen($s)).$s;}
    return canonical(['body'=>base64_encode($body),'meta'=>$m,'mac'=>hash_hmac('sha256',$bytes,$key)]);
}
$fixture=json_decode(file_get_contents($argv[1]),true,32,JSON_THROW_ON_ERROR);$key=str_repeat(chr(17),32);
foreach ($fixture['vectors'] as $i=>$v) {
    if ($v['meta']['path']!=='/observations') {continue;}
    test("B exact vector $i",static function()use($v,$key){check(hash('sha256',signing_bytes($v['meta']))===$v['signedBytesSha256']);check(encode($v['meta'],base64_decode($v['bodyBase64']),$key)===$v['wire']);check(decode($v['wire'],$key)['meta']==$v['meta']);});
}
$m=$fixture['vectors'][0]['meta'];$body=base64_decode($fixture['vectors'][0]['bodyBase64']);$now=$m['issuedAt'];
$pin=array_intersect_key($m,array_flip(['keyRef','sender','receiver','audience','deploymentEpoch','path']))+['origin'=>'https://synthetic.invalid','maxClockSkewSeconds'=>0];
$dir=sys_get_temp_dir().'/clear-peer-'.bin2hex(random_bytes(8));mkdir($dir,0700);$path=$dir.'/replay.sqlite';
$clock=static function()use(&$now){return $now;};$store=new ReplayStore($path,$clock);$wire=encode($m,$body,$key);
try {
    foreach (['proposalHash'=>\local_clearbridge\peer\ZERO,'deploymentEpoch'=>'epoch-other','sender'=>'other','receiver'=>'other','audience'=>'other','path'=>'/v1/preview/execute','keyRef'=>'other','method'=>'GET','kind'=>'RESPONSE'] as $field=>$value) {
        test("valid MAC wrong $field",static fn()=>denied(static fn()=>accept(rawwire([...$m,$field=>$value],$body,$key),$key,$pin,$store)));
    }
    foreach (['whitespace'=>' '.$wire,'extra'=>substr($wire,0,-1).',"x":0}','duplicate'=>str_replace('"body":','"body":"x","body":',$wire),'alias'=>str_replace('"meta":','"m\\u0065ta":',$wire),'exponent'=>str_replace((string)$now,($now/1000).'e3',$wire),'bad MAC'=>substr_replace($wire,'0',strpos($wire,'"mac":"')+7,1),'invalid UTF8'=>"\xff".$wire] as $name=>$bad) {
        test($name,static fn()=>denied(static fn()=>accept($bad,$key,$pin,$store)));
    }
    test('hex-text key rejected',static fn()=>denied(static fn()=>decode($wire,bin2hex($key))));
    test('valid request after rejected zero/pin/canonical inputs',static fn()=>check(accept($wire,$key,$pin,$store)['body']===$body));
    test('replay same process',static fn()=>denied(static fn()=>accept($wire,$key,$pin,$store)));
    $store->close();$store=new ReplayStore($path,$clock);
    test('replay survives reopen',static fn()=>denied(static fn()=>accept($wire,$key,$pin,$store)));
    test('response binds original request bytes',static function()use($wire,$key,$pin,$now){$r=decode($wire,$key);$out=decode(response($r,'{}',$key,$pin,$now,$now+100),$key);check($out['meta']['requestHash']===hash('sha256',signing_bytes($r['meta'])) && $out['meta']['expiresAtExclusive']===$now+5 && $out['meta']['sender']==='C');});
    $fresh=[...$m,'requestRef'=>str_repeat('f',64)];
    $now=$m['issuedAt']+5;test('exclusive expiry',static fn()=>denied(static fn()=>accept(encode($fresh,$body,$key),$key,$pin,$store)));
    $now=$m['issuedAt']-1;test('wall clock rollback',static fn()=>denied(static fn()=>accept(encode([...$fresh,'issuedAt'=>$now,'expiresAtExclusive'=>$now+5],$body,$key),$key,$pin,$store)));
    $store->close();
    $now=$m['issuedAt'];$calls=0;$store=new ReplayStore($path,static function()use(&$calls,$now){return $now+(++$calls===1?0:5);});
    test('durable commit crossing expiry rejects',static fn()=>denied(static fn()=>accept(encode($fresh,$body,$key),$key,$pin,$store)));
    $store->close();$store=new ReplayStore($path,$clock);
    test('commit-crossed request stays spent',static fn()=>denied(static fn()=>accept(encode($fresh,$body,$key),$key,$pin,$store)));
    test('world-readable replay DB denied',static function()use($path){chmod($path,0644);clearstatcache();try{denied(static fn()=>new ReplayStore($path));}finally{chmod($path,0600);clearstatcache();}});
    test('symlink replay DB denied',static function()use($path,$dir){symlink($path,$dir.'/link');try{denied(static fn()=>new ReplayStore($dir.'/link'));}finally{unlink($dir.'/link');}});
} finally {$store->close();foreach(glob($dir.'/*') as $file){unlink($file);}rmdir($dir);}
echo "TOTAL $count PASS\n";
