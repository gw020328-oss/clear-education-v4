import test from 'node:test';
import assert from 'node:assert/strict';
import {failureView} from './condition-proposal.v2.1.candidate.mjs';
const packet=()=>({version:'clear-condition-structuring.2',stage:'MODEL_CALL_FAILED',proposal:null,draft:null,fallback:'NONE',actualModelCall:false,modelCall:{attempted:true,replied:false,succeeded:false,errorCode:'GEMINI_NETWORK_FAILURE'}});
test('missing execution rejects',()=>{const p=packet();assert.throws(()=>failureView(p),/MODEL_CALL_EXECUTION/);});
test('unknown or non-string execution rejects instead of false',()=>{for(const execution of ['TYPO_ACTUAL','',null,undefined,false,1]){const p=packet();p.modelCall.execution=execution;assert.throws(()=>failureView(p),/MODEL_CALL_EXECUTION/);}});
test('ACTUAL no reply preserves unknown null and never yields executable success',()=>{const p=packet();p.modelCall.execution='ACTUAL';p.actualModelCall=null;const got=failureView(p);assert.equal(got.actualModelCall,null);assert.match(got.label,/미확인/);assert.equal(got.canExecute,false);assert.equal(got.proposal,null);});
test('explicit native defaults/offline remain valid; D HTTP error remains separate',()=>{for(const execution of ['HOST_SUPPLIED','OFFLINE_TEST_TRANSPORT']){const p=packet();p.modelCall.execution=execution;assert.equal(failureView(p).actualModelCall,false);}assert.throws(()=>failureView({version:'clear-external-preview-error.1',code:'REQUEST_REJECTED'}),/STRUCTURING_VERSION/);});
