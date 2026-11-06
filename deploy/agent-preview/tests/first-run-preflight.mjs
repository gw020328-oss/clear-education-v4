import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {prepareGeminiStructureRequest} from '../../../src/agent-preview/gemini-preparation.mjs';
import {hash} from '../../../src/agent-preview/index.mjs';
import {limits,previewModel} from '../limits.mjs';

export const firstRunSource='Python 기초 강의 완료';
export const wireSha256=value=>createHash('sha256').update(JSON.stringify(value),'utf8').digest('hex');

export function firstRunPreflight() {
  const prepared=prepareGeminiStructureRequest(firstRunSource);
  if(prepared.model!==previewModel || prepared.body.generationConfig.maxOutputTokens!==limits.maxOutputTokens) {
    throw Error('FIRST_RUN_MODEL_PROFILE_MISMATCH');
  }
  return {
    sourceText:firstRunSource,
    sourceUtf8Bytes:Buffer.byteLength(firstRunSource),
    sourceHash:prepared.sourceHash,
    bodyHash:prepared.bodyHash,
    model:prepared.model,
    limits,
    limitsHash:hash(limits),
    wireHashes:{
      countTokens:wireSha256({generateContentRequest:{model:'models/'+prepared.model,...prepared.body}}),
      generateContent:wireSha256(prepared.body)
    },
    approvalBindingHash:null,
    approvalStatus:'PENDING_EXACT_RELEASE_AND_STUDENT_CONTEXT',
    actualModelCall:false
  };
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(firstRunPreflight(),null,2));
}
