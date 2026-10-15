<?php
// GPL-3.0-or-later; loopback laboratory only, never a payment authorizer.
require_once($CFG->libdir.'/externallib.php');
class local_clearapi_external extends external_api {
    private static function access($courseid) {
        global $USER;
        $ctx=context_course::instance($courseid);
        self::validate_context($ctx);
        require_capability('local/clearapi:readown',$ctx);
        if (!is_enrolled($ctx,$USER,'',true)) throw new required_capability_exception($ctx,'local/clearapi:readown','nopermissions','');
        return \local_clearapi\exporter::configuration($USER->id,$courseid);
    }
    public static function identity_parameters() { return new external_function_parameters(['courseid'=>new external_value(PARAM_INT,'Course')]); }
    public static function identity($courseid) {
        $p=self::validate_parameters(self::identity_parameters(),compact('courseid'));
        $c=self::access($p['courseid']); return json_encode(['profile'=>'clear-local-moodle.1','sourceBinding'=>$c['sourceBinding'],'labOnly'=>true]);
    }
    public static function identity_returns() { return new external_value(PARAM_RAW,'JSON local identity'); }
    public static function manifest_parameters() { return new external_function_parameters([
        'courseid'=>new external_value(PARAM_INT,'Course'),'expectedrevision'=>new external_value(PARAM_ALPHANUMEXT,'Current revision')]); }
    public static function manifest($courseid,$expectedrevision) {
        global $USER;
        $p=self::validate_parameters(self::manifest_parameters(),compact('courseid','expectedrevision'));
        self::access($p['courseid']); $a=\local_clearapi\exporter::snapshot($USER->id,$p['courseid']);
        if ($a['revision']!==$p['expectedrevision']) return json_encode(['profile'=>'clear-local-moodle.1','error'=>'REVISION_CHANGED']);
        unset($a['rows']); return json_encode($a);
    }
    public static function manifest_returns() { return new external_value(PARAM_RAW,'JSON current manifest'); }
    public static function page_parameters() { return new external_function_parameters([
        'courseid'=>new external_value(PARAM_INT,'Course'),'expectedrevision'=>new external_value(PARAM_ALPHANUMEXT,'Current revision'),
        'pageid'=>new external_value(PARAM_ALPHANUMEXT,'Pinned page')]); }
    public static function page($courseid,$expectedrevision,$pageid) {
        global $USER;
        $p=self::validate_parameters(self::page_parameters(),compact('courseid','expectedrevision','pageid'));
        self::access($p['courseid']); $a=\local_clearapi\exporter::snapshot($USER->id,$p['courseid']);
        if ($a['revision']!==$p['expectedrevision']) return json_encode(['profile'=>'clear-local-moodle.1','error'=>'REVISION_CHANGED']);
        foreach($a['pages'] as $page) if ($page['pageId']===$p['pageid']) return json_encode([
            'profile'=>'clear-local-moodle.1','revision'=>$a['revision'],'pageId'=>$page['pageId'],
            'records'=>array_slice($a['rows'],$page['offset'],$page['rowCount'])]);
        throw new invalid_parameter_exception('EXPORT_PAGE_NOT_ALLOWED');
    }
    public static function page_returns() { return new external_value(PARAM_RAW,'JSON pinned page'); }
}
