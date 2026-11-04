<?php
// Additive installer for a fresh, disposable synthetic registry. No operational migration hook.
function install_signed_registry($pg,array $anchor,array $bindings): void {
    if(getenv('CLEAR_ACTUAL_MOODLE_PROBE')!=='1'){throw new RuntimeException('SYNTHETIC_ONLY');}
    $sql=<<<'SQL'
BEGIN;
SET LOCAL ROLE clear_moodle_guard;
CREATE TABLE clear_probe.registry_head (
 id integer PRIMARY KEY CHECK(id=1), rootref text NOT NULL, rootpublic text NOT NULL,
 issuer text NOT NULL, installation text NOT NULL, audience text NOT NULL,
 controlrevision bigint NOT NULL DEFAULT 0 CHECK(controlrevision BETWEEN 0 AND 9007199254740991),
 trustepoch bigint NOT NULL DEFAULT 0 CHECK(trustepoch BETWEEN 0 AND 9007199254740991),
 keyref text, status text NOT NULL DEFAULT 'REVOKED' CHECK(status IN ('ACTIVE','REVOKED')),
 notbefore bigint NOT NULL DEFAULT 0, expiry bigint NOT NULL DEFAULT 0);
CREATE TABLE clear_probe.registry_keys (
 keyref text PRIMARY KEY, publickey text UNIQUE NOT NULL, trustepoch bigint NOT NULL,
 notbefore bigint NOT NULL, expiry bigint NOT NULL, status text NOT NULL CHECK(status IN ('ACTIVE','REVOKED')));
CREATE TABLE clear_probe.registry_bindings (
 courseref text NOT NULL, subjectref text NOT NULL, userid bigint NOT NULL, courseid bigint NOT NULL,
 moduleid bigint NOT NULL, rosterrevision bigint NOT NULL DEFAULT 0 CHECK(rosterrevision BETWEEN 0 AND 9007199254740991),
 trustepoch bigint NOT NULL DEFAULT 0, keyref text, status text NOT NULL DEFAULT 'REVOKED' CHECK(status IN ('ACTIVE','REVOKED')),
 notbefore bigint NOT NULL DEFAULT 0, expiry bigint NOT NULL DEFAULT 0, PRIMARY KEY(courseref,subjectref));
CREATE TABLE clear_probe.registry_pending (
 attemptref text PRIMARY KEY, payload text NOT NULL, status text NOT NULL CHECK(status IN ('OPEN','USED')));
CREATE TABLE clear_probe.registry_receipts (
 digest text PRIMARY KEY, kind text NOT NULL, acceptedat bigint NOT NULL);
SQL;
    try {
        if(!@pg_query($pg,$sql)){throw new RuntimeException('REGISTRY_INSTALL');}
        foreach(['registry_head','registry_keys','registry_bindings','registry_pending','registry_receipts'] as $table) {
            if(!@pg_query($pg,"CREATE TRIGGER clear_{$table}_authority AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
                ON clear_probe.$table FOR EACH STATEMENT EXECUTE FUNCTION clear_probe.bump_authority();
                ALTER TABLE clear_probe.$table ENABLE ALWAYS TRIGGER clear_{$table}_authority")) {throw new RuntimeException('REGISTRY_INSTALL');}
        }
        if(!@pg_query_params($pg,'INSERT INTO clear_probe.registry_head(id,rootref,rootpublic,issuer,installation,audience)
            VALUES(1,$1,$2,$3,$4,$5)',[$anchor['rootRef'],$anchor['publicKey'],$anchor['issuerEpoch'],$anchor['installationRef'],$anchor['audience']])) {
            throw new RuntimeException('REGISTRY_INSTALL');
        }
        foreach($bindings as $b) {
            if(!@pg_query_params($pg,'INSERT INTO clear_probe.registry_bindings(courseref,subjectref,userid,courseid,moduleid)
                VALUES($1,$2,$3,$4,$5)',[$b['courseRef'],$b['subjectRef'],$b['user'],$b['course'],$b['module']])) {throw new RuntimeException('REGISTRY_INSTALL');}
        }
        if(!@pg_query($pg,'COMMIT')){throw new RuntimeException('REGISTRY_INSTALL');}
    } catch(Throwable $e) {@pg_query($pg,'ROLLBACK');throw new RuntimeException('REGISTRY_INSTALL');}
}
