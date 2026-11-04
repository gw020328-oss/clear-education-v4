<?php
require __DIR__.'/observations_route.php';

use function clear_moodle_probe\dispatch_observations;

$request = ['version'=>'clear-moodle-observations.3','requestRef'=>'fresh','issuerEpoch'=>'fixture',
    'bindingScopeHash'=>str_repeat('a',64),'confirmationRef'=>'confirmed'];
$body = json_encode($request, JSON_THROW_ON_ERROR);
$verified = static fn($method,$target,$raw) => $raw === $body ? $request : null;
$unexpected = static function(): never { throw new LogicException('Unexpected callback'); };
$reads = 0;
$reader = static function() use (&$reads): never {
    ++$reads;
    throw new RuntimeException('fixture internal error');
};
$cases = [
    ['GET','/observations',$body,$unexpected,405],
    ['POST','/observations?course=2',$body,$unexpected,404],
    ['POST','/lookup',$body,$unexpected,404],
    ['POST','/observations',str_repeat('x',16385),$unexpected,413],
    ['POST','/observations',$body,null,503],
    ['POST','/observations',$body.' ',$verified,403],
    ['POST','/observations',$body,static fn()=>[...$request,'userid'=>2],403],
    ['POST','/observations',$body,static fn()=>[...$request,'version'=>'clear-moodle-confirmation.3'],403],
];
foreach ($cases as [$method,$target,$input,$auth,$status]) {
    if (dispatch_observations($method,$target,$input,$reader,$auth) !== [$status,['code'=>'REJECTED']] || $reads !== 0) {
        throw new RuntimeException('Expected rejection before source read');
    }
}
if (dispatch_observations('POST','/observations',$body,$reader,$verified) !== [403,['code'=>'REJECTED']] || $reads !== 1) {
    throw new RuntimeException('Expected sanitized reader rejection');
}
$full = ['version'=>'clear-moodle-observations.3','observations'=>[]];
$result = dispatch_observations('POST','/observations',$body,static function(array $actual) use ($request,$full): array {
    if ($actual !== $request) {
        throw new RuntimeException('Request changed');
    }
    return $full;
},$verified);
if ($result !== [200,$full]) {
    throw new RuntimeException('Expected full reader output');
}
echo "PASS 10 isolated observation dispatch checks\n";
