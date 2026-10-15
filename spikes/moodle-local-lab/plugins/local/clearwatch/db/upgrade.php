<?php
function xmldb_local_clearwatch_upgrade($oldversion) {
 global $DB;
 if($oldversion<2026101401){
  $table=new xmldb_table('local_clearwatch_session');
  $field=new xmldb_field('creditedms',XMLDB_TYPE_INTEGER,'19',null,XMLDB_NOTNULL,null,'0');
  if(!$DB->get_manager()->field_exists($table,$field))$DB->get_manager()->add_field($table,$field);
  // Old diagnostic sessions did not track the cumulative budget and must not resume.
  $DB->set_field('local_clearwatch_session','active',0,[]);
  upgrade_plugin_savepoint(true,2026101401,'local','clearwatch');
 }
 return true;
}
