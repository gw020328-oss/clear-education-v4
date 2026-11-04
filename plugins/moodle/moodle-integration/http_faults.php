<?php
namespace clear_moodle_probe;
// Fixed test injections, reachable only on the loopback fixture server. No arbitrary SQL/input values.
function http_read_fixture(string $sid,string $phase): void {
    $case=$_SERVER['HTTP_X_CLEAR_FIXTURE']??'';
    $sql=match([$phase,$case]) {
        ['before','idle']=>'UPDATE mdl_sessions SET timemodified=EXTRACT(EPOCH FROM clock_timestamp())::bigint-30 WHERE sid=$1',
        ['before','ip']=>"UPDATE mdl_sessions SET lastip='192.0.2.1' WHERE sid=$1",
        ['after','external-data']=>"UPDATE mdl_sessions SET sessdata=encode(convert_to('externally changed fixture bytes','UTF8'),'base64') WHERE sid=$1",
        ['after','external-identity']=>'UPDATE mdl_sessions SET userid=0 WHERE sid=$1',
        default=>null,
    };
    if($sql===null){return;}
    $pg=pg_from_config('runtime');
    try {\clear_synthetic\require_rule(pg_query_params($pg,$sql,[$sid])!==false,'FIXTURE_MUTATION');}
    finally {pg_close($pg);}
}
