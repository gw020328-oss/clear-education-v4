CREATE TABLE IF NOT EXISTS metadata (id INTEGER PRIMARY KEY CHECK(id=1), config TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS auth_nonces (
  digest TEXT PRIMARY KEY, wallet TEXT NOT NULL, browser_digest TEXT NOT NULL,
  issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER
) STRICT;
CREATE TABLE IF NOT EXISTS sessions (
  digest TEXT PRIMARY KEY, wallet TEXT NOT NULL, issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL, revoked_at INTEGER
) STRICT;
CREATE TABLE IF NOT EXISTS policies (
  hash TEXT PRIMARY KEY, cohort_id TEXT NOT NULL, version TEXT NOT NULL, draft TEXT NOT NULL,
  UNIQUE(cohort_id, version)
) STRICT;
CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY, policy_hash TEXT NOT NULL REFERENCES policies(hash)
) STRICT;
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY, wallet TEXT NOT NULL, policy_hash TEXT NOT NULL REFERENCES policies(hash),
  state TEXT NOT NULL CHECK(state IN ('DRAFT','TERMS_ACCEPTED')),
  created_at INTEGER NOT NULL, consent_digest TEXT, consented_at INTEGER,
  CHECK((state='DRAFT' AND consent_digest IS NULL AND consented_at IS NULL)
    OR (state='TERMS_ACCEPTED' AND consent_digest IS NOT NULL AND consented_at IS NOT NULL))
) STRICT;
CREATE TABLE IF NOT EXISTS consent_nonces (
  digest TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
  session_digest TEXT NOT NULL REFERENCES sessions(digest), issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL, consumed_at INTEGER
) STRICT;
CREATE TABLE IF NOT EXISTS idempotency (
  actor TEXT NOT NULL, route TEXT NOT NULL, key TEXT NOT NULL, body_hash TEXT NOT NULL,
  application_id TEXT NOT NULL REFERENCES applications(id), PRIMARY KEY(actor,route,key)
) STRICT;
CREATE INDEX IF NOT EXISTS applications_wallet ON applications(wallet);
CREATE TRIGGER IF NOT EXISTS policy_immutable BEFORE UPDATE ON policies
  BEGIN SELECT RAISE(ABORT,'IMMUTABLE_POLICY'); END;
CREATE TRIGGER IF NOT EXISTS application_identity_immutable
  BEFORE UPDATE OF wallet,policy_hash ON applications
  BEGIN SELECT RAISE(ABORT,'IMMUTABLE_APPLICATION'); END;
