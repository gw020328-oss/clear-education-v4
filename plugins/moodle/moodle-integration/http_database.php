<?php
namespace clear_moodle_probe;
use function clear_synthetic\require_rule;

// Manager lifecycle extension for isolated synthetic HTTP tests, not a deployed plugin.
final class http_database extends guarded_database {
    public static ?self $instance=null;
    private bool $sealed=false;
    private bool $newsession=false;
    public array $trackingFields=[];

    public function __construct() {
        require_rule(getenv('CLEAR_HTTP_LIFECYCLE_PROBE')==='1','SYNTHETIC_ONLY');
        parent::__construct();self::$instance=$this;
    }
    private function live(): void {require_rule(!$this->sealed,'SESSION_SEALED');}
    public function open(string $path,string $name): bool {
        $this->live();return parent::open($path,$name);
    }
    public function read(string $sid): string|false {
        $this->live();
        try {
            require_rule($this->requires_write_lock() && $this->recordid===null,'SESSION_LOCK_REQUIRED');
            if(!$this->database->record_exists('sessions',['sid'=>$sid])) {
                // Core manager owns creation and regeneration; an empty read grants no identity.
                $this->newsession=true;$this->readgeneration=null;$this->failed=false;
                return '';
            }
            $this->newsession=false;
            require_once __DIR__.'/http_faults.php';
            http_read_fixture($sid,'before');
            $bytes=parent::read($sid);
            http_read_fixture($sid,'after');
            return $bytes;
        } catch(\Throwable $e) {$this->failed=true;$this->close();throw new \RuntimeException('SESSION_READ');}
    }
    public function add_session(int $userid): \stdClass {
        $this->live();
        require_rule($this->newsession && $this->recordid===null,'SESSION_CREATION');
        try {
            $record=parent::add_session($userid);
            $this->database->get_session_lock($record->id,$this->acquiretimeout);
            $this->recordid=(int)$record->id;
            $this->readgeneration=$this->generation();$this->newsession=false;
            return $record;
        } catch(\Throwable $e) {$this->failed=true;$this->close();throw new \RuntimeException('SESSION_CREATION');}
    }
    private function generation(): int {
        return (int)$this->database->get_field_sql('SELECT generation FROM clear_probe.generations WHERE sessionid=?',[$this->recordid]);
    }
    public function update_session(\stdClass $record): bool {
        $this->live();
        require_rule($this->requires_write_lock() && !$this->database->is_transaction_started(),'SESSION_TRACKING');
        require_rule(array_diff(array_keys((array)$record),['id','userid','lastip','timemodified'])===[] &&
            (int)($record->id??0)===$this->recordid,'SESSION_TRACKING');
        $tx=$this->database->start_delegated_transaction();
        try {
            // Lock before checking: a writer that bypasses the advisory session lock cannot slip
            // a sessdata/identity update between our generation check and the metadata receipt.
            $s=$this->database->get_record_sql('SELECT s.id,s.userid,g.generation FROM {sessions} s
                JOIN clear_probe.generations g ON g.sessionid=s.id WHERE s.id=? FOR UPDATE OF s',[$this->recordid],MUST_EXIST);
            require_rule((int)$s->generation===$this->readgeneration &&
                (!isset($record->userid) || (int)$record->userid===(int)$s->userid),'SESSION_TRACKING');
            $result=parent::update_session($record);
            $next=$this->generation();
            require_rule($result && $next===$this->readgeneration+1,'SESSION_TRACKING');
            $tx->allow_commit();$this->readgeneration=$next;
            $this->trackingFields=array_values(array_diff(array_keys((array)$record),['id','userid']));
            return true;
        } catch(\Throwable $e) {
            $this->failed=true;
            $tx->rollback(new \RuntimeException('SESSION_TRACKING'));
        }
    }
    public function write(string $id,string $data): bool {
        if($this->sealed){return false;}
        return parent::write($id,$data);
    }
    public function destroy(string $id): bool {
        $this->live();
        try {
            // Do not inherit the core callback's exception/SQL logging path.
            $record=$this->database->get_record('sessions',['sid'=>$id],'id');
            if($record) {$this->database->delete_records('sessions',['id'=>$record->id]);}
            if($id===session_id() || ($record && (int)$record->id===$this->recordid)) {
                $this->close();$this->readgeneration=null;$this->newsession=true;
            }
            return true;
        } catch(\Throwable $e) {$this->failed=true;return false;}
    }
    public function seal(): void {
        // Native abort runs close; manager write_close then resets its own active-state bookkeeping.
        if(session_status()===PHP_SESSION_ACTIVE){session_abort();}
        $this->sealed=true;$this->close();
        \core\session\manager::write_close();
    }
}
