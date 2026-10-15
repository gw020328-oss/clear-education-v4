<?php
defined('MOODLE_INTERNAL') || die();
$functions=[];
foreach(['identity','manifest','page'] as $method) $functions['local_clearapi_'.$method]=[
 'classname'=>'local_clearapi_external','methodname'=>$method,'classpath'=>'local/clearapi/externallib.php',
 'description'=>'Read own isolated local lab '.$method,'type'=>'read','ajax'=>false];
