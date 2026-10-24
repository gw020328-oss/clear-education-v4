<?php
// Owned CLI only. Token material travels over private stdin/stdout, never argv/log/report.
define('CLI_SCRIPT',true);require('/var/www/html/config.php');require_once($CFG->libdir.'/externallib.php');
if($CFG->wwwroot!=='http://127.0.0.1:18768')throw new Exception('E6_LAB_ONLY');
$f=json_decode(file_get_contents('/lab-runtime/fixture.json'),true);
$r=json_decode(stream_get_contents(STDIN),true);$action=$r['action']??'';
if($action==='issue'){
 $c=$f['credentials'][$r['participant']??''][$r['mode']??'']??null;if(!$c)throw new Exception('OWNED_SERVICE_REQUIRED');
 if(!$DB->get_field('external_services','enabled',['id'=>$c['serviceId']]))throw new Exception('SERVICE_DISABLED');
 $until=time()+60;$token=external_generate_token(EXTERNAL_TOKEN_PERMANENT,$c['serviceId'],$c['userId'],context_system::instance(),$until);
 echo json_encode(['token'=>$token,'expiresAtMs'=>$until*1000]);
}else if($action==='revoke'){
 $token=$r['token']??'';if(!preg_match('/^[a-f0-9]{32}$/',$token))throw new Exception('TOKEN_SHAPE');
 $owned=$DB->get_record('external_tokens',['token'=>$token]);if($owned&&!in_array($owned->externalserviceid,$f['services']))throw new Exception('NOT_OWNED');
 $DB->delete_records('external_tokens',['token'=>$token]);echo '{"revoked":true}';
}else if($action==='audit'){
 $n=0;foreach($f['services'] as $sid)$n+=$DB->count_records('external_tokens',['externalserviceid'=>$sid]);echo json_encode(['activeTokens'=>$n]);
}else throw new Exception('ACTION');
