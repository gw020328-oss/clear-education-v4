<?php
// Installer for a disposable synthetic Moodle database. Never called by plugin upgrade.
function install_clear_probe($connection, string $prefix): void {
    if (!preg_match('/^[a-z][a-z0-9_]*$/D', $prefix)) {throw new RuntimeException('PREFIX');}
    $sql = <<<'SQL'
BEGIN;
CREATE ROLE clear_moodle_guard NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION;
CREATE SCHEMA clear_probe AUTHORIZATION clear_moodle_guard;
GRANT USAGE ON SCHEMA public TO clear_moodle_guard;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO clear_moodle_guard;
GRANT UPDATE(id) ON public.PREFIXsessions TO clear_moodle_guard;
SET ROLE clear_moodle_guard;
CREATE TABLE clear_probe.authority(id integer primary key CHECK(id=1), revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991));
INSERT INTO clear_probe.authority VALUES(1,1);
CREATE TABLE clear_probe.generations(sessionid bigint primary key, generation bigint NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740991));
CREATE TABLE clear_probe.confirmations(ref text primary key, sessionid bigint NOT NULL, userid bigint NOT NULL,
 authority bigint NOT NULL, generation bigint NOT NULL, profilehash text NOT NULL, issuer text NOT NULL,
 scopehash text NOT NULL, installation text NOT NULL, confirmedat bigint NOT NULL, expiry bigint NOT NULL);
CREATE FUNCTION clear_probe.bump_authority() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,clear_probe,pg_temp AS $$ BEGIN
 UPDATE clear_probe.authority SET revision=revision+1 WHERE id=1 AND revision<9007199254740991;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTHORITY_UNAVAILABLE'; END IF; RETURN NULL;
END $$;
CREATE FUNCTION clear_probe.bump_session() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,clear_probe,pg_temp AS $$ BEGIN
 IF TG_OP='UPDATE' AND NEW.id<>OLD.id THEN RAISE EXCEPTION 'SESSION_ID_CHANGED'; END IF;
 INSERT INTO clear_probe.generations VALUES(CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END,1)
 ON CONFLICT(sessionid) DO UPDATE SET generation=clear_probe.generations.generation+1;
 RETURN NULL;
END $$;
CREATE FUNCTION clear_probe.lock_authority() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,clear_probe,pg_temp AS $$ DECLARE rev bigint; BEGIN
 SELECT revision INTO STRICT rev FROM clear_probe.authority WHERE id=1 FOR SHARE; RETURN rev;
END $$;
CREATE FUNCTION clear_probe.insert_confirmation(ref text, sessionid bigint, userid bigint, authority bigint,
 generation bigint, profilehash text, issuer text, scopehash text, installation text, confirmedat bigint, expiry bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,clear_probe,pg_temp AS $$
DECLARE currentauthority bigint; currentgeneration bigint; currentuser bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_locks l WHERE l.pid=pg_backend_pid() AND l.locktype='advisory'
  AND l.classid=((sessionid >> 32)::oid) AND l.objid=((sessionid & 4294967295)::oid)
  AND l.objsubid=1 AND l.mode='ExclusiveLock' AND l.granted) THEN RAISE EXCEPTION 'SESSION_LOCK_REQUIRED'; END IF;
 SELECT a.revision INTO STRICT currentauthority FROM clear_probe.authority a WHERE a.id=1 FOR SHARE;
 SELECT s.userid INTO STRICT currentuser FROM public.PREFIXsessions s WHERE s.id=sessionid FOR UPDATE;
 SELECT g.generation INTO STRICT currentgeneration FROM clear_probe.generations g WHERE g.sessionid=insert_confirmation.sessionid;
 IF currentauthority<>authority OR currentgeneration<>generation OR currentuser<>userid THEN RAISE EXCEPTION 'STALE_FENCE'; END IF;
 IF expiry<=confirmedat OR expiry>confirmedat+120 OR extract(epoch FROM clock_timestamp())>=expiry
  OR confirmedat>extract(epoch FROM clock_timestamp()) THEN RAISE EXCEPTION 'CONFIRMATION_TIME'; END IF;
 INSERT INTO clear_probe.confirmations VALUES(ref,sessionid,userid,authority,generation,profilehash,issuer,scopehash,installation,confirmedat,expiry);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA clear_probe FROM PUBLIC;
RESET ROLE;
CREATE ROLE clear_moodle_runtime LOGIN PASSWORD 'synthetic-runtime' NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION;
CREATE ROLE clear_moodle_reader LOGIN PASSWORD 'synthetic-reader' NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION;
REVOKE ALL ON DATABASE moodle FROM PUBLIC;
GRANT CONNECT ON DATABASE moodle TO clear_moodle_runtime,clear_moodle_reader;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE SET ON PARAMETER session_replication_role FROM PUBLIC,clear_moodle_runtime,clear_moodle_reader;
GRANT USAGE ON SCHEMA public,clear_probe TO clear_moodle_runtime,clear_moodle_reader;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO clear_moodle_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO clear_moodle_runtime;
GRANT SELECT ON clear_probe.authority,clear_probe.generations,clear_probe.confirmations TO clear_moodle_runtime,clear_moodle_reader;
GRANT EXECUTE ON FUNCTION clear_probe.lock_authority(), clear_probe.insert_confirmation(text,bigint,bigint,bigint,bigint,text,text,text,text,bigint,bigint) TO clear_moodle_runtime;
SQL;
    if (!pg_query($connection, str_replace('PREFIX', $prefix, $sql))) {throw new RuntimeException('INSTALL_FAILED');}
    $tables=['user','user_preferences','user_info_field','user_info_data','enrol','user_enrolments',
        'role','role_assignments','role_capabilities','capabilities','context','config','config_plugins',
        'course','course_categories','course_sections','course_modules','modules','page'];
    foreach ($tables as $table) {
        $name = $prefix . $table;
        if (!pg_query($connection,"CREATE TRIGGER clear_authority AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.$name FOR EACH STATEMENT EXECUTE FUNCTION clear_probe.bump_authority(); ALTER TABLE public.$name ENABLE ALWAYS TRIGGER clear_authority")) {throw new RuntimeException('INSTALL_FAILED');}
    }
    if (!pg_query($connection,"CREATE TRIGGER clear_session AFTER INSERT OR UPDATE OR DELETE ON public.{$prefix}sessions FOR EACH ROW EXECUTE FUNCTION clear_probe.bump_session(); ALTER TABLE public.{$prefix}sessions ENABLE ALWAYS TRIGGER clear_session")) {throw new RuntimeException('INSTALL_FAILED');}
    if (!pg_query($connection,"CREATE TRIGGER clear_session_truncate AFTER TRUNCATE ON public.{$prefix}sessions FOR EACH STATEMENT EXECUTE FUNCTION clear_probe.bump_authority(); ALTER TABLE public.{$prefix}sessions ENABLE ALWAYS TRIGGER clear_session_truncate")) {throw new RuntimeException('INSTALL_FAILED');}
    // Seed internal session generations once, as part of the offline fixture setup.
    if (!pg_query($connection,"INSERT INTO clear_probe.generations SELECT id,1 FROM public.{$prefix}sessions")) {throw new RuntimeException('INSTALL_FAILED');}
    // Reader permissions exclude passwords, sid, sessdata, page body and grades.
    $columns = [
        'sessions'=>'id,userid,state,timecreated,timemodified',
        'user'=>'id,auth,confirmed,deleted,suspended,firstname,lastname,email,policyagreed',
        'user_preferences'=>'userid,name,value', 'user_info_field'=>'id', 'user_info_data'=>'id',
        'enrol'=>'id,enrol,status,courseid', 'user_enrolments'=>'id,enrolid,userid,status,timestart,timeend',
        'course'=>'id,category,visible,enablecompletion,format,groupmode,defaultgroupingid',
        'course_categories'=>'id,parent,path,visible', 'course_sections'=>'id,course,visible,availability',
        'course_modules'=>'id,course,module,instance,section,visible,visibleoncoursepage,deletioninprogress,availability,groupmode,groupingid,completion,completiongradeitemnumber',
        'modules'=>'id,name', 'page'=>'id,course',
        'course_modules_completion'=>'id,coursemoduleid,userid,completionstate',
    ];
    foreach ($columns as $table=>$fields) {
        if (!pg_query($connection,"GRANT SELECT($fields) ON public.{$prefix}$table TO clear_moodle_reader")) {throw new RuntimeException('READER_GRANT_FAILED');}
    }
    $parts=[];
    foreach (['role','role_assignments','role_capabilities','capabilities','context','config','config_plugins'] as $table) {
        $name=$prefix.$table;
        $parts[]="'$table',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.$name t)";
    }
    $body="SELECT encode(sha256(convert_to(jsonb_build_object(".implode(',', $parts).")::text,'UTF8')),'hex')";
    $sql="CREATE FUNCTION clear_probe.metadata_pin() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,clear_probe,pg_temp AS \$pin\$ $body \$pin\$; ALTER FUNCTION clear_probe.metadata_pin() OWNER TO clear_moodle_guard; REVOKE ALL ON FUNCTION clear_probe.metadata_pin() FROM PUBLIC; GRANT EXECUTE ON FUNCTION clear_probe.metadata_pin() TO clear_moodle_reader,clear_moodle_runtime";
    if (!pg_query($connection,$sql)) {throw new RuntimeException('METADATA_FUNCTION');}
    if (!pg_query($connection,'COMMIT')) {throw new RuntimeException('INSTALL_COMMIT');}
}
