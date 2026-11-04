<?php
namespace clear_moodle_probe;
use function clear_synthetic\require_rule;
use function clear_synthetic\safe_int;

// Existing-session-only, synthetic integration handler. Never configured on a live site.
class guarded_database extends \clear_synthetic\strict_database_candidate {
    private ?int $readgeneration=null;
    public function read(string $sid): string|false {
        try {
            require_rule($this->requires_write_lock() && $this->recordid===null,'SESSION_LOCK_REQUIRED');
            $record=$this->database->get_record('sessions',['sid'=>$sid],'id',MUST_EXIST);
            $this->database->get_session_lock($record->id,$this->acquiretimeout);
            $this->recordid=(int)$record->id;
            $stored=$this->database->get_record_sql('SELECT s.id,s.sessdata,g.generation FROM {sessions} s JOIN clear_probe.generations g ON g.sessionid=s.id WHERE s.id=?',[$record->id],MUST_EXIST);
            $data=base64_decode($stored->sessdata??'',true);
            require_rule($data!==false,'SESSION_ENCODING');
            $this->readgeneration=safe_int((int)$stored->generation);
            $this->failed=false;
            return $data;
        } catch(\Throwable $e) {
            $this->failed=true;
            $this->close();
            throw new \RuntimeException('SESSION_LOCK_OR_READ');
        }
    }
    public function flush_for_confirmation(string $sid,string $data,object $user,array $session): int {
        $generation=(int)$this->database->get_field_sql('SELECT generation FROM clear_probe.generations WHERE sessionid=?',[$this->recordid]);
        require_rule($this->readgeneration!==null && $generation===$this->readgeneration,'SESSION_CHANGED_AFTER_READ');
        $id=parent::flush_for_confirmation($sid,$data,$user,$session);
        $this->readgeneration=safe_int((int)$this->database->get_field_sql('SELECT generation FROM clear_probe.generations WHERE sessionid=?',[$id]));
        return $id;
    }
}
