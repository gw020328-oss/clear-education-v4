<?php
// HTTP fixture for the native Moodle manager. Only run inside the isolated test container.
require __DIR__.'/http_bootstrap.php';
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if(!in_array($path,['/session','/fixture-login','/confirm','/lookup','/logout','/regenerate','/mutate','/done'],true)) {
    http_response_code(404);echo '{"ok":false,"code":"REJECTED"}';return;
}
if($path==='/lookup' || $path==='/done'){define('NO_MOODLE_COOKIES',true);}
define('CLI_SCRIPT',false);
ob_start();
try {
    require '/var/www/html/config.php';
    require_once __DIR__.'/adapter.php';
    $target=json_decode(file_get_contents('/tmp/clear-target.json'),true);
    $profile=json_decode(file_get_contents('/tmp/clear-http-profile.json'),true);
    $h=\clear_moodle_probe\http_database::$instance;
    $body=json_decode(file_get_contents('php://input'),true)??[];
    if($path==='/session') {
        $result=['loggedIn'=>isloggedin() && !isguestuser(),'sesskey'=>sesskey()];
    } else if($path==='/done') {$result=['done'=>true];}
    else {
        \clear_synthetic\require_rule($_SERVER['REQUEST_METHOD']==='POST','METHOD');
        if($path==='/lookup') {
            // No cookie/session creation; this path cannot call mint or owner fixture APIs.
            $result=\clear_moodle_probe\confirmation($body['request']??[],$profile);
        } else {
            \clear_synthetic\require_rule(is_string($body['sesskey']??null) && confirm_sesskey($body['sesskey']),'CSRF');
            if($path==='/fixture-login') {
                // Explicit public synthetic identity only. No password/authenticator/institution input.
                \core\session\manager::login_user(get_complete_user_data('id',$target['user']));
                $result=['loggedIn'=>true,'sesskey'=>sesskey()];
            } else {
                \clear_synthetic\require_rule(isloggedin() && !isguestuser() && (int)$USER->id===$target['user'],'IDENTITY');
                $cm=get_coursemodule_from_id('page',$target['module'],0,false,MUST_EXIST);
                require_login($target['course'],false,$cm);
                if($path==='/logout') {\core\session\manager::terminate_current();$result=['loggedIn'=>false];}
                else if($path==='/regenerate') {
                    \core\session\manager::login_user(get_complete_user_data('id',$target['user']));
                    $result=['regenerated'=>true,'sesskey'=>sesskey()];
                } else if($path==='/mutate') {
                    role_switch($profile['target']['role'],\context_course::instance($target['course']));
                    $result=['mutated'=>true];
                } else {
                    \clear_synthetic\require_rule(($body['confirm']??false)===true,'EXPLICIT_CONFIRMATION');
                    $mode=$body['fixtureCase']??'normal';
                    \clear_synthetic\require_rule(in_array($mode,['normal','redirect','nested','rollback','shutdown'],true),'CASE');
                    $outer=null;
                    $beforebytes=$DB->get_field('sessions','sessdata',['sid'=>session_id()],MUST_EXIST);
                    try {
                        if($mode==='nested'){$outer=$DB->start_delegated_transaction();}
                        $barrier=$mode==='rollback'?static function(): void {
                            $GLOBALS['SESSION']->rollbackMarker=true;throw new RuntimeException('FIXTURE_ROLLBACK');
                        }:null;
                        $result=\clear_moodle_probe\mint($h,session_id(),$body['request']??[],$profile,$barrier);
                        $result['fixtureTrackingFields']=$h->trackingFields;
                    } finally {
                        if($outer!==null) {try{$outer->rollback(new RuntimeException('FIXTURE_OUTER'));}catch(Throwable $ignored){}}
                        if(in_array($mode,['nested','rollback'],true)) {
                            file_put_contents('/tmp/clear-http-rollback.json',json_encode(['unchanged'=>
                                $DB->get_field('sessions','sessdata',['sid'=>session_id()],MUST_EXIST)===$beforebytes]));
                        }
                        $h->seal();
                    }
                    // Exercise response/shutdown code that mutates globals and tries to reopen persistence.
                    $probe=static function() use($h): void {
                        $GLOBALS['USER']->realuser=999;
                        $GLOBALS['SESSION']->postResponseMarker=true;
                        \core\session\manager::write_close();
                        $blocked=false;
                        try {$blocked=!session_start();} catch(Throwable $e) {$blocked=true;}
                        $openblocked=false;
                        try {$h->open('',session_name());} catch(Throwable $e) {$openblocked=true;}
                        file_put_contents('/tmp/clear-http-terminal.json',json_encode([
                            'nativeClosed'=>session_status()===PHP_SESSION_NONE,'restartBlocked'=>$blocked,
                            'handlerOpenBlocked'=>$openblocked,'handlerWriteBlocked'=>!$h->write(session_id(),'synthetic-after-close')]));
                    };
                    if($mode==='shutdown'){register_shutdown_function($probe);}else{$probe();}
                    if($mode==='redirect'){http_response_code(303);header('Location: /done');}
                }
            }
        }
    }
    \core\session\manager::write_close();
    ob_clean();header('Content-Type: application/json');header('Cache-Control: no-store');
    echo json_encode(['ok'=>true,'result'=>$result],JSON_THROW_ON_ERROR);
} catch(Throwable $e) {
    // Private fixture diagnostics contain only known codes, never exception text, SQL or arguments.
    $safe=['SESSION_TRACKING','SESSION_READ','SESSION_CREATION','SESSION_CHANGED_AFTER_READ','OUTER_TRANSACTION',
        'PROFILE_DRIFT','EXPIRED','CSRF','IDENTITY','EXPLICIT_CONFIRMATION','METHOD','FIXTURE_ROLLBACK'];
    file_put_contents('/tmp/clear-http-failure.json',json_encode(['code'=>in_array($e->getMessage(),$safe,true)?$e->getMessage():'REJECTED']));
    $h=\clear_moodle_probe\http_database::$instance;
    if(isset($h) && $h!==null){try{$h->seal();}catch(Throwable $ignored){}}
    ob_clean();header_remove('Set-Cookie');http_response_code(403);header('Content-Type: application/json');header('Cache-Control: no-store');
    echo '{"ok":false,"code":"REJECTED"}';
}
ob_end_flush();
