<?php
// This CLI entry point handles only the new isolated laboratory's random data.
$s=json_decode(file_get_contents('/lab-runtime/secrets.json'),true);
if (!$s || !file_exists('/lab-runtime/local-instance.json')) throw new Exception('LOCAL_LAB_MARKER_REQUIRED');
if (!is_dir('/var/moodledata')) mkdir('/var/moodledata',0770,true);
chown('/var/moodledata','www-data'); chgrp('/var/moodledata','www-data'); chmod('/var/moodledata',02770);
file_put_contents('/var/moodledata/lab-db-secret',$s['dbPassword']);
chown('/var/moodledata/lab-db-secret','www-data'); chmod('/var/moodledata/lab-db-secret',0600);
$argv=['install_database.php','--agree-license','--adminuser=labadmin','--adminpass='.$s['adminPassword'],
    '--adminemail=admin@example.invalid','--fullname=Isolated CLEAR local API laboratory','--shortname=CLEAR-LOCAL-API'];
$_SERVER['argv']=$argv; require('/var/www/html/admin/cli/install_database.php');
