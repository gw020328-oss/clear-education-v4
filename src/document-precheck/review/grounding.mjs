import {array,exactKeys,freeze,requireRule as check} from '../../policy/values.mjs';
import {bytesDigest} from '../../product-workflow/contract.mjs';
import {reviewFields} from '../../ai-policy/field-review.mjs';

export const GROUNDED_REVIEW_VERSION='clear-review-grounding.1';
const id=v=>check(typeof v==='string'&&/^[a-z][a-z0-9.-]{0,63}$/.test(v),'REVIEW_GROUNDING_ID');
const notices={MISSING:'필수 항목이 포함된 원문을 제출해 주세요.',
  UNREADABLE:'해당 항목의 글자가 읽히고 가장자리가 잘리지 않은 선명한 자료를 다시 제출해 주세요.',
  CONFLICT:'서로 다른 값이 있는 항목을 확인하고 일치하는 원문과 출처를 보완해 주세요.',
  UNDETERMINED:'항목을 확인할 수 있는 원문 또는 선명한 자료를 보완해 주세요. 누락인지 판독불가인지 아직 확인되지 않았습니다.'};

// Host-owned sources only. Hash equality binds bytes, not source authenticity,
// decoded dimensions, OCR accuracy, authorship or publication.
export function captureReviewSources(input){
  array(input,32,'REVIEW_GROUNDING_SOURCES');const sources=input.map(s=>{
    id(s.sourceId);check(['TEXT','IMAGE'].includes(s.kind),'REVIEW_GROUNDING_SOURCE');
    if(s.kind==='TEXT'){
      exactKeys(s,['sourceId','kind','text'],'REVIEW_GROUNDING_SOURCE');
      check(typeof s.text==='string'&&s.text.length<=32000,'REVIEW_GROUNDING_SOURCE');
      return {...s,sha256:bytesDigest(Buffer.from(s.text,'utf8'))};
    }
    exactKeys(s,['sourceId','kind','bytes','sha256'],'REVIEW_GROUNDING_SOURCE');
    check(s.bytes instanceof Uint8Array&&s.bytes.length>0&&s.bytes.length<=65536&&bytesDigest(s.bytes)===s.sha256,'REVIEW_GROUNDING_IMAGE_PIN');
    return {sourceId:s.sourceId,kind:'IMAGE',sha256:s.sha256};
  });
  check(new Set(sources.map(s=>s.sourceId)).size===sources.length,'REVIEW_GROUNDING_SOURCES');
  return freeze(sources);
}
function uniqueSpan(sources,value){
  const matches=[];
  for(const s of sources.filter(s=>s.kind==='TEXT')){
    let from=0,at;
    while((at=s.text.indexOf(value,from))!==-1){matches.push({kind:'TEXT_SPAN',sourceId:s.sourceId,sha256:s.sha256,start:at,end:at+value.length,quote:value});
      if(matches.length>1)return null;from=at+1;}
  }
  return matches.length===1?matches[0]:null;
}
const scope=(fieldIds,sources)=>{
  array(fieldIds,32,'REVIEW_GROUNDING_FIELDS');check(fieldIds.length>0&&new Set(fieldIds).size===fieldIds.length,'REVIEW_GROUNDING_FIELDS');fieldIds.forEach(id);
  check(sources.length>0,'REVIEW_GROUNDING_SOURCES');
};

// Historical evaluation output has no reliable state/span contract. Preserve
// its candidates, never fabricate a reason or turn its free-form row into proof.
// This is diagnostic replay, not a converted product DocumentPrecheck receipt.
export function groundLegacyReview(raw,fieldIds,hostSources){
  const sources=captureReviewSources(hostSources);scope(fieldIds,sources);
  const reviewed=reviewFields({fields:raw.fields,questions:raw.questions,flags:raw.flags},fieldIds);
  const fields=fieldIds.map(fieldId=>{
    const f=raw.fields.find(f=>f.fieldId===fieldId),value=f?.value??null;
    check(value===null||typeof value==='string'&&value.length>0&&value.length<=240,'REVIEW_GROUNDING_VALUE');
    const evidence=value===null?null:uniqueSpan(sources,value);
    const held=reviewed.fields.find(f=>f.fieldId===fieldId).state==='HELD';
    const state=value===null?'UNDETERMINED':held?'NEEDS_REVIEW':'OBSERVED_ONLY';
    return {fieldId,candidateValue:value,state,evidence,
      locationStatus:evidence?'EXACT_SUBMITTED_TEXT':value===null?'NO_LEGIBLE_EVIDENCE':'LOCATION_UNVERIFIED',
      // Asset reference is separate from a semantic location inside the image.
      submittedSources:sources.map(({sourceId,kind,sha256})=>({sourceId,kind,sha256})),
      reason:value===null?'REASON_NOT_PROVIDED':held?'OBSERVATION_HELD':null,supplement:value===null||held?notices.UNDETERMINED:null};
  });
  return freeze({version:GROUNDED_REVIEW_VERSION,execution:'OFFLINE_LEGACY_REPLAY',fields,
    automaticEligibility:false,paymentAllowed:false,sourceAuthenticity:'UNVERIFIED'});
}

// v2 explicit-state proposal. No model-defined location string or image row.
// A whole-image reference is an inspectable asset, never OCR/region verification.
export function validateGroundedReview(raw,fieldIds,hostSources){
  const sources=captureReviewSources(hostSources);scope(fieldIds,sources);
  exactKeys(raw,['fields'],'REVIEW_GROUNDING_OUTPUT');array(raw.fields,32,'REVIEW_GROUNDING_OUTPUT');
  check(raw.fields.length===fieldIds.length&&new Set(raw.fields.map(f=>f.fieldId)).size===fieldIds.length,'REVIEW_GROUNDING_OUTPUT');
  const fields=raw.fields.map(f=>{
    exactKeys(f,['fieldId','state','value','evidence','inspectedSourceIds'],'REVIEW_GROUNDING_OUTPUT');
    check(fieldIds.includes(f.fieldId)&&['OBSERVED','MISSING','UNREADABLE','CONFLICT','UNDETERMINED'].includes(f.state),'REVIEW_GROUNDING_OUTPUT');
    array(f.inspectedSourceIds,32,'REVIEW_GROUNDING_OUTPUT');
    check(f.inspectedSourceIds.length>0&&new Set(f.inspectedSourceIds).size===f.inspectedSourceIds.length
      &&f.inspectedSourceIds.every(id=>sources.some(s=>s.sourceId===id)),'REVIEW_GROUNDING_SOURCE_PIN');
    let evidence=null,locationStatus='NO_LEGIBLE_EVIDENCE';
    if(f.state==='OBSERVED'){
      check(typeof f.value==='string'&&f.value.length>0&&f.value.length<=240&&f.evidence,'REVIEW_GROUNDING_VALUE');
      const e=f.evidence,s=sources.find(s=>s.sourceId===e.sourceId);
      check(s&&f.inspectedSourceIds.includes(s.sourceId),'REVIEW_GROUNDING_SOURCE_PIN');
      exactKeys(e,['kind','sourceId','quote'],'REVIEW_GROUNDING_EVIDENCE');
      if(s.kind==='TEXT'){
        check(e.kind==='TEXT_QUOTE'&&e.quote===f.value,'REVIEW_GROUNDING_TEXT_SPAN');
        evidence=uniqueSpan([s],e.quote);check(evidence,'REVIEW_GROUNDING_TEXT_AMBIGUOUS_OR_ABSENT');
        locationStatus='EXACT_SUBMITTED_TEXT';
      }else{
        check(e.kind==='IMAGE_ASSET'&&e.quote===null,'REVIEW_GROUNDING_EVIDENCE');
        evidence={kind:e.kind,sourceId:e.sourceId,sha256:s.sha256};locationStatus='ASSET_BOUND_CONTENT_UNVERIFIED';
      }
    }else{
      check(f.value===null&&f.evidence===null,'REVIEW_GROUNDING_NO_LEGIBLE_EVIDENCE');
    }
    return {fieldId:f.fieldId,candidateValue:f.value,state:f.state,evidence,locationStatus,
      inspectedSourceIds:f.inspectedSourceIds,reason:f.state==='OBSERVED'?null:f.state,supplement:f.state==='OBSERVED'?null:notices[f.state]};
  });
  return freeze({version:GROUNDED_REVIEW_VERSION,execution:'SYNTHETIC_PROPOSAL',fields,
    automaticEligibility:false,paymentAllowed:false,sourceAuthenticity:'UNVERIFIED'});
}
