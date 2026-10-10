import { open } from 'node:fs/promises';
import { MAX_EVIDENCE_BYTES, parseEvidenceText } from './evidence.mjs';

export async function readEvidence(path) {
  const handle=await open(path,'r');
  try {
    const stat=await handle.stat();
    if(stat.size>MAX_EVIDENCE_BYTES) throw Object.assign(new Error('FILE_TOO_LARGE'),{code:'FILE_TOO_LARGE'});
    return parseEvidenceText(await handle.readFile('utf8'));
  } finally { await handle.close(); }
}
