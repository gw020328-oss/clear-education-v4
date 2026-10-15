<?php
require __DIR__.'/../../spikes/moodle-local-lab/plugins/local/clearapi/classes/observation_clock.php';
use local_clearapi\observation_clock;
$t=2000000000;
foreach ([[$t-0.001,$t+0.001,$t-1,$t+1],[$t,$t,$t,$t],[$t+0.001,$t+0.002,$t,$t+1],[$t-0.2,$t+30,$t-1,$t+30]] as [$start,$end,$lower,$upper]) {
    $w=observation_clock::bounds($start,$end,max(0,$end-$start));
    if ($w!==['lower'=>$lower,'upper'=>$upper,'validUntil'=>$lower+300]) throw new RuntimeException('BOUNDARY_FAILED');
}
foreach ([[$t+0.1,$t-0.1,0.2],[$t,$t+301,1],[$t,$t+1,301],[$t,$t,-1],[INF,$t,1]] as [$start,$end,$elapsed]) {
    $rejected=false;
    try { observation_clock::bounds($start,$end,$elapsed); } catch (RuntimeException $e) { $rejected=$e->getMessage()==='EXPORT_OBSERVATION_WINDOW'; }
    if (!$rejected) throw new RuntimeException('INVALID_WINDOW_ACCEPTED');
}
echo "PASS: 9 source clock windows; no DB, network or credentials\n";
