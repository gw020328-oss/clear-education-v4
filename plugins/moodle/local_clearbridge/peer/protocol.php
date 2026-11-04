<?php
// Prepared C receiver for the pinned clear-preview-peer.1 /observations contract.
namespace local_clearbridge\peer;
const FIELDS = ['version','kind','keyRef','sender','receiver','audience','deploymentEpoch','method','path',
    'requestRef','contextRef','sourceHash','proposalHash','bodyHash','issuedAt','expiresAtExclusive','requestHash','status'];
const ZERO = '0000000000000000000000000000000000000000000000000000000000000000';
function check(bool $ok): void {if (!$ok) {throw new \RuntimeException('REJECTED');}}
function exact(array $value, array $fields): void {$keys=array_keys($value);sort($keys);sort($fields);check($keys===$fields);}
function canonical($value): string {
    if (is_array($value)) {
        check(!array_is_list($value));ksort($value,SORT_STRING);$parts=[];
        foreach ($value as $key=>$item) {$parts[]=json_encode($key,JSON_THROW_ON_ERROR).':'.canonical($item);}
        return '{'.implode(',',$parts).'}';
    }
    return json_encode($value,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_LINE_TERMINATORS|JSON_THROW_ON_ERROR);
}
function metadata(array $m): void {
    exact($m,FIELDS);
    check($m['version']==='clear-preview-peer.1' && in_array($m['kind'],['REQUEST','RESPONSE'],true));
    foreach (['keyRef','sender','receiver','audience','deploymentEpoch','contextRef'] as $f) {
        check(is_string($m[$f]) && preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/D',$m[$f])===1);
    }
    foreach (['requestRef','sourceHash','proposalHash','bodyHash','requestHash'] as $f) {
        check(is_string($m[$f]) && preg_match('/^[a-f0-9]{64}$/D',$m[$f])===1);
    }
    check($m['sender']!==$m['receiver'] && $m['method']==='POST' && $m['path']==='/observations');
    // Required even with a valid MAC, before claiming the replay slot or reading Moodle.
    check($m['proposalHash']!==ZERO);
    foreach (['issuedAt','expiresAtExclusive'] as $f) {check(is_int($m[$f]) && $m[$f]>0 && $m[$f]<=9007199254740991);}
    check($m['expiresAtExclusive']>$m['issuedAt'] && $m['expiresAtExclusive']-$m['issuedAt']<=5);
    check($m['kind']==='REQUEST' ? $m['status']===0 && $m['requestHash']===ZERO : $m['status']===200 && $m['requestHash']!==ZERO);
}
function signing_bytes(array $meta): string {
    metadata($meta);$bytes="CLEAR\0PREVIEW\0PEER\0HMAC-SHA256\0V1\0";
    foreach (FIELDS as $field) {$value=(string)$meta[$field];$bytes.=pack('N',strlen($value)).$value;}
    return $bytes;
}
function encode(array $meta,string $body,string $key): string {
    check(strlen($key)===32 && strlen($body)<=16384 && hash('sha256',$body)===$meta['bodyHash']);
    return canonical(['body'=>base64_encode($body),'mac'=>hash_hmac('sha256',signing_bytes($meta),$key),'meta'=>$meta]);
}
function decode(string $wire,string $key): array {
    check(strlen($wire)<=32768 && strlen($key)===32);
    $value=json_decode($wire,true,16,JSON_THROW_ON_ERROR);
    check(is_array($value) && canonical($value)===$wire);exact($value,['body','mac','meta']);
    check(is_array($value['meta']));metadata($value['meta']);
    check(is_string($value['body']) && strlen($value['body'])<=21848 && is_string($value['mac']) && preg_match('/^[a-f0-9]{64}$/D',$value['mac'])===1);
    $body=base64_decode($value['body'],true);
    check(is_string($body) && strlen($body)<=16384 && base64_encode($body)===$value['body'] && hash('sha256',$body)===$value['meta']['bodyHash']);
    check(hash_equals(hash_hmac('sha256',signing_bytes($value['meta']),$key),$value['mac']));
    return ['meta'=>$value['meta'],'body'=>$body];
}
function validate_pin(array $pin): void {
    exact($pin,['keyRef','sender','receiver','audience','deploymentEpoch','path','origin','maxClockSkewSeconds']);
    foreach (['keyRef','sender','receiver','audience','deploymentEpoch'] as $f) {
        check(is_string($pin[$f]) && preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/D',$pin[$f])===1);
    }
    check($pin['sender']!==$pin['receiver'] && $pin['path']==='/observations' && in_array($pin['maxClockSkewSeconds'],[0,1,2],true));
    // Canonical HTTPS origins only; synthetic HTTP mapping belongs to the test host.
    check(is_string($pin['origin']) && preg_match('~^https://(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])(?::[1-9][0-9]{0,4})?$~D',$pin['origin'])===1);
    $port=parse_url($pin['origin'],PHP_URL_PORT);check($port===null || ($port!==443 && $port<=65535));
}
function window(array $meta,int $now,int $skew): void {
    check($now>0 && $now<=9007199254740991 && in_array($skew,[0,1,2],true));
    check($meta['issuedAt']<=$now+$skew && $now-$meta['issuedAt']+$skew<5 && $now<$meta['expiresAtExclusive']-$skew);
}
function pinned(array $meta,array $pin): void {
    validate_pin($pin);check($meta['kind']==='REQUEST');
    foreach (['keyRef','sender','receiver','audience','deploymentEpoch','path'] as $f) {check($meta[$f]===$pin[$f]);}
}
final class ReplayStore {
    private \SQLite3 $db;
    private $clock;
    public function __construct(string $path,?callable $clock=null) {
        check(str_starts_with($path,'/'));$dir=dirname($path);$s=lstat($dir);
        check($s!==false && is_dir($dir) && !is_link($dir) && realpath($dir)===$dir && $s['uid']===posix_geteuid() && ($s['mode']&0777)===0700);
        if (file_exists($path) || is_link($path)) {
            $s=lstat($path);check(is_file($path) && !is_link($path) && $s['nlink']===1 && $s['uid']===posix_geteuid() && ($s['mode']&0777)===0600);
        }
        $old=umask(0077);
        try {$this->db=new \SQLite3($path,SQLITE3_OPEN_READWRITE|SQLITE3_OPEN_CREATE);} finally {umask($old);}
        clearstatcache(true,$path);$s=lstat($path);
        check(is_file($path) && !is_link($path) && $s['nlink']===1 && $s['uid']===posix_geteuid() && ($s['mode']&0777)===0600);
        $this->db->enableExceptions(true);$this->db->busyTimeout(1000);
        $this->db->exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
            CREATE TABLE IF NOT EXISTS peer_floor(id INTEGER PRIMARY KEY CHECK(id=1),value INTEGER NOT NULL) STRICT;
            INSERT OR IGNORE INTO peer_floor VALUES(1,0);
            CREATE TABLE IF NOT EXISTS peer_seen(id TEXT PRIMARY KEY,expires INTEGER NOT NULL) STRICT;');
        $this->clock=$clock??static fn()=>time();
    }
    public function claim(array $meta,int $skew): void {
        $this->db->exec('BEGIN EXCLUSIVE');$transaction=true;
        try {
            $now=($this->clock)();window($meta,$now,$skew);
            check($now >= $this->db->querySingle('SELECT value FROM peer_floor WHERE id=1'));
            $tuple=[];foreach (['kind','keyRef','sender','receiver','audience','deploymentEpoch','path','requestRef'] as $field) {$tuple[]=$meta[$field];}
            $id=hash('sha256',json_encode($tuple,JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR));
            $q=$this->db->prepare('DELETE FROM peer_seen WHERE expires < ?');$q->bindValue(1,$now,SQLITE3_INTEGER);$q->execute();
            $q=$this->db->prepare('INSERT OR IGNORE INTO peer_seen VALUES(?,?)');$q->bindValue(1,$id,SQLITE3_TEXT);$q->bindValue(2,$meta['expiresAtExclusive']+2,SQLITE3_INTEGER);$q->execute();check($this->db->changes()===1);
            $q=$this->db->prepare('UPDATE peer_floor SET value=? WHERE id=1');$q->bindValue(1,$now,SQLITE3_INTEGER);$q->execute();
            $this->db->exec('COMMIT');$transaction=false;
            $final=($this->clock)();check($final>=$now);window($meta,$final,$skew);
        } finally {if ($transaction) {$this->db->exec('ROLLBACK');}}
    }
    public function close(): void {$this->db->close();}
}
function accept(string $wire,string $key,array $pin,ReplayStore $replay): array {
    $request=decode($wire,$key);pinned($request['meta'],$pin);
    $replay->claim($request['meta'],$pin['maxClockSkewSeconds']);return $request;
}
function response(array $request,string $body,string $key,array $pin,int $now,int $expiry): string {
    $m=$request['meta'];pinned($m,$pin);window($m,$now,$pin['maxClockSkewSeconds']);
    return encode([...$m,'kind'=>'RESPONSE','sender'=>$pin['receiver'],'receiver'=>$pin['sender'],
        'bodyHash'=>hash('sha256',$body),'issuedAt'=>$now,'expiresAtExclusive'=>min($m['expiresAtExclusive'],$expiry),
        'requestHash'=>hash('sha256',signing_bytes($m)),'status'=>200],$body,$key);
}
