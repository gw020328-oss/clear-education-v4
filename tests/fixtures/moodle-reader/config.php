<?php
// Isolated DB/API doubles. Executed by the real pinned PHP interpreter.
$c = json_decode(getenv('READER_CASE'), true);
$CFG = (object)['wwwroot'=>$c['origin'] ?? 'https://127.0.0.1:9477', 'dbhost'=>$c['dbhost'] ?? 'db', 'libdir'=>'/double', 'dirroot'=>'/double'];
define('MUST_EXIST', 1);
class ReaderDBDouble {
    public array $deletes = [];
    public array $tokens;
    function __construct() {
        $t = str_repeat('a',32);
        $this->tokens = file_exists('/scratch/token-state.json') ? json_decode(file_get_contents('/scratch/token-state.json'),true) : [[$t,2,3],[$t,2,9],[$t,9,3],[str_repeat('b',32),2,3]];
    }
    function record_exists($table,$args) { global $c; return !($c['membershipLost'] ?? false); }
    function get_fieldset_select($table,...$args) { return [3]; }
    function get_record($table,...$args) {
        global $c;
        if (($c['suspended'] ?? false) || ($c['deleted'] ?? false)) throw new RuntimeException('USER_UNAVAILABLE');
        return (object)['id'=>3];
    }
    function delete_records($table,$where) {
        if ($table !== 'external_tokens' || array_keys($where) !== ['token','externalserviceid','userid']) throw new RuntimeException('BAD_DELETE');
        $this->deletes[] = $where;
        $this->tokens = array_values(array_filter($this->tokens, fn($r)=>$r !== [$where['token'],$where['externalserviceid'],$where['userid']]));
    }
}
$DB = new ReaderDBDouble();
class context_course { static function instance($id) { return $id; } }
class context_module { static function instance($id) { return $id; } }
function get_coursemodule_from_id(...$args) { return (object)['instance'=>1]; }
function is_enrolled(...$args) { global $c; return !($c['enrolLost'] ?? false); }
function has_capability(...$args) { global $c; return !($c['roleLost'] ?? false); }
register_shutdown_function(function() use ($DB) { file_put_contents('/scratch/token-state.json',json_encode($DB->tokens)); file_put_contents('/scratch/result.json', json_encode(['deletes'=>$DB->deletes,'remaining'=>count($DB->tokens)])); });
