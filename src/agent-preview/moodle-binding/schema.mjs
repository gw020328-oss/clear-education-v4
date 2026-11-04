export const schemas = Object.freeze({
  main: `
CREATE TABLE policy(id INTEGER PRIMARY KEY CHECK(id=1),record TEXT NOT NULL) STRICT;
CREATE TABLE clock(id INTEGER PRIMARY KEY CHECK(id=1),floor INTEGER NOT NULL) STRICT;
CREATE TABLE generations(application_id TEXT PRIMARY KEY,generation INTEGER NOT NULL) STRICT;
CREATE TABLE attempts(id TEXT PRIMARY KEY,application_id TEXT NOT NULL,generation INTEGER NOT NULL,session_ref TEXT NOT NULL,scope_hash TEXT NOT NULL,policy_hash TEXT NOT NULL,app_revision INTEGER NOT NULL,preview_digest TEXT,status TEXT NOT NULL CHECK(status IN ('PENDING','CONSUMED','REVOKED')),issued_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,confirmation TEXT,binding_id TEXT) STRICT;
CREATE UNIQUE INDEX pending_app ON attempts(application_id) WHERE status='PENDING';
CREATE TABLE bindings(id TEXT PRIMARY KEY,attempt_id TEXT NOT NULL UNIQUE REFERENCES attempts(id),application_id TEXT NOT NULL,installation_ref TEXT NOT NULL,course_ref TEXT NOT NULL,subject_ref TEXT NOT NULL,session_ref TEXT NOT NULL,policy_hash TEXT NOT NULL,app_revision INTEGER NOT NULL,scope_hash TEXT NOT NULL,confirmation TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('ACTIVE','REVOKED')),expires_at INTEGER NOT NULL) STRICT;
CREATE UNIQUE INDEX binding_app ON bindings(application_id) WHERE status='ACTIVE';
CREATE UNIQUE INDEX binding_subject ON bindings(installation_ref,course_ref,subject_ref) WHERE status='ACTIVE';
CREATE TABLE requests(id TEXT PRIMARY KEY,attempt_id TEXT NOT NULL REFERENCES attempts(id),kind TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('OPEN','USED','CANCELLED')),issued_at INTEGER NOT NULL) STRICT;
CREATE TABLE audit(id TEXT PRIMARY KEY,event TEXT NOT NULL,ref TEXT NOT NULL,at INTEGER NOT NULL) STRICT;`,
  auth: `
CREATE TABLE metadata(id INTEGER PRIMARY KEY CHECK(id=1),config_hash TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode='SYNTHETIC_ONLY')) STRICT;
CREATE TABLE sessions(digest TEXT PRIMARY KEY,wallet TEXT NOT NULL,issued_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,revoked_at INTEGER) STRICT;
CREATE TABLE secrets(raw_token TEXT NOT NULL) STRICT;`,
  workflow: `
CREATE TABLE metadata(id INTEGER PRIMARY KEY CHECK(id=1),mode TEXT NOT NULL CHECK(mode='SYNTHETIC_ONLY')) STRICT;
CREATE TABLE applications(id TEXT PRIMARY KEY,participant_id TEXT NOT NULL,wallet TEXT NOT NULL,course_ref TEXT NOT NULL,mapping_hash TEXT NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL) STRICT;
CREATE TABLE proofs(raw_secret TEXT NOT NULL) STRICT;`,
});
export const columns = Object.freeze({
  main: {
    policy: ['id', 'record'], clock: ['id', 'floor'], generations: ['application_id', 'generation'],
    attempts: ['id', 'application_id', 'generation', 'session_ref', 'scope_hash', 'policy_hash', 'app_revision', 'preview_digest', 'status', 'issued_at', 'expires_at', 'confirmation', 'binding_id'],
    bindings: ['id', 'attempt_id', 'application_id', 'installation_ref', 'course_ref', 'subject_ref', 'session_ref', 'policy_hash', 'app_revision', 'scope_hash', 'confirmation', 'status', 'expires_at'],
    requests: ['id', 'attempt_id', 'kind', 'state', 'issued_at'], audit: ['id', 'event', 'ref', 'at'],
  },
  auth: { metadata: ['id', 'config_hash', 'mode'], sessions: ['digest', 'wallet', 'issued_at', 'expires_at', 'revoked_at'] },
  workflow: { metadata: ['id', 'mode'], applications: ['id', 'participant_id', 'wallet', 'course_ref', 'mapping_hash', 'revision', 'status'] },
});
