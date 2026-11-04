<?php
namespace clear_moodle_probe;
require_once __DIR__ . '/../synthetic-profile/profile.php';
use function clear_synthetic\require_rule;
use function clear_synthetic\canonical;

function installation_pin($pg): string {
    $sql = <<<'SQL'
SELECT jsonb_build_object(
 'functions',(SELECT jsonb_agg(jsonb_build_array(p.proname,pg_get_functiondef(p.oid),p.proacl::text,pg_get_userbyid(p.proowner)) ORDER BY p.proname)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='clear_probe'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(c.relname,t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) ORDER BY c.relname,t.tgname)
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND t.tgname LIKE 'clear_%'),
 'roles',(SELECT jsonb_agg(jsonb_build_array(rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls) ORDER BY rolname)
 FROM pg_roles WHERE rolname LIKE 'clear_moodle_%'),
 'memberships',(SELECT jsonb_agg(jsonb_build_array(roleid,member,grantor,admin_option) ORDER BY roleid,member) FROM pg_auth_members),
 'parameters',(SELECT jsonb_agg(jsonb_build_array(parname,paracl::text) ORDER BY parname) FROM pg_parameter_acl),
 'schemas',(SELECT jsonb_agg(jsonb_build_array(nspname,pg_get_userbyid(nspowner),nspacl::text) ORDER BY nspname) FROM pg_namespace WHERE nspname IN ('public','clear_probe')),
 'tables',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,pg_get_userbyid(c.relowner),c.relacl::text,c.relkind) ORDER BY n.nspname,c.relname)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','clear_probe')),
 'columns',(SELECT jsonb_agg(jsonb_build_array(c.relname,a.attname,a.attacl::text) ORDER BY c.relname,a.attname)
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL)
)::text
SQL;
    $result=pg_query($pg,$sql);
    require_rule($result!==false,'INSTALLATION_QUERY');
    return hash('sha256',pg_fetch_result($result,0,0));
}
function code_pin(string $root): string {
    static $pins=[];
    // The harness mounts both trees read-only. Host administration is maintenance-only.
    $mounts=file('/proc/self/mountinfo',FILE_IGNORE_NEW_LINES);
    foreach([$root,'/probe'] as $path) {
        $readonly=false;
        foreach($mounts as $line) {
            $parts=explode(' ',$line);
            if(($parts[4]??null)===$path && in_array('ro',explode(',',$parts[5]??''),true)) {$readonly=true;}
        }
        require_rule($readonly,'IMMUTABLE_CODE_MOUNT_REQUIRED');
    }
    if(isset($pins[$root])) {return $pins[$root];}
    $rows=[];
    $iterator=new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root,\FilesystemIterator::SKIP_DOTS));
    foreach($iterator as $file) {
        $relative=substr($file->getPathname(),strlen($root)+1);
        if($relative==='config.php' || str_starts_with($relative,'.git/')) {continue;}
        require_rule(!$file->isLink(),'CODE_SYMLINK');
        if($file->isFile() && in_array($file->getExtension(),['php','js','json','xml','mustache','css'],true)) {
            $rows[$relative]=hash_file('sha256',$file->getPathname());
        }
    }
    foreach(glob(__DIR__.'/*.php') as $path) {$rows['probe/'.basename($path)]=hash_file('sha256',$path);}
    foreach(['profile.php','strict_database_candidate.php'] as $name) {$rows['probe/base/'.$name]=hash_file('sha256',__DIR__.'/../synthetic-profile/'.$name);}
    $rows['probe/page.sql']=hash_file('sha256',__DIR__.'/page.sql');
    ksort($rows);
    return $pins[$root]=hash('sha256',canonical($rows));
}
function cfg_profile(): array {
    global $CFG;
    require_rule((int)$CFG->version===2024100715,'CORE_VERSION');
    $p=[];
    foreach(['session_handler_class','auth','enrol_plugins_enabled','sitepolicy','sitepolicyhandler','sitepolicyguest',
        'enablecompletion','enableavailability','enablegroupmembersonly','defaultuserroleid','guestroleid','siteadmins',
        'sessiontimeout','sessiontimeoutwarning','session_update_timemodified_frequency','allowaccountssameemail',
        'customfrontpageinclude','contextlocking','forcepasswordchange','handlebounces'] as $key) {$p[$key]=$CFG->$key??null;}
    require_rule(($p['session_handler_class']??'')==='\\core\\session\\database','SESSION_BACKEND');
    foreach(['sitepolicy','sitepolicyhandler','sitepolicyguest','customfrontpageinclude','forcepasswordchange','handlebounces'] as $key) {
        require_rule(empty($p[$key]),'UNSUPPORTED_CFG');
    }
    require_rule(empty($p['auth']) || $p['auth']==='manual','AUTH_PLUGIN');
    require_rule($p['enrol_plugins_enabled']==='manual','ENROL_PLUGIN');
    require_rule(empty($p['enableavailability']),'AVAILABILITY_UNSUPPORTED');
    $p['mfaEnabled']=get_config('tool_mfa','enabled');
    $p['loginHooks']=get_plugins_with_function('after_require_login','lib.php');
    require_rule(empty($p['mfaEnabled']) && $p['loginHooks']===['tool'=>['mfa'=>'tool_mfa_after_require_login']], 'LOGIN_HOOKS');
    return $p;
}
function metadata_pin($pg): string {
    $result=pg_query($pg,'SELECT clear_probe.metadata_pin()');
    require_rule($result!==false,'METADATA_QUERY');
    return pg_fetch_result($result,0,0);
}
function collect_profile($pg, array $target): array {
    global $SITE,$CFG,$DB;
    require_rule(getenv('CLEAR_ACTUAL_MOODLE_PROBE')==='1' && $SITE->shortname==='clear','SYNTHETIC_ONLY');
    require_rule(!$DB->record_exists('user_info_field',[]) && !$DB->record_exists('user_info_data',[]),'CUSTOM_PROFILE');
    $context=\context_module::instance($target['module']);
    require_rule(has_capability('local/clearbridge:view',$context,$target['user'],false),'STUDENT_CAPABILITY');
    foreach(['moodle/role:switchroles','moodle/user:loginas','moodle/course:update'] as $cap) {
        require_rule(!has_capability($cap,$context,$target['user'],false),'PRIVILEGED_STUDENT');
    }
    require_rule(!is_siteadmin($target['user']) && !isguestuser($target['user']),'ADMIN_STUDENT');
    foreach(['mod/page:view'] as $cap) {
        require_rule(has_capability($cap,$context,$target['user'],false),'SOURCE_CAPABILITY');
    }
    $assignments=$DB->get_records('role_assignments',['userid'=>$target['user']]);
    require_rule(count($assignments)===1,'ADDITIONAL_ROLES');
    $assignment=reset($assignments);
    require_rule((int)$assignment->contextid===(int)\context_course::instance($target['course'])->id &&
        $assignment->component==='' && (int)$assignment->itemid===0,'STUDENT_ROLE_SCOPE');
    $system=\context_system::instance();
    require_rule(!$DB->record_exists_select('role_capabilities','contextid<>?',[$system->id]),'CAPABILITY_OVERRIDE');
    $target['role']=(int)$assignment->roleid;

    return ['mode'=>'SYNTHETIC_ONLY','target'=>$target,'cfg'=>cfg_profile(),'code'=>code_pin($CFG->dirroot),
        'installation'=>installation_pin($pg),'metadata'=>metadata_pin($pg),'installationEpoch'=>bin2hex(random_bytes(32))];
}
function validate_profile($pg,array $profile): void {
    global $CFG;
    require_rule($profile['mode']==='SYNTHETIC_ONLY' && getenv('CLEAR_ACTUAL_MOODLE_PROBE')==='1','SYNTHETIC_ONLY');
    require_rule($profile['cfg']===cfg_profile() && hash_equals($profile['code'],code_pin($CFG->dirroot)) &&
        hash_equals($profile['installation'],installation_pin($pg)) && hash_equals($profile['metadata'],metadata_pin($pg)), 'PROFILE_DRIFT');
}
