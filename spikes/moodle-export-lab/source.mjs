import { validateLearningFactsShape } from '../../src/policy/mvp/learning-contract.mjs';
import { validateContract, digest, same } from '../../src/policy/mvp/contract.mjs';
import { factsDigest, pageDigest } from '../../src/learning-evidence/moodle-mvp/daily.mjs';
import { freeze, requireRule as check } from '../../src/policy/values.mjs';

export const EXPORT_PROFILE = 'synthetic-moodle-export.1';
const encode = value => JSON.stringify(JSON.stringify(value)); // Moodle PARAM_RAW-style REST wrapping.
function seal(input, revision) {
  const f = structuredClone(input); f.snapshot.sourceRevision = revision;
  for (const row of f.records) row.recordRevision = revision;
  const s = f.snapshot, pages = [];
  for (let offset = 0; offset < f.records.length; offset += 100) {
    const rows = f.records.slice(offset, offset + 100);
    pages.push({ pageId: 'page-' + pages.length, offset, rowCount: rows.length, pageDigest: pageDigest(rows) });
  }
  check(pages.length > 0, 'EXPORT_EMPTY_INVENTORY');
  s.totalRows = f.records.length;
  s.pageManifest = { pages, terminalPageId: pages.at(-1).pageId, manifestDigest: digest('CLEAR-MOODLE-MANIFEST', {
    sourceRevision: revision, totalRows: s.totalRows, terminalPageId: pages.at(-1).pageId, pages,
  }) };
  s.normalizedDigest = factsDigest(f); validateLearningFactsShape(f); return freeze(f);
}

// An isolated in-memory protocol model, not a Moodle plugin or institution API.
// Each committed head is immutable; read clients have no mutation capability.
export function createSyntheticExportLab(seed, sourceBinding) {
  validateLearningFactsShape(seed); validateContract('SourceBinding', sourceBinding);
  check(seed.dataMode === 'SYNTHETIC', 'EXPORT_SYNTHETIC_ONLY');
  const sb = structuredClone(sourceBinding); let revision = 1, head = seal(seed, 'r1');
  const audit = [freeze({ revision: 'r1', previousRevision: null, reason: 'INITIAL_SYNTHETIC_EXPORT', factsHash: head.snapshot.normalizedDigest })];
  return {
    // Explicit internal resolver access, not a value copied from readManifest.
    resolveSyntheticHead() { return structuredClone(head); },
    audit() { return structuredClone(audit); },
    correct(expectedRevision, records, reason) {
      check(expectedRevision === head.snapshot.sourceRevision, 'EXPORT_REVISION_CONFLICT');
      check(['RECORD_CORRECTION', 'SOURCE_UNAVAILABLE', 'SOURCE_RESTORED'].includes(reason), 'EXPORT_CORRECTION_REASON');
      const candidate = { ...head, records: structuredClone(records), snapshot: { ...head.snapshot, correctionState: 'CORRECTED' } };
      const next = seal(candidate, 'r' + (revision + 1));
      audit.push(freeze({ revision: next.snapshot.sourceRevision, previousRevision: head.snapshot.sourceRevision,
        reason, factsHash: next.snapshot.normalizedDigest }));
      head = next; revision++; return head.snapshot.sourceRevision;
    },
    connect() {
      let closed = false;
      const authorize = q => {
        check(!closed, 'EXPORT_CLOSED'); check(same(q.sourceBinding, sb), 'EXPORT_SCOPE');
        check(q.expectedRevision === head.snapshot.sourceRevision, 'EXPORT_REVISION_CHANGED');
      };
      return {
        profile: EXPORT_PROFILE, transport: 'IN_MEMORY_ONLY',
        async readManifest(q) {
          authorize(q); const { records: _, ...header } = head;
          return encode({ profile: EXPORT_PROFILE, header });
        },
        async readPage(q) {
          authorize(q); const page = head.snapshot.pageManifest.pages.find(p => p.pageId === q.pageId);
          check(page, 'EXPORT_PAGE_NOT_ALLOWED');
          return encode({ profile: EXPORT_PROFILE, revision: head.snapshot.sourceRevision, pageId: page.pageId,
            records: head.records.slice(page.offset, page.offset + page.rowCount) });
        },
        async close() { closed = true; },
      };
    },
  };
}
