<?php
// Only the disposable Moodle installation used by this task.
define('CLI_SCRIPT', true);
require '/var/www/html/config.php';
require_once $CFG->dirroot . '/course/lib.php';
require_once $CFG->dirroot . '/user/lib.php';
require __DIR__ . '/profile.php';
require __DIR__ . '/strict_database_candidate.php';
if (getenv('CLEAR_SYNTHETIC_SESSION_PROBE') !== '1' || $SITE->shortname !== 'clear') { exit(1); }
function ok(bool $value, string $name): void { if (!$value) { throw new RuntimeException('FAILED '.$name); } echo 'PASS '.$name."\n"; }
function rejected(callable $fn, string $name): void { try { $fn(); } catch (RuntimeException $e) { ok(true,$name); return; } throw new RuntimeException('FAILED '.$name); }
$suffix=bin2hex(random_bytes(4));
$ids=[];
foreach(['one','two'] as $label) {
 $ids[]=user_create_user((object)['username'=>'probe-'.$label.'-'.$suffix,'firstname'=>'Synthetic','lastname'=>'Probe','email'=>$label.'@example.invalid','auth'=>'manual','confirmed'=>1],false,false);
}
$course=create_course((object)['fullname'=>'Synthetic Page Gate','shortname'=>'pg-'.$suffix,'category'=>1]);
$context=context_course::instance($course->id);
$SESSION=new stdClass();
\core\session\manager::set_user(get_complete_user_data('id',$ids[0]));
$roleid=$DB->get_field('role','id',['shortname'=>'student'],MUST_EXIST);
role_switch($roleid,$context);
rejected(fn()=>\clear_synthetic\reject_assumed_identity($USER,$_SESSION), 'actual Moodle role_switch state rejected');
role_switch(0,$context);
\core\session\manager::loginas($ids[1],$context,false);
rejected(fn()=>\clear_synthetic\reject_assumed_identity($USER,$_SESSION), 'actual Moodle loginas state rejected');

// Synthetic session row. The value never enters an output or persisted test log.
$sid='synthetic-probe-'.$suffix;
$id=$DB->insert_record('sessions',(object)['state'=>0,'sid'=>$sid,'userid'=>$ids[0],'sessdata'=>base64_encode('before'),
 'timecreated'=>time(),'timemodified'=>time(),'firstip'=>'','lastip'=>'']);
$ddl = function(string $sql) use ($CFG): void {
 $connection=pg_connect('host='.$CFG->dbhost.' dbname='.$CFG->dbname.' user='.$CFG->dbuser.' password='.$CFG->dbpass,PGSQL_CONNECT_FORCE_NEW);
 if (!pg_query($connection,$sql)) { throw new RuntimeException('SYNTHETIC_DDL'); }
 pg_close($connection);
};
$DB->execute('CREATE TABLE IF NOT EXISTS clear_probe_epoch (id integer primary key, revision integer not null)');
$DB->execute('INSERT INTO clear_probe_epoch VALUES(1,0) ON CONFLICT(id) DO UPDATE SET revision=0');
$ddl("CREATE OR REPLACE FUNCTION clear_probe_bump() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN UPDATE clear_probe_epoch SET revision=revision+1; RETURN NULL; END \$\$");
$DB->execute('DROP TRIGGER IF EXISTS clear_probe_bump ON '.$CFG->prefix.'sessions');
$DB->execute('CREATE TRIGGER clear_probe_bump AFTER UPDATE ON '.$CFG->prefix.'sessions FOR EACH STATEMENT EXECUTE FUNCTION clear_probe_bump()');
$epoch=fn()=>(int)$DB->get_field_sql('SELECT revision FROM clear_probe_epoch WHERE id=1');
$core=new \core\session\database(); $core->set_requires_write_lock(true); $core->read($sid);
$confirmed=$epoch();
ok($core->write($sid,'request-end-change') && $epoch()>$confirmed,'core end-of-request write invalidates earlier generation');
$core->close();
$strict=new \clear_synthetic\strict_database_candidate(); $strict->set_requires_write_lock(true); $strict->read($sid);
$receipt=$strict->flush_for_confirmation($sid,'final-state',(object)['access'=>[]],[]);
$afterflush=$epoch();
ok($receipt===$id && $strict->write($sid,'final-state') && $epoch()===$afterflush,'candidate exact flush prevents unchanged shutdown self-invalidation');
$strict->close();
$ddl("CREATE OR REPLACE FUNCTION clear_probe_failure() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'SYNTHETIC_SESSION_FAILURE'; END \$\$");
$DB->execute('CREATE TRIGGER clear_probe_failure BEFORE UPDATE ON '.$CFG->prefix.'sessions FOR EACH STATEMENT EXECUTE FUNCTION clear_probe_failure()');
$core=new \core\session\database(); $core->set_requires_write_lock(true); $core->read($sid);
// Suppress the known core raw-sid log sink. It is not captured in a report or file.
$oldlog=ini_set('error_log','/dev/null');
$swallowed=$core->write($sid,'must-fail');
ini_set('error_log',$oldlog);
ok($swallowed && $DB->get_field('sessions','sessdata',['id'=>$id])===base64_encode('final-state'), 'core write returns true after actual database exception');
$core->close();
$strict=new \clear_synthetic\strict_database_candidate(); $strict->set_requires_write_lock(true); $strict->read($sid);
rejected(fn()=>$strict->flush_for_confirmation($sid,'must-fail',(object)['access'=>[]],[]), 'candidate persistence failure rejects confirmation receipt');
$DB->execute('DROP TRIGGER clear_probe_failure ON '.$CFG->prefix.'sessions');
ok(!$strict->write($sid,'later-retry'), 'candidate write failure remains sticky');
$strict->close();
$DB->delete_records('sessions',['id'=>$id]);
$DB->execute('DROP TRIGGER clear_probe_bump ON '.$CFG->prefix.'sessions');
