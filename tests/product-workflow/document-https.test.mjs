import test from 'node:test';
import assert from 'node:assert/strict';
import {runDocumentHttpDemo} from '../../specs/m3/document-http-demo.mjs';
test('verified HTTPS C2 demo binds signed sessions, separate display, real fixture bytes and restart receipt',async()=>{
 const result=await runDocumentHttpDemo();assert.equal(result.verifiedHttps,true);assert.equal(result.restartSameReceipt,true);assert.equal(result.rawDiskPersistence,false);assert.equal(result.documentSubmissionReady,false);
});
