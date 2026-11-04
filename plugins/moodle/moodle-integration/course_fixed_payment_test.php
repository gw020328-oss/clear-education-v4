<?php
namespace local_clearbridge { function get_string($key,$component) { return $key; } }
namespace {
define('MOODLE_INTERNAL',true);
require __DIR__.'/../local_clearbridge/classes/course_read_client.php';
require __DIR__.'/../local_clearbridge/classes/course_payment_display.php';
use local_clearbridge\course_payment_display as Display;
function payment(): array {
 return ['version'=>'clear-moodle-fixed-payment-status.1','requestRef'=>str_repeat('a',64),'mappingRevision'=>1,
 'mappingRef'=>'normal-mapping','role'=>'PARTICIPANT','observedAt'=>100,'expiresAtExclusive'=>105,'displayOnly'=>true,'paymentAuthority'=>false,
 'decision'=>['id'=>'decision-1','revision'=>1,'hash'=>'0x'.str_repeat('b',64),'recordedConditionsStatus'=>'NEEDS_SUPPLEMENT','sourceCurrentness'=>'NOT_RECHECKED'],
 'consent'=>['participant'=>'NOT_RECORDED','operator'=>'NOT_RECORDED','publicationMatchesCurrentDecision'=>false,
 'onchainWalletSignaturesVerified'=>false,'usableForPayment'=>false],
 'receipt'=>['state'=>'NOT_OBSERVED','amountAtoms'=>null,'symbol'=>'TEST','decimals'=>6,'canonical'=>null,'finalized'=>null,
 'transactionHash'=>null,'checkpoint'=>null,'acceptedDecision'=>null]];
}
function evidence():array { return ['decision'=>['id'=>'decision-1','revision'=>1,'recordedConditionsStatus'=>'NEEDS_SUPPLEMENT']]; }
function ok($v,$label) { if(!$v) {throw new \RuntimeException($label);} echo "PASS $label\n"; }
$p=payment();
$view=Display::data($p,evidence(),'PARTICIPANT',100);
ok(($view['decisionstatus']??null)==='nativedecisionsupplement','exact12 payment renders the validated recorded decision');
$old=$p; $old['version']='clear-moodle-payment-status.1'; unset($old['mappingRef']); $old['bindingRef']='binding-1'; $old['bindingRevision']=1;
ok(Display::data($old,evidence(),'PARTICIPANT',100)!==null,'old exact13 payment remains separately accepted');
foreach (['bindingRef'=>'old','bindingRevision'=>1,'payment'=>[],'unknown'=>true] as $k=>$v) {
 $bad=$p; $bad[$k]=$v; ok(Display::data($bad,evidence(),'PARTICIPANT',100)===null,'reject extra/mixed '.$k);
}
$bad=$old; $bad['mappingRef']='normal'; ok(Display::data($bad,evidence(),'PARTICIPANT',100)===null,'old version rejects new field');
$bad=$p; $bad['version']='unknown'; ok(Display::data($bad,evidence(),'PARTICIPANT',100)===null,'unknown version rejected');
ok(Display::data($p,evidence(),'COURSE_OPERATOR',100)===null && Display::data($p,evidence(),'PARTICIPANT',105)===null,'role and exclusive deadline');
foreach (['displayOnly'=>false,'paymentAuthority'=>true,'requestRef'=>'bad','mappingRevision'=>0,'expiresAtExclusive'=>106] as $k=>$v) {
 $bad=$p; $bad[$k]=$v; ok(Display::data($bad,evidence(),'PARTICIPANT',100)===null,'reject boundary '.$k);
}
$bad=$p; $bad['decision']['id']='other'; ok(Display::data($bad,evidence(),'PARTICIPANT',100)===null,'decision must match evidence');
foreach(['decision','consent','receipt'] as $key) {
 $bad=$p; $bad[$key]['privateExtra']='PRIVATE'; ok(Display::data($bad,evidence(),'PARTICIPANT',100)===null,'nested exact '.$key);
}
$p['receipt']=['state'=>'INCLUDED','amountAtoms'=>'100000000','symbol'=>'TEST','decimals'=>6,'canonical'=>true,'finalized'=>false,
 'transactionHash'=>'0x'.str_repeat('c',64),'checkpoint'=>['number'=>'1','hash'=>'0x'.str_repeat('d',64),'time'=>'100'],
 'acceptedDecision'=>['id'=>'decision-1','revision'=>1,'hash'=>'0x'.str_repeat('b',64)]];
$v=Display::data($p,evidence(),'PARTICIPANT',100);
ok($v!==null && !str_contains(json_encode($v),'0x') && !str_contains(json_encode($v),'mapping'),'100 TEST receipt renders without identifiers');
$p['receipt']['amountAtoms']='100000001'; ok(Display::data($p,evidence(),'PARTICIPANT',100)===null,'other amount rejected');
}
