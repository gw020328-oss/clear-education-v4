<?php
// Public protocol vectors; expired fixed times deliberately prevent operational acceptance.
require __DIR__.'/registry_fixture.php';
use function clear_moodle_registry_fixture\public_key;
use function clear_moodle_registry_fixture\seal;
use function clear_synthetic\canonical;
$base=['issuerEpoch'=>'issuer-registry-v1','installationRef'=>'synthetic-moodle','audience'=>'synthetic-clear',
    'trustEpoch'=>1,'notBefore'=>1700000000,'expiresAtExclusive'=>1700000060];
$payloads=[
    ['type'=>'trust',...$base,'controlRevision'=>1,'keyRef'=>'key-a','publicKey'=>public_key('a'),
        'keyNotBefore'=>1700000000,'keyExpiresAtExclusive'=>1700003600,'status'=>'ACTIVE'],
    ['type'=>'roster',...$base,'courseRef'=>'synthetic-course','subjectRef'=>'synthetic-subject','rosterRevision'=>1,'status'=>'ACTIVE'],
    ['type'=>'attempt',...$base,'courseRef'=>'synthetic-course','subjectRef'=>'synthetic-subject','rosterRevision'=>1,
        'attemptRef'=>'synthetic-attempt-vector','bindingScopeHash'=>str_repeat('b',64)],
];
$vectors=[];
foreach($payloads as $p) {
    $label=$p['type']==='trust'?'root':'a';$keyref=$p['type']==='trust'?'root-v1':'key-a';
    $vectors[]=['kind'=>$p['type'],'publicKey'=>public_key($label),'wire'=>seal($p,$label,$keyref),
        'signedBytesSha256'=>hash('sha256',\clear_moodle_registry\signed_bytes($keyref,canonical($p)))];
}
echo json_encode(['mode'=>'PUBLIC_SYNTHETIC_EXPIRED_VECTORS','vectors'=>$vectors],JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES)."\n";
