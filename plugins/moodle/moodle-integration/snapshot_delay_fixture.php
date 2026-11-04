<?php
namespace clear_moodle_probe;
// Namespace seam around the real PostgreSQL call: delay its return, not an invented clock value.
function pg_query_params($connection,string $query,array $params) {
    $result=\pg_query_params($connection,$query,$params);
    if(str_starts_with($query,'SELECT * FROM clear_probe.confirmations WHERE ')) {usleep(3100000);}
    return $result;
}
