<?php
// CLI fixture for PHP's real session read/decode/abort callbacks using the core-derived handler.
function start_native_probe(string $sid): \clear_moodle_probe\guarded_database {
    if(session_status()===PHP_SESSION_ACTIVE){throw new RuntimeException('NATIVE_ALREADY_ACTIVE');}
    ini_set('session.use_cookies','0');ini_set('session.cache_limiter','');ini_set('session.serialize_handler','php');
    $h=new \clear_moodle_probe\guarded_database();$h->set_requires_write_lock(true);$h->init();
    session_id($sid);
    if(!session_start()){throw new RuntimeException('NATIVE_START');}
    $GLOBALS['USER']=$_SESSION['USER'];$_SESSION['USER']=&$GLOBALS['USER'];
    $GLOBALS['SESSION']=$_SESSION['SESSION'];$_SESSION['SESSION']=&$GLOBALS['SESSION'];
    return $h;
}
