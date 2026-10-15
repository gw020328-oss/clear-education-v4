import test from 'node:test';
import assert from 'node:assert/strict';
import {runDocumentHttpDemo} from '../../specs/m3/document-http-demo.mjs';
test('verified HTTPS C2 demo binds signed sessions, separate display, real fixture bytes and restart receipt',async()=>{
 const result=await runDocumentHttpDemo();assert.equal(result.verifiedHttps,true);assert.equal(result.restartSameReceipt,true);assert.equal(result.rawDiskPersistence,false);assert.equal(result.documentSubmissionReady,false);
});

test('C2 startup failure closes its stores and releases the development lock',async t=>{
 const {mkdtempSync,realpathSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{Wallet}=await import('ethers');
 const {initializeSourceDevelopment,startSourceDevelopment}=await import('../../src/product-workflow/http-development.mjs'),{availablePort}=await import('../../specs/m3/http-demo.mjs'),{DOCUMENT_FIXTURE_EPOCH}=await import('../../specs/m3/document-http-example.mjs');
 const root=realpathSync(mkdtempSync(join(tmpdir(),'clear-doc-start-'))),directory=join(root,'environment');let host;
 t.after(async()=>{await host?.close();rmSync(root,{recursive:true,force:true});});
 initializeSourceDevelopment({directory,port:await availablePort(),operator:Wallet.createRandom().address,participant:Wallet.createRandom().address,documentMode:true});
 await assert.rejects(startSourceDevelopment({directory,documentNow:()=>0}),/SOURCE_EXPIRED/);
 host=await startSourceDevelopment({directory,documentNow:()=>DOCUMENT_FIXTURE_EPOCH+100});assert.equal(host.config.syntheticDocumentSubmissionReady,true);assert.equal(host.config.documentSubmissionReady,false);
});
