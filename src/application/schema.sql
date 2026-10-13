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

CREATE TABLE IF NOT EXISTS runtime_configs (
  hash TEXT PRIMARY KEY, policy_hash TEXT NOT NULL UNIQUE REFERENCES policies(hash),
  cohort_id TEXT NOT NULL UNIQUE, record TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS final_challenges (
  digest TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
  session_digest TEXT NOT NULL REFERENCES sessions(digest), runtime_hash TEXT NOT NULL REFERENCES runtime_configs(hash),
  issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER
) STRICT;
CREATE TABLE IF NOT EXISTS funding (
  application_id TEXT PRIMARY KEY REFERENCES applications(id), runtime_hash TEXT NOT NULL REFERENCES runtime_configs(hash),
  state TEXT NOT NULL CHECK(state IN ('CONSENTED','FUNDING_PENDING','ENROLLED')),
  typed_data TEXT NOT NULL, signature TEXT NOT NULL, consent_digest TEXT NOT NULL,
  evidence TEXT, CHECK((state='ENROLLED' AND evidence IS NOT NULL) OR (state!='ENROLLED' AND evidence IS NULL))
) STRICT;
CREATE TRIGGER IF NOT EXISTS runtime_immutable BEFORE UPDATE ON runtime_configs
  BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RUNTIME'); END;

-- Only wallet binding authorization is consumed here; no proof acceptance or
-- eligibility is implied. B2/B4 must add their own one-time result transition.
CREATE TABLE IF NOT EXISTS proof_sessions (
  id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
  session_digest TEXT NOT NULL REFERENCES sessions(digest),
  runtime_hash TEXT NOT NULL REFERENCES runtime_configs(hash),
  request_key TEXT NOT NULL, owner_address TEXT NOT NULL UNIQUE,
  nonce_digest TEXT NOT NULL UNIQUE, typed_data TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('ISSUED','AUTHORIZED','CANCELLED','EXPIRED')),
  issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL CHECK(expires_at > issued_at),
  consumed_at INTEGER, signature_hash TEXT, binding_digest TEXT,
  issuance_evidence TEXT NOT NULL, authorization_evidence TEXT,
  UNIQUE(application_id,request_key),
  CHECK((consumed_at IS NULL AND signature_hash IS NULL AND binding_digest IS NULL AND authorization_evidence IS NULL AND state!='AUTHORIZED')
    OR (consumed_at IS NOT NULL AND signature_hash IS NOT NULL AND binding_digest IS NOT NULL AND authorization_evidence IS NOT NULL AND state!='ISSUED'))
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS proof_session_active ON proof_sessions(application_id)
  WHERE state IN ('ISSUED','AUTHORIZED');
CREATE TRIGGER IF NOT EXISTS proof_session_identity_immutable
  BEFORE UPDATE OF application_id,session_digest,runtime_hash,request_key,owner_address,nonce_digest,typed_data,issued_at,expires_at,issuance_evidence ON proof_sessions
  BEGIN SELECT RAISE(ABORT,'IMMUTABLE_PROOF_SESSION'); END;

-- B2b: a separate one-time acceptance, not B1 wallet nonce consumption.
-- Only verified synthetic minimal fields are persisted; never raw proof/signatures.
CREATE TABLE IF NOT EXISTS proof_results (
  proof_session_id TEXT PRIMARY KEY REFERENCES proof_sessions(id),
  submission_hash TEXT NOT NULL, snapshot_hash TEXT NOT NULL,
  verifier_version TEXT NOT NULL, source_signer TEXT NOT NULL,
  accepted_at INTEGER NOT NULL, observed_at INTEGER NOT NULL,
  snapshot TEXT NOT NULL, chain_evidence TEXT NOT NULL
) STRICT;
CREATE TRIGGER IF NOT EXISTS proof_result_immutable BEFORE UPDATE ON proof_results
  BEGIN SELECT RAISE(ABORT,'IMMUTABLE_PROOF_RESULT'); END;
