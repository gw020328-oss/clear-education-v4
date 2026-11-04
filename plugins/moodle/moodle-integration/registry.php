<?php
namespace clear_moodle_registry;
require_once __DIR__.'/../synthetic-profile/profile.php';
use function clear_synthetic\require_rule;
use function clear_synthetic\canonical;
use function clear_synthetic\safe_int;

// Owner-side control-plane prototype. Never imported by the Moodle HTTP router or runtime adapter.
function exact(array $value,array $keys): void {
    $actual=array_keys($value);sort($actual);sort($keys);require_rule($actual===$keys,'REGISTRY_SHAPE');
}
function ref($value): void {
    require_rule(is_string($value) && preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/D',$value)===1,'REGISTRY_REF');
}
function payload(array $p): void {
    $common=['type','issuerEpoch','installationRef','audience','trustEpoch','notBefore','expiresAtExclusive'];
    $extra=match($p['type']??null) {
        'trust'=>['controlRevision','keyRef','publicKey','keyNotBefore','keyExpiresAtExclusive','status'],
        'roster'=>['courseRef','subjectRef','rosterRevision','status'],
        'attempt'=>['courseRef','subjectRef','rosterRevision','attemptRef','bindingScopeHash'],
        default=>throw new \RuntimeException('REGISTRY_TYPE'),
    };
    exact($p,[...$common,...$extra]);
    foreach($p as $key=>$value) {
        if(in_array($key,['trustEpoch','notBefore','expiresAtExclusive','controlRevision','keyNotBefore','keyExpiresAtExclusive','rosterRevision'],true)) {
            require_rule(is_int($value) && safe_int($value)>0,'REGISTRY_INTEGER');
        } else if(in_array($key,['publicKey','bindingScopeHash'],true)) {
            require_rule(is_string($value) && preg_match('/^[a-f0-9]{64}$/D',$value)===1,'REGISTRY_HEX');
        } else {ref($value);}
    }
    if(isset($p['status'])){require_rule(in_array($p['status'],['ACTIVE','REVOKED'],true),'REGISTRY_STATUS');}
    $limit=$p['type']==='attempt'?120:86400;
    require_rule($p['expiresAtExclusive']>$p['notBefore'] && $p['expiresAtExclusive']-$p['notBefore']<=$limit,'REGISTRY_WINDOW');
    if($p['type']==='trust') {
        require_rule($p['keyNotBefore']<=$p['notBefore'] && $p['expiresAtExclusive']<=$p['keyExpiresAtExclusive'] &&
            $p['keyExpiresAtExclusive']-$p['keyNotBefore']<=86400,'REGISTRY_WINDOW');
    }
}
function signed_bytes(string $keyref,string $bytes): string {
    return "CLEAR\0REGISTRY\0ED25519\0V1\0".pack('N',strlen($keyref)).$keyref.$bytes;
}
function decode(string $wire): array {
    require_rule(strlen($wire)<=16384,'REGISTRY_SIZE');
    try {$e=json_decode($wire,true,8,JSON_THROW_ON_ERROR);}catch(\Throwable $ignored){throw new \RuntimeException('REGISTRY_ENCODING');}
    require_rule(is_array($e),'REGISTRY_SHAPE');exact($e,['version','keyRef','payload','signature']);
    require_rule($e['version']==='clear-registry-envelope.1' && canonical($e)===$wire,'REGISTRY_ENCODING');ref($e['keyRef']);
    require_rule(is_string($e['payload']) && strlen($e['payload'])<=8192 && is_string($e['signature']) &&
        preg_match('/^[a-f0-9]{128}$/D',$e['signature'])===1,'REGISTRY_ENCODING');
    try {$p=json_decode($e['payload'],true,4,JSON_THROW_ON_ERROR);}catch(\Throwable $ignored){throw new \RuntimeException('REGISTRY_ENCODING');}
    require_rule(is_array($p) && canonical($p)===$e['payload'],'REGISTRY_ENCODING');payload($p);
    return [$e,$p];
}
function query($pg,string $sql,array $params=[]) {
    $result=@pg_query_params($pg,$sql,$params);require_rule($result!==false,'REGISTRY_STORAGE');return $result;
}
function one($pg,string $sql,array $params=[]): array {
    $r=query($pg,$sql,$params);require_rule(pg_num_rows($r)===1,'REGISTRY_MISSING');return pg_fetch_assoc($r);
}
function now($pg): int {return (int)pg_fetch_result(query($pg,'SELECT floor(extract(epoch FROM clock_timestamp()))::bigint'),0,0);}
function window(array $p,int $now): void {require_rule($p['notBefore']<=$now && $now<$p['expiresAtExclusive'],'REGISTRY_TIME');}
function head($pg): array {
    // Same lock order as mint: authority first, then registry/session-dependent state.
    query($pg,'SELECT revision FROM clear_probe.authority WHERE id=1 FOR UPDATE');
    return one($pg,'SELECT * FROM clear_probe.registry_head WHERE id=1 FOR UPDATE');
}
function begin($pg): void {
    require_rule(getenv('CLEAR_ACTUAL_MOODLE_PROBE')==='1','SYNTHETIC_ONLY');
    require_rule(pg_transaction_status($pg)===PGSQL_TRANSACTION_IDLE,'REGISTRY_OUTER_TRANSACTION');
    query($pg,'BEGIN');query($pg,"SET LOCAL lock_timeout='1500ms'");
}
function scope(array $p,array $h): void {
    require_rule($p['issuerEpoch']===$h['issuer'] && $p['installationRef']===$h['installation'] && $p['audience']===$h['audience'],'REGISTRY_SCOPE');
}
function active_key($pg,array $h,array $p,int $time): array {
    require_rule($h['status']==='ACTIVE' && $p['trustEpoch']===(int)$h['trustepoch'] &&
        (int)$h['notbefore']<=$time && $time<(int)$h['expiry'],'REGISTRY_TRUST');
    $k=one($pg,'SELECT * FROM clear_probe.registry_keys WHERE keyref=$1',[$h['keyref']]);
    require_rule($k['status']==='ACTIVE' && (int)$k['trustepoch']===$p['trustEpoch'] &&
        (int)$k['notbefore']<=$time && $time<(int)$k['expiry'] &&
        $p['expiresAtExclusive']<=min((int)$k['expiry'],(int)$h['expiry']),'REGISTRY_KEY');
    return $k;
}
function binding($pg,array $p): array {
    return one($pg,'SELECT * FROM clear_probe.registry_bindings WHERE courseref=$1 AND subjectref=$2 FOR UPDATE',[$p['courseRef'],$p['subjectRef']]);
}
function active_binding(array $b,array $p,array $h,int $time): void {
    require_rule($b['status']==='ACTIVE' && $b['keyref']===$h['keyref'] && (int)$b['trustepoch']===$p['trustEpoch'] &&
        (int)$b['rosterrevision']===$p['rosterRevision'] && (int)$b['notbefore']<=$time && $time<(int)$b['expiry'] &&
        $p['expiresAtExclusive']<=(int)$b['expiry'],'REGISTRY_ROSTER');
}
function verify(array $e,string $public): void {
    require_rule(strlen($public)===64 && ctype_xdigit($public),'REGISTRY_KEY');
    require_rule(sodium_crypto_sign_verify_detached(hex2bin($e['signature']),signed_bytes($e['keyRef'],$e['payload']),hex2bin($public)),'REGISTRY_SIGNATURE');
}
// Only the authenticated B control-plane composition may stage this expected tuple. No public route exists.
function stage($pg,array $expected): void {
    payload($expected);require_rule($expected['type']==='attempt','REGISTRY_TYPE');begin($pg);
    try {
        $h=head($pg);scope($expected,$h);$time=now($pg);window($expected,$time);
        active_key($pg,$h,$expected,$time);$b=binding($pg,$expected);active_binding($b,$expected,$h,$time);
        query($pg,'INSERT INTO clear_probe.registry_pending VALUES($1,$2,\'OPEN\')',[$expected['attemptRef'],canonical($expected)]);
        window($expected,now($pg));query($pg,'COMMIT');
    } catch(\Throwable $e) {@pg_query($pg,'ROLLBACK');throw $e;}
}
function accept($pg,string $wire,?callable $beforecommit=null): string {
    [$e,$p]=decode($wire);begin($pg);
    try {
        $h=head($pg);scope($p,$h);$time=now($pg);window($p,$time);
        if($p['type']==='trust') {
            require_rule($e['keyRef']===$h['rootref'],'REGISTRY_SIGNER');verify($e,$h['rootpublic']);
            require_rule($p['controlRevision']>(int)$h['controlrevision'] && $p['trustEpoch']>=(int)$h['trustepoch'],'REGISTRY_REPLAY');
            $old=query($pg,'SELECT * FROM clear_probe.registry_keys WHERE keyref=$1',[$p['keyRef']]);
            if(pg_num_rows($old)===1) {
                $k=pg_fetch_assoc($old);
                require_rule($p['keyRef']===$h['keyref'] && $p['trustEpoch']===(int)$h['trustepoch'] &&
                    $p['publicKey']===$k['publickey'] && $p['keyNotBefore']===(int)$k['notbefore'] &&
                    $p['keyExpiresAtExclusive']===(int)$k['expiry'] &&
                    ($p['status']==='REVOKED' || $k['status']==='ACTIVE'),'REGISTRY_KEY_REUSE');
            } else {
                require_rule($p['status']==='ACTIVE' && $p['trustEpoch']>(int)$h['trustepoch'] && $p['publicKey']!==$h['rootpublic'],'REGISTRY_ROTATION');
                query($pg,'INSERT INTO clear_probe.registry_keys VALUES($1,$2,$3,$4,$5,\'ACTIVE\')',
                    [$p['keyRef'],$p['publicKey'],$p['trustEpoch'],$p['keyNotBefore'],$p['keyExpiresAtExclusive']]);
            }
            query($pg,"UPDATE clear_probe.registry_keys SET status='REVOKED' WHERE keyref<>$1",[$p['keyRef']]);
            query($pg,'UPDATE clear_probe.registry_keys SET status=$2 WHERE keyref=$1',[$p['keyRef'],$p['status']]);
            query($pg,'UPDATE clear_probe.registry_head SET controlrevision=$1,trustepoch=$2,keyref=$3,status=$4,notbefore=$5,expiry=$6 WHERE id=1',
                [$p['controlRevision'],$p['trustEpoch'],$p['keyRef'],$p['status'],$p['notBefore'],$p['expiresAtExclusive']]);
            query($pg,"UPDATE clear_probe.registry_bindings SET status='REVOKED'");
            query($pg,"UPDATE clear_probe.attempts SET status='REVOKED'");
        } else {
            $k=active_key($pg,$h,$p,$time);require_rule($e['keyRef']===$k['keyref'],'REGISTRY_SIGNER');verify($e,$k['publickey']);
            $b=binding($pg,$p);
            if($p['type']==='roster') {
                require_rule($p['rosterRevision']>(int)$b['rosterrevision'],'REGISTRY_REPLAY');
                query($pg,'UPDATE clear_probe.registry_bindings SET rosterrevision=$3,trustepoch=$4,keyref=$5,status=$6,notbefore=$7,expiry=$8 WHERE courseref=$1 AND subjectref=$2',
                    [$p['courseRef'],$p['subjectRef'],$p['rosterRevision'],$p['trustEpoch'],$k['keyref'],$p['status'],$p['notBefore'],$p['expiresAtExclusive']]);
                query($pg,"UPDATE clear_probe.attempts SET status='REVOKED' WHERE courseref=$1 AND subjectref=$2",[$p['courseRef'],$p['subjectRef']]);
            } else {
                active_binding($b,$p,$h,$time);
                $pending=one($pg,'SELECT * FROM clear_probe.registry_pending WHERE attemptref=$1 FOR UPDATE',[$p['attemptRef']]);
                require_rule($pending['status']==='OPEN' && hash_equals($pending['payload'],$e['payload']),'REGISTRY_PENDING');
                query($pg,'INSERT INTO clear_probe.attempts VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,\'ACTIVE\')',
                    [$p['attemptRef'],$p['issuerEpoch'],$p['bindingScopeHash'],$b['userid'],$b['courseid'],$b['moduleid'],
                        $p['installationRef'],$p['courseRef'],$p['subjectRef'],$p['audience'],$p['rosterRevision'],$p['trustEpoch'],$p['expiresAtExclusive']]);
                query($pg,"UPDATE clear_probe.registry_pending SET status='USED' WHERE attemptref=$1",[$p['attemptRef']]);
            }
        }
        $digest=hash('sha256',$wire);
        query($pg,'INSERT INTO clear_probe.registry_receipts VALUES($1,$2,$3)',[$digest,$p['type'],$time]);
        if($beforecommit!==null){$beforecommit();} // Isolated failure/lock-wait fixture hook only.
        window($p,now($pg));query($pg,'COMMIT');return $digest;
    } catch(\Throwable $error) {@pg_query($pg,'ROLLBACK');throw $error;}
}
