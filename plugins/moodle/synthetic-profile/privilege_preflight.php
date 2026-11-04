<?php
namespace clear_synthetic;
require_once __DIR__ . '/profile.php';
function verify_privileges($db): void {
    $result = pg_query($db, <<<'SQL'
SELECT current_database()='clear_profile' AS synthetic,
 NOT (SELECT rolcanlogin OR rolsuper OR rolcreaterole OR rolreplication FROM pg_roles WHERE rolname='clear_owner') AS owner_restricted,
 NOT pg_has_role('clear_runtime','clear_owner','MEMBER') AND NOT pg_has_role('clear_reader','clear_owner','MEMBER') AS membership_restricted,
 NOT (SELECT rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication FROM pg_roles WHERE rolname='clear_runtime') AS runtime_restricted,
 NOT has_database_privilege('clear_runtime',current_database(),'TEMP') AS no_temp,
 NOT has_schema_privilege('clear_runtime','clear_source','CREATE') AS no_ddl,
 NOT has_table_privilege('clear_runtime','clear_guard.authority','UPDATE') AS no_epoch_write,
 NOT has_parameter_privilege('clear_runtime','session_replication_role','SET') AS no_replication,
 NOT has_column_privilege('clear_reader','clear_source.sessions','sessdata','SELECT') AS no_session_bytes,
 (SELECT count(*)=2 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='clear_guard' AND p.proname IN ('bump_authority','bump_session')
  AND p.prosecdef AND pg_get_userbyid(p.proowner)='clear_owner'
  AND p.proconfig=ARRAY['search_path=pg_catalog, clear_guard, pg_temp']) AS definer_config,
 (SELECT count(*)=7 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='clear_source' AND NOT t.tgisinternal AND t.tgenabled='A') AS triggers_enabled,
 NOT has_function_privilege('clear_runtime','clear_guard.bump_authority()','EXECUTE') AND
 NOT has_function_privilege('clear_runtime','clear_guard.bump_session()','EXECUTE') AS direct_execute_denied
SQL);
    require_rule($result !== false && pg_num_rows($result) === 1, 'INSTALLATION_UNAVAILABLE');
    foreach (pg_fetch_assoc($result) as $ok) {
        require_rule($ok === 't', 'INSTALLATION_PRIVILEGE_DRIFT');
    }
}
