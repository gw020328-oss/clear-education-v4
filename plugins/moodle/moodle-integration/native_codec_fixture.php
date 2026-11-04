<?php
// Native PHP session serialization without browser cookies or a filesystem session store.
// Only the synthetic test harness uses this codec; persistence uses the actual core DB handler separately.
function start_probe_codec(string $sid): void {
    if(session_status()===PHP_SESSION_ACTIVE){return;}
    $saved=$_SESSION??[];
    if(headers_sent()){throw new RuntimeException('CODEC_HEADERS');}
    ini_set('session.use_cookies','0');
    ini_set('session.cache_limiter','');
    ini_set('session.serialize_handler','php');
    session_set_save_handler(
        fn()=>true,fn()=>true,fn()=>'',fn()=>false,fn()=>true,fn()=>0
    );
    session_id($sid);
    if(!session_start()){throw new RuntimeException('CODEC_START');}
    $_SESSION=$saved;
}
// Buffer PASS lines so repeated native codec starts do not encounter sent headers.
ob_start();
register_shutdown_function(function(){if(session_status()===PHP_SESSION_ACTIVE){session_abort();}});
