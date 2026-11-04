-- Disposable synthetic database only. Not a Moodle migration.
BEGIN;
DO $$ BEGIN IF current_database()<>'clear_profile' THEN RAISE EXCEPTION 'SYNTHETIC_DATABASE_REQUIRED'; END IF; END $$;
CREATE ROLE clear_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE clear_runtime LOGIN PASSWORD 'synthetic-runtime' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE clear_reader LOGIN PASSWORD 'synthetic-reader' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
REVOKE ALL ON DATABASE clear_profile FROM PUBLIC;
GRANT CONNECT ON DATABASE clear_profile TO clear_runtime, clear_reader;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE SET ON PARAMETER session_replication_role FROM PUBLIC, clear_runtime, clear_reader;
CREATE SCHEMA clear_source AUTHORIZATION clear_owner;
CREATE SCHEMA clear_guard AUTHORIZATION clear_owner;
SET ROLE clear_owner;
CREATE TABLE clear_guard.authority (id integer PRIMARY KEY CHECK(id=1), revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991));
INSERT INTO clear_guard.authority VALUES(1,1);
CREATE TABLE clear_guard.session_generations (session_id bigint PRIMARY KEY, generation bigint NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740991));
CREATE TABLE clear_source.sessions (id bigint PRIMARY KEY, userid bigint NOT NULL, timecreated bigint NOT NULL, timemodified bigint NOT NULL, sessdata text NOT NULL);
CREATE TABLE clear_source.profile (id integer PRIMARY KEY CHECK(id=1), approved_hash text NOT NULL, installation_epoch text NOT NULL);
CREATE TABLE clear_source.users (id bigint PRIMARY KEY, auth text NOT NULL, suspended boolean NOT NULL, deleted boolean NOT NULL, guest boolean NOT NULL, admin boolean NOT NULL, forcepasswordchange boolean NOT NULL, fullysetup boolean NOT NULL);
CREATE TABLE clear_source.enrolments (id bigint PRIMARY KEY, userid bigint NOT NULL, courseid bigint NOT NULL, method text NOT NULL, active boolean NOT NULL, timestart bigint NOT NULL, timeend bigint NOT NULL);
-- acl_hash binds all ancestor/default/student capability rows in this synthetic model.
CREATE TABLE clear_source.course_gate (courseid bigint PRIMARY KEY, acl_hash text NOT NULL, visible boolean NOT NULL, ancestors_visible boolean NOT NULL, unrestricted boolean NOT NULL);
CREATE TABLE clear_source.page_gate (moduleid bigint PRIMARY KEY, courseid bigint NOT NULL, instanceid bigint NOT NULL, visible boolean NOT NULL, section_visible boolean NOT NULL, deletioninprogress boolean NOT NULL, availability text NOT NULL, groupmode integer NOT NULL, groupingid bigint NOT NULL, stealth boolean NOT NULL, completion integer NOT NULL, module_type text NOT NULL);
CREATE TABLE clear_source.completion (id bigint PRIMARY KEY, userid bigint NOT NULL, moduleid bigint NOT NULL, completionstate integer NOT NULL);
CREATE FUNCTION clear_guard.bump_authority() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,clear_guard,pg_temp AS $$
BEGIN
 UPDATE clear_guard.authority SET revision=revision+1 WHERE id=1 AND revision<9007199254740991;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTHORITY_UNAVAILABLE'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION clear_guard.bump_authority() FROM PUBLIC;
CREATE FUNCTION clear_guard.bump_session() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,clear_guard,pg_temp AS $$
DECLARE target bigint;
BEGIN
 IF TG_OP='UPDATE' AND NEW.id<>OLD.id THEN RAISE EXCEPTION 'SESSION_ID_IMMUTABLE'; END IF;
 target := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 INSERT INTO clear_guard.session_generations VALUES(target,1)
 ON CONFLICT(session_id) DO UPDATE SET generation=clear_guard.session_generations.generation+1;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION clear_guard.bump_session() FROM PUBLIC;
CREATE TRIGGER session_generation AFTER INSERT OR UPDATE OR DELETE ON clear_source.sessions FOR EACH ROW EXECUTE FUNCTION clear_guard.bump_session();
ALTER TABLE clear_source.sessions ENABLE ALWAYS TRIGGER session_generation;
CREATE TRIGGER session_truncate AFTER TRUNCATE ON clear_source.sessions FOR EACH STATEMENT EXECUTE FUNCTION clear_guard.bump_authority();
ALTER TABLE clear_source.sessions ENABLE ALWAYS TRIGGER session_truncate;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['profile','users','enrolments','course_gate','page_gate'] LOOP
  EXECUTE format('CREATE TRIGGER authority_change AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON clear_source.%I FOR EACH STATEMENT EXECUTE FUNCTION clear_guard.bump_authority()',t);
  EXECUTE format('ALTER TABLE clear_source.%I ENABLE ALWAYS TRIGGER authority_change',t);
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA clear_source,clear_guard TO clear_runtime,clear_reader;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA clear_source TO clear_runtime;
GRANT SELECT ON clear_guard.authority,clear_guard.session_generations TO clear_runtime,clear_reader;
GRANT SELECT ON clear_source.profile,clear_source.users,clear_source.enrolments,clear_source.course_gate,clear_source.page_gate,clear_source.completion TO clear_reader;
GRANT SELECT(id,userid,timecreated,timemodified) ON clear_source.sessions TO clear_reader;
RESET ROLE;
COMMIT;
