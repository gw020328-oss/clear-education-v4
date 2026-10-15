<?php
require_once($CFG->libdir.'/externallib.php');
class local_clearwatch_external extends external_api {
 public static function exchange_parameters(){return new external_function_parameters(['cmid'=>new external_value(PARAM_INT,'Course module'),'operation'=>new external_value(PARAM_ALPHA,'Operation'),'payload'=>new external_value(PARAM_RAW,'JSON')]);}
 public static function access($cmid){[$course,$cm]=get_course_and_cm_from_cmid($cmid,'videocheck');$ctx=context_module::instance($cmid);self::validate_context($ctx);require_capability('mod/videocheck:submit',$ctx);return $course;}
 public static function exchange($cmid,$operation,$payload){global $USER;
  $p=self::validate_parameters(self::exchange_parameters(),compact('cmid','operation','payload'));
  $course=self::access($p['cmid']);if(strlen($payload)>20000)throw new invalid_parameter_exception('PAYLOAD_TOO_LARGE');
  return json_encode(\local_clearwatch\engine::command($USER->id,$p['cmid'],$course->id,$p['operation'],json_decode($payload,true)));
 }
 public static function exchange_returns(){return new external_value(PARAM_RAW,'JSON receipt');}
 public static function read_parameters(){return new external_function_parameters(['cmid'=>new external_value(PARAM_INT,'Course module')]);}
 public static function read($cmid){global $USER;$p=self::validate_parameters(self::read_parameters(),['cmid'=>$cmid]);self::access($p['cmid']);return json_encode(\local_clearwatch\engine::evidence($USER->id,$p['cmid']));}
 public static function read_returns(){return new external_value(PARAM_RAW,'JSON evidence');}
}
