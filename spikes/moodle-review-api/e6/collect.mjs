import {writeFile} from 'node:fs/promises';
import {query,collect,php,metrics} from './runtime.mjs';
import {openMoodleSourceSession} from '../../../src/review-evidence/moodle/source-session.mjs';
import {bootcampMoodleRequestHash} from '../../../src/review-evidence/moodle/bootcamp.mjs';
import {p0Hash} from '../../../specs/bootcamp/p0-contract.mjs';
import {normalizeReviewBody,normalizedReviewContentHash} from '../../../src/review-evidence/common/normalizer.mjs';
import {bytesDigest} from '../../../src/product-workflow/contract.mjs';
const rows=[],ttlMs=Number(process.argv[2]??45000);
for(const criterion of ['activity-complete','assignment-submitted','reflection-topics']){
 const q=await query(criterion,{ttlMs}),authority={available:true,requestHash:bootcampMoodleRequestHash(q),pinHash:p0Hash('MOODLE-PIN',q.pin),sourceEpoch:'e6-live',authExpiresAtMs:q.context.expiresAtMs,rawExpiresAtMs:q.context.issuedAtMs+1800000,queryExpiresAtMs:q.context.expiresAtMs};
 const session=await openMoodleSourceSession({request:q,collect,resolveCurrent:()=>authority});
 try{
  const raw=await session.getRaw();let textMetadata=null;
  if(criterion==='reflection-topics'){
   const n=normalizeReviewBody(raw.body,raw.messageFormat);
   textMetadata={messageFormat:raw.messageFormat,rawUtf16Units:raw.body.length,rawUtf8Bytes:Buffer.byteLength(raw.body),rawBodySha256:bytesDigest(Buffer.from(raw.body)),normalizerVersion:n.version,normalizedContentHash:normalizedReviewContentHash({version:n.version,title:raw.subject,body:n.text}),spanBasis:'ORIGINAL_BODY_HTML_UTF16',normalizedToOriginalOffsetMapSupported:false,actualQuotesOrBodyPublished:false};
  }
  rows.push({criterion,requestHash:session.metadata.requestHash,sourceHash:session.metadata.sourceHash,sourceReceiptHash:session.metadata.sourceReceiptHash,facts:session.metadata.facts,sourceObserved:session.metadata.acquisition.observed,rawLeaseExpiresAtMs:session.expiresAtMs,textMetadata});
 }finally{session.dispose();}
}
const report={version:'clear-moodle-e6-collection-report.1',date:'2026-10-18',collectedAtMs:Date.now(),execution:'ACTUAL_LOCAL_SYNTHETIC_SOURCE',records:rows,metrics,credentialAudit:php('credential.php',{action:'audit'}),collectorLeasesDisposed:true,targetsDeleted:false,containerStopPerformed:false,productRuntimeReady:false,aiModelCalls:0,personalSources:0};
await writeFile(new URL('./collection-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({collected:rows.length,metrics,tokensRemaining:report.credentialAudit.activeTokens,bodiesPublished:false,collectorLeasesDisposed:true}));
