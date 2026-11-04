<?php
namespace clear_moodle_registry_fixture;
require_once __DIR__.'/registry.php';
use function clear_synthetic\canonical;

// Public deterministic test seeds. These labels must never be used for operational keys.
function key(string $label): string {
    if(!in_array($label,['root','a','b','c','alien'],true)){throw new \RuntimeException('FIXTURE_KEY');}
    return sodium_crypto_sign_seed_keypair(hash('sha256','CLEAR PUBLIC SYNTHETIC REGISTRY FIXTURE '.$label,true));
}
function public_key(string $label): string {
    $pair=key($label);$public=bin2hex(sodium_crypto_sign_publickey($pair));sodium_memzero($pair);return $public;
}
function seal(array $payload,string $label,string $keyref): string {
    return seal_bytes(canonical($payload),$label,$keyref);
}
function seal_bytes(string $bytes,string $label,string $keyref): string {
    $pair=key($label);$secret=sodium_crypto_sign_secretkey($pair);
    $signature=bin2hex(sodium_crypto_sign_detached(\clear_moodle_registry\signed_bytes($keyref,$bytes),$secret));
    sodium_memzero($secret);sodium_memzero($pair);
    return canonical(['version'=>'clear-registry-envelope.1','keyRef'=>$keyref,'payload'=>$bytes,'signature'=>$signature]);
}
function owner() {
    return pg_connect('host=clear-actual-db dbname=moodle user=moodle password=isolatedtest',PGSQL_CONNECT_FORCE_NEW);
}
function common(string $type,int $epoch=1): array {
    return ['type'=>$type,'issuerEpoch'=>'issuer-registry-v1','installationRef'=>'synthetic-moodle',
        'audience'=>'synthetic-clear','trustEpoch'=>$epoch,'notBefore'=>time()-1,'expiresAtExclusive'=>time()+($type==='trust'?3600:1800)];
}
function trust(string $label,int $epoch,int $revision): array {
    return [...common('trust',$epoch),'controlRevision'=>$revision,'keyRef'=>'key-'.$label,'publicKey'=>public_key($label),
        'keyNotBefore'=>time()-10,'keyExpiresAtExclusive'=>time()+7200,'status'=>'ACTIVE'];
}
function roster(int $revision,int $epoch=1): array {
    return [...common('roster',$epoch),'courseRef'=>'synthetic-course','subjectRef'=>'synthetic-subject','rosterRevision'=>$revision,'status'=>'ACTIVE'];
}
function attempt(int $revision=1,int $epoch=1): array {
    return [...common('attempt',$epoch),'expiresAtExclusive'=>time()+100,'courseRef'=>'synthetic-course',
        'subjectRef'=>'synthetic-subject','rosterRevision'=>$revision,'attemptRef'=>bin2hex(random_bytes(16)),
        'bindingScopeHash'=>str_repeat('b',64)];
}
