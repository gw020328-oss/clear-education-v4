// Executable CONTRACT PROPOSAL. No production import, network, storage or acceptance.
import {exactKeys,freeze,requireRule as check} from '../../src/policy/values.mjs';
import {digest,same,validateContract} from '../../src/policy/mvp/contract.mjs';
import {requireMvpPolicy} from '../../src/policy/mvp/compiler.mjs';
import {identifier,revision,hash32,bytesDigest,verifyDocumentManifest,runContextHash} from '../../src/product-workflow/contract.mjs';

export const REVIEW_SOURCE_VERSION='clear-review-source-binding-proposal.1';
export const NORMALIZER='clear-review-plain-nfc-lf.1';
const hash=(kind,value)=>digest('CLEAR-REVIEW-'+kind+'-PROPOSAL.1',value);
const millis=n=>check(Number.isSafeInteger(n)&&n>=0,'RS_CLOCK');
const positive=n=>check(Number.isSafeInteger(n)&&n>0,'RS_LOCATOR');
const gates={contractOnly:true,usableForAcceptance:false,realDataAllowed:false,identityVerified:false,
 academyAcceptance:'UNKNOWN',contentTruth:'UNKNOWN',automaticEligibility:false,productEligible:false,
 paymentAllowed:false,grant:'HOLD',outbox:'HOLD',independentClaim:'NO_GO'};

// Equality profile only; NOT the academy's official character/byte count rule.
// Moodle FORMAT_PLAIN=2 only. HTML/Moodle/Markdown require a separately reviewed extractor.
export function normalizeReviewText(value,format=2){
 check(format===2,'RS_NORMALIZATION_UNSUPPORTED');
 check(typeof value==='string'&&value.isWellFormed()&&!value.includes('\0')&&Buffer.byteLength(value)<=131072,'RS_TEXT');
 return value.replace(/\r\n?/g,'\n').normalize('NFC');
}
export const registryHash=record=>hash('REGISTRY',record);
export const sourceReceiptHash=receipt=>hash('SOURCE-RECEIPT',receipt);
export const acquisitionPinHash=(context,registry)=>hash('ACQUISITION-PIN',{
 contextHash:runContextHash(context),sourceBinding:registry.sourceBinding,readerId:registry.readerId,
 instanceRef:registry.locator.instanceRef,courseId:registry.locator.courseId,forumId:registry.locator.forumId,
 postId:registry.locator.id,authorId:registry.locator.authorId});

export function proposeReviewCorrelation({compiled,context,submission,files,registry,facts,acquisition,sourceRunId,sourceGeneration,nowMs,rawExpiresAtMs}){
 const contextHash=runContextHash(context),s=context.snapshot,p=requireMvpPolicy(compiled);
 check(p.mode==='SYNTHETIC'&&p.requirements.find(r=>r.requirementId===s.requirementId)?.kind==='REVIEW','RS_GENERAL_REVIEW_ONLY');
 check(s.binding.policyHash===compiled.policyHash&&s.binding.policyVersion===p.policyVersion
  &&s.binding.productId===p.productId&&s.binding.cohortId===p.cohortId,'RS_POLICY');
 verifyDocumentManifest(s.manifest,submission,files);
 check(submission.submissionId===s.submissionId&&submission.revision===s.submissionRevision&&submission.routeRevision===s.routeRevision,'RS_SUBMISSION');
 exactKeys(registry,['registryId','revision','status','binding','requirementId','sourceBinding','locator','readerId','postId','normalizer','freshness','audit'],'RS_REGISTRY');
 identifier(registry.registryId);revision(registry.revision);validateContract('SourceBinding',registry.sourceBinding);
 check(registry.status==='REVIEWED_SYNTHETIC_MAPPING'&&same(registry.binding,s.binding)&&registry.requirementId===s.requirementId,'RS_MAPPING');
 check(registry.sourceBinding.institutionId===p.institutionId&&registry.sourceBinding.courseId===p.productId,'RS_MAPPING');
 exactKeys(registry.locator,['instanceRef','courseId','forumId','id','authorId'],'RS_LOCATOR');
 identifier(registry.locator.instanceRef);for(const key of ['courseId','forumId','id','authorId'])positive(registry.locator[key]);positive(registry.readerId);
 identifier(registry.postId);check(registry.normalizer===NORMALIZER,'RS_NORMALIZATION_UNSUPPORTED');
 exactKeys(registry.freshness,['basis','maxAgeMs'],'RS_FRESHNESS');
 check(registry.freshness.basis==='CONTRACT_FIXTURE_ONLY'&&Number.isSafeInteger(registry.freshness.maxAgeMs)
  &&registry.freshness.maxAgeMs>0&&registry.freshness.maxAgeMs<=300000,'RS_FRESHNESS');
 exactKeys(registry.audit,['actorRef','reason','recordedAtMs'],'RS_AUDIT');identifier(registry.audit.actorRef);identifier(registry.audit.reason);millis(registry.audit.recordedAtMs);
 check(facts.version==='clear-local-moodle-review.1'&&facts.provenance==='LOCAL_LMS_RECORD'
  &&facts.purpose==='READ_ONLY_SOURCE_FACTS'&&facts.usableForAcceptance===false&&facts.submissionContentBinding==='NOT_ESTABLISHED'
  &&facts.identityVerified===false&&facts.academyAcceptance==='UNKNOWN'&&facts.contentTruth==='UNKNOWN'
  &&facts.automaticEligibility===false&&facts.paymentAllowed===false&&facts.independentClaim==='NO_GO','RS_FACTS');
 check(facts.runContextHash===contextHash&&runContextHash(facts.context)===contextHash,'RS_RUN');
 check(same(facts.sourceBinding,registry.sourceBinding)&&facts.accountMappingVerification==='HOST_PIN_ONLY','RS_MAPPING');
 // PR71 does not export its reader/pin receipt. This proposed host sidecar is
 // explicit fixture data, never a claim that the current adapter issues it.
 exactKeys(acquisition,['execution','pinHash','factsHash'],'RS_ACQUISITION');
 check(acquisition.execution==='CONTRACT_FIXTURE'&&acquisition.pinHash===acquisitionPinHash(context,registry)
  &&acquisition.factsHash===hash('ACQUIRED-FACTS',facts),'RS_ACQUISITION');
 const source=facts.source;
 exactKeys(source,['instanceRef','courseId','forumId','id','discussionId','authorId','subject','body','messageFormat','createdAt','modifiedAt','visible','deleted','privateReply'],'RS_SOURCE');
 check(Object.entries(registry.locator).every(([key,value])=>source[key]===value),'RS_LOCATOR');positive(source.discussionId);
 check(source.visible===true&&source.deleted===false&&source.privateReply===false
  &&facts.visibility==='VISIBLE_TO_AUTHENTICATED_READER'&&facts.completeness==='TARGET_ONLY_NON_ATOMIC','RS_VISIBILITY');
 positive(source.createdAt);positive(source.modifiedAt);check(source.modifiedAt>=source.createdAt,'RS_SOURCE_TIME');
 check(facts.sourceRevision===digest('CLEAR-MOODLE-REVIEW-FACTS.1',source),'RS_SOURCE_HASH');
 const post=submission.posts.find(post=>post.postId===registry.postId);check(post,'RS_SUBMISSION');
 // Current C2 inputHash still hashes the complete original submission, not this normalized projection.
 const title=normalizeReviewText(source.subject),body=normalizeReviewText(source.body,source.messageFormat);
 check(title===normalizeReviewText(post.title)&&body===normalizeReviewText(post.text),'RS_CONTENT_MISMATCH');
 check(source.messageFormat===2&&post.images.length===0&&post.tags.length===0&&post.links.length===0,'RS_COVERAGE_UNSUPPORTED');
 exactKeys(facts.observed,['startedAt','finishedAt'],'RS_CLOCK');
 const {startedAt,finishedAt}=facts.observed;for(const n of [startedAt,finishedAt,nowMs,rawExpiresAtMs])millis(n);
 check(finishedAt>=startedAt&&finishedAt-startedAt<=30000&&nowMs>=finishedAt&&registry.audit.recordedAtMs<=startedAt
  &&source.modifiedAt*1000<=finishedAt,'RS_CLOCK');
 const expiresAtMs=Math.min(startedAt+registry.freshness.maxAgeMs,rawExpiresAtMs);
 check(nowMs<expiresAtMs,'RS_EXPIRED');identifier(sourceRunId);revision(sourceGeneration);
 const receipt={version:REVIEW_SOURCE_VERSION,provenance:'LOCAL_LMS_RECORD',dataScope:'ISOLATED_SYNTHETIC_ACCOUNT',
  sourceRunId,sourceGeneration,registryId:registry.registryId,registryRevision:registry.revision,registryHash:registryHash(registry),
  acquisitionPinHash:acquisition.pinHash,acquiredFactsHash:acquisition.factsHash,
  sourceBindingHash:hash('SOURCE-BINDING',registry.sourceBinding),locatorHash:hash('LOCATOR',registry.locator),
  runContextHash:contextHash,sourceRevision:facts.sourceRevision,rawBodyHash:bytesDigest(Buffer.from(source.body,'utf8')),
  sourceCreatedAtSeconds:source.createdAt,sourceModifiedAtSeconds:source.modifiedAt,
  normalizer:NORMALIZER,normalizedContentHash:hash('NORMALIZED-CONTENT',{normalizer:NORMALIZER,title,body}),
  observationStartedAtMs:startedAt,observationFinishedAtMs:finishedAt,expiresAtMs,coverage:'TITLE_BODY_ONLY',
  consistency:'TWO_READS_NON_ATOMIC',readerVisibility:'AUTHENTICATED_READER_ONLY',...gates};
 return freeze({version:REVIEW_SOURCE_VERSION,runContextHash:contextHash,sourceReceiptHash:sourceReceiptHash(receipt),receipt,
  submissionRef:{submissionId:s.submissionId,submissionRevision:s.submissionRevision,routeRevision:s.routeRevision,
   inputHash:s.inputHash,assetsHash:context.assetsHash,postId:registry.postId},...gates});
}

// A pure precondition vector, NOT a transaction/CAS implementation or authentication.
// current must come from a trusted host snapshot; a caller-supplied flag is not authority.
export function assertCurrentCorrelation(proposal,{context,registry,receiptHash,sourceGeneration,rawAvailable,nowMs}){
 check(proposal.version===REVIEW_SOURCE_VERSION&&proposal.contractOnly===true&&proposal.usableForAcceptance===false,'RS_PROPOSAL');
 check(Object.entries(gates).every(([key,value])=>proposal[key]===value&&proposal.receipt[key]===value),'RS_PROPOSAL');
 hash32(receiptHash);check(sourceReceiptHash(proposal.receipt)===proposal.sourceReceiptHash,'RS_RECEIPT_HASH');
 const s=context.snapshot,ref=proposal.submissionRef;
 check(proposal.runContextHash===runContextHash(context)&&proposal.receipt.runContextHash===proposal.runContextHash
  &&ref.submissionId===s.submissionId&&ref.submissionRevision===s.submissionRevision&&ref.routeRevision===s.routeRevision
  &&ref.inputHash===s.inputHash&&ref.assetsHash===context.assetsHash&&ref.postId===registry.postId,'RS_STALE_RUN');
 check(proposal.receipt.registryHash===registryHash(registry)&&registry.status==='REVIEWED_SYNTHETIC_MAPPING','RS_STALE_MAPPING');
 check(proposal.sourceReceiptHash===receiptHash&&proposal.receipt.sourceGeneration===sourceGeneration,'RS_STALE_SOURCE');
 millis(nowMs);check(nowMs>=proposal.receipt.observationFinishedAtMs,'RS_CLOCK');
 check(rawAvailable===true&&nowMs<proposal.receipt.expiresAtMs,'RS_EXPIRED');
 return freeze({correlation:'CURRENT_CONTRACT_FIXTURE',...gates});
}
