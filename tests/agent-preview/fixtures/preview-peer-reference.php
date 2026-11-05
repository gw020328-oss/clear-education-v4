<?php
// Standalone cross-language reference; synthetic vectors only. No Moodle bootstrap/DB.
$input=json_decode(stream_get_contents(STDIN),true,32,JSON_THROW_ON_ERROR);
function canonical_peer($value):string {
    if(is_array($value) && !array_is_list($value)) {ksort($value,SORT_STRING);$parts=[];foreach($value as $k=>$v)$parts[]=json_encode($k,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR).':'.canonical_peer($v);return '{'.implode(',',$parts).'}';}
    if(is_array($value))return '['.implode(',',array_map('canonical_peer',$value)).']';
    return json_encode($value,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_LINE_TERMINATORS|JSON_THROW_ON_ERROR);
}
$fields=['version','kind','keyRef','sender','receiver','audience','deploymentEpoch','method','path','requestRef','contextRef','sourceHash','proposalHash','bodyHash','issuedAt','expiresAtExclusive','requestHash','status'];
$out=[];
foreach($input['vectors'] as $v){
    $m=$v['meta'];$a=array_keys($m);$b=$fields;sort($a);sort($b);if($a!==$b)throw new Exception('FIELDS');
    $bytes="CLEAR\0PREVIEW\0PEER\0HMAC-SHA256\0V1\0";
    foreach($fields as $f){$s=(string)$m[$f];if(!preg_match('/^[\x20-\x7e]*$/D',$s))throw new Exception('ASCII');$bytes.=pack('N',strlen($s)).$s;}
    $body=base64_decode($v['bodyBase64'],true);if($body===false||hash('sha256',$body)!==$m['bodyHash'])throw new Exception('BODY');
    if(!is_int($v['syntheticKeyByte'])||$v['syntheticKeyByte']!==17)throw new Exception('SYNTHETIC_KEY_ONLY');
    $mac=hash_hmac('sha256',$bytes,str_repeat(chr(17),32));
    $out[]=['signedBytesSha256'=>hash('sha256',$bytes),'wire'=>canonical_peer(['meta'=>$m,'body'=>$v['bodyBase64'],'mac'=>$mac])];
}
echo json_encode(['vectors'=>$out],JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)."\n";
