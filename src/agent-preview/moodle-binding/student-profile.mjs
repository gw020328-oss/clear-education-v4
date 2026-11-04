import { getAddress } from 'ethers';
import { applicationSchema, bindingAuthoritySchema } from '../../application/store.mjs';
import { isApplicationBindingManifest } from '../../application/service.mjs';
import { studentSchema, isStudentBindingManifest } from '../../product-workflow/student-http-service.mjs';
import { schemas, columns } from './schema.mjs';
import { canonical, exact, hash, hex, opaque, integer, requireRule } from './contract.mjs';

import { registerStudentProfile } from './projection-profiles.mjs';
const wallet = value => {
  try { return getAddress(value).toLowerCase(); } catch { throw new Error('AUTH_REQUIRED'); }
};
const positive = v => integer(v) && v > 0;

// The registry is an explicit synthetic approval, never an inferred institution identity.
// Only manifests issued by the owning services may select these source files.
export function createSyntheticStudentProjection({ authentication, student, registry }) {
  requireRule(isApplicationBindingManifest(authentication) && isStudentBindingManifest(student), 'PRODUCT_MANIFEST');
  requireRule(canonical(student.auth) === canonical(authentication), 'PRODUCT_AUTH_MISMATCH');
  const r = structuredClone(registry);
  exact(r, ['mode', 'applicationId', 'policyId', 'policyHash', 'policyRevision', 'bindingRevision',
    'participantRef', 'wallet', 'installationRef', 'courseRef', 'subjectRef']);
  requireRule(r.mode === 'SYNTHETIC_ONLY', 'SYNTHETIC_ONLY');
  for (const key of ['applicationId', 'policyId', 'participantRef', 'installationRef', 'courseRef', 'subjectRef']) requireRule(opaque(r[key]), 'REGISTRY_REF');
  requireRule(/^0x[a-f0-9]{64}$/.test(r.applicationId) && /^0x[a-f0-9]{64}$/.test(r.policyHash)
    && positive(r.policyRevision) && positive(r.bindingRevision) && wallet(r.wallet) === r.wallet, 'REGISTRY_SCOPE');
  const auth = authentication, bindingHash = hash(r);
  requireRule(hex(auth.configHash) && positive(auth.revision)
    && auth.roleConfig.participants.includes(r.wallet) && !auth.roleConfig.operators.includes(r.wallet), 'REGISTRY_ROLE');
  const projection = Object.freeze({ kind: 'C1_STUDENT_SYNTHETIC', mappingHash: bindingHash,
    authConfigHash: auth.configHash, authRevision: auth.revision });
  registerStudentProfile(projection, {
    paths: { auth: auth.path, workflow: student.path }, wallet,
    schemas: { main: schemas.main, auth: applicationSchema + bindingAuthoritySchema,
      workflow: 'CREATE TABLE IF NOT EXISTS metadata(id INTEGER PRIMARY KEY CHECK(id=1),config TEXT NOT NULL) STRICT;' + studentSchema },
    columns: { main: columns.main,
      auth: { metadata: ['id', 'config'], binding_authority: ['id', 'revision', 'config_hash'], sessions: columns.auth.sessions },
      workflow: { metadata: ['id', 'config'],
        applications: ['id', 'wallet', 'policy_id', 'policy_hash', 'revision', 'binding_revision', 'state', 'ack_id', 'updated_at'],
        policy_heads: ['id', 'hash', 'revision', 'active'], acknowledgments: ['id', 'application_id'] } },
    environment(get, p) {
      requireRule(get('SELECT config FROM auth.metadata WHERE id=1')?.config === auth.metadata
        && get('SELECT config FROM workflow.metadata WHERE id=1')?.config === student.metadata, 'CONFIG_CHANGED');
      const current = get('SELECT revision,config_hash FROM auth.binding_authority WHERE id=1');
      requireRule(current?.revision === auth.revision && current.config_hash === auth.configHash, 'AUTHORITY_STALE_WORKER');
      requireRule(p.configHash === auth.configHash && p.authorityRevision === auth.revision && p.chainId === auth.roleConfig.chainId,
        'AUTHORITY_POLICY');
      requireRule(p.mappingHash === bindingHash && p.wallet === r.wallet && p.participantRef === r.participantRef
        && p.installationRef === r.installationRef && p.courseRef === r.courseRef && p.expectedSubjectRef === r.subjectRef, 'REGISTRY_SCOPE');
    },
    application(get, id, _p, session, now) {
      requireRule(id === r.applicationId, 'APPLICATION_SCOPE');
      const a = get('SELECT id,wallet,policy_id,policy_hash,revision,binding_revision,state,ack_id,updated_at FROM workflow.applications WHERE id=?', id);
      requireRule(a && wallet(a.wallet) === wallet(session.wallet) && a.state === 'ACKNOWLEDGED_SYNTHETIC'
        && positive(a.revision) && a.binding_revision === r.bindingRevision && integer(a.updated_at) && a.updated_at <= now
        && a.policy_id === r.policyId && a.policy_hash === r.policyHash && typeof a.ack_id === 'string', 'APPLICATION_SCOPE');
      const head = get('SELECT hash,revision,active FROM workflow.policy_heads WHERE id=?', a.policy_id);
      requireRule(head?.active === 1 && head.hash === a.policy_hash && head.revision === r.policyRevision, 'POLICY_NOT_CURRENT');
      requireRule(get('SELECT application_id FROM workflow.acknowledgments WHERE id=?', a.ack_id)?.application_id === id, 'ACKNOWLEDGMENT_REQUIRED');
      return a;
    },
  });
  return projection;
}
