<?php
// Synthetic PostgreSQL mechanism probe. Never load Moodle or production configuration.
if (PHP_SAPI !== 'cli' || getenv('CLEAR_EPOCH_PROBE') !== '1') {
    exit(1);
}
function connection() {
    return pg_connect('host=clear-epoch-db dbname=epoch_probe user=probe password=synthetic-only', PGSQL_CONNECT_FORCE_NEW);
}
function sql($db, string $query) {
    $result = pg_query($db, $query);
    if ($result === false) {
        throw new RuntimeException('PROBE_SQL_FAILED');
    }
    return $result;
}
function scalar($db, string $query): string {
    return (string)pg_fetch_result(sql($db, $query), 0, 0);
}
function check(bool $value, string $name): void {
    if (!$value) {
        throw new RuntimeException('FAILED ' . $name);
    }
    echo 'PASS ' . $name . PHP_EOL;
}
$a = connection();
$b = connection();
sql($a, <<<'SQL'
CREATE TABLE authority_epoch (id integer PRIMARY KEY CHECK(id=1), generation bigint NOT NULL);
INSERT INTO authority_epoch VALUES(1,0);
CREATE TABLE probe_enrolment (id integer PRIMARY KEY, status integer, timemodified bigint);
CREATE TABLE probe_session (id integer PRIMARY KEY, userid integer);
CREATE TABLE probe_fact (id integer PRIMARY KEY, value integer);
INSERT INTO probe_enrolment VALUES(1,0,100);
INSERT INTO probe_session VALUES(1,7);
INSERT INTO probe_fact VALUES(1,1);
CREATE FUNCTION bump_epoch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE authority_epoch SET generation=generation+1 WHERE id=1;
  IF NOT FOUND THEN RAISE EXCEPTION 'EPOCH_MISSING'; END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER enrol_epoch AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON probe_enrolment
FOR EACH STATEMENT EXECUTE FUNCTION bump_epoch();
CREATE TRIGGER session_epoch AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON probe_session
FOR EACH STATEMENT EXECUTE FUNCTION bump_epoch();
SQL);
$initial = scalar($a, 'SELECT generation FROM authority_epoch');
sql($a, 'BEGIN; UPDATE probe_enrolment SET status=1; UPDATE probe_enrolment SET status=0; COMMIT');
check(scalar($a, 'SELECT generation FROM authority_epoch') === (string)((int)$initial + 2)
    && scalar($a, 'SELECT status FROM probe_enrolment') === '0'
    && scalar($a, 'SELECT timemodified FROM probe_enrolment') === '100', 'same timestamp suspend restore advances epoch');
$before = scalar($a, 'SELECT generation FROM authority_epoch');
sql($a, 'BEGIN; DELETE FROM probe_session; ROLLBACK');
check(scalar($a, 'SELECT generation FROM authority_epoch') === $before
    && scalar($a, 'SELECT count(*) FROM probe_session') === '1', 'rollback preserves session and epoch together');
sql($a, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
$old = scalar($a, 'SELECT generation FROM authority_epoch');
sql($b, 'BEGIN; DELETE FROM probe_session; UPDATE probe_fact SET value=2; COMMIT');
check(scalar($a, 'SELECT count(*) FROM probe_session') === '1'
    && scalar($a, 'SELECT value FROM probe_fact') === '1'
    && scalar($a, 'SELECT generation FROM authority_epoch') === $old, 'old snapshot keeps session authority and fact coherent');
sql($a, 'COMMIT');
check(scalar($a, 'SELECT count(*) FROM probe_session') === '0'
    && scalar($a, 'SELECT value FROM probe_fact') === '2'
    && scalar($a, 'SELECT generation FROM authority_epoch') !== $old, 'next snapshot observes deletion and new fact');
sql($a, 'BEGIN; UPDATE probe_enrolment SET status=1');
sql($b, "SET lock_timeout='200ms'");
// Session insertion is a different base table, but must contend on the same epoch row.
pg_send_query($b, 'INSERT INTO probe_session VALUES(2,7)');
$result = pg_get_result($b);
check(pg_result_error_field($result, PGSQL_DIAG_SQLSTATE) === '55P03', 'concurrent authority writer contends on epoch row');
sql($a, 'COMMIT');
check(scalar($b, 'SELECT count(*) FROM probe_session') === '0', 'blocked statement leaves no partial session');
$before = scalar($a, 'SELECT generation FROM authority_epoch');
sql($a, 'ALTER TABLE probe_enrolment DISABLE TRIGGER enrol_epoch; UPDATE probe_enrolment SET status=0');
check(scalar($a, 'SELECT generation FROM authority_epoch') === $before,
    'owner trigger bypass reproduces unchanged epoch despite authority change');
