import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sourceFixture,textObserver} from './source-bundle-fixture.mjs';
import {openSourceStore} from '../../src/product-workflow/source-store.mjs';
import {proposeSourceBundle} from '../../src/ai-policy/source-bundle-adapter.mjs';
test('common private source lookup feeds grounded proposal and marks old pending bundle stale',async t=>{
 const f=sourceFixture(),directory=realpathSync(mkdtempSync(join(tmpdir(),'ai-source-'))),store=openSourceStore({directory,environment:{instanceId:'synthetic-source',origin:'https://synthetic.example.invalid',mode:'PUBLIC_SOURCE_ONLY'},now:()=>101});
 t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});store.putSnapshot(f.snapshot,f.blobs);store.putBundle(f.input.bundle);
 const lookup={getSnapshot:store.getSnapshot,getArtifact:store.getArtifact,getCurrentBundleHash:store.getCurrentBundleHash,now:()=>101};
 const good=await proposeSourceBundle(f.input,lookup,{textAdapter:textObserver(()=>f.output)});assert.equal(good.current,true);assert.ok(good.proposal);assert.equal(good.publishable,false);
 const pending=await proposeSourceBundle(f.input,lookup,{textAdapter:textObserver(()=>{store.putBundle({...structuredClone(f.input.bundle),revision:2,requiredSourceIds:[...f.input.bundle.requiredSourceIds,'guide']});return f.output;})});
 assert.equal(pending.current,false);assert.equal(pending.proposal,null);assert.ok(pending.coverage.some(c=>c.code==='STALE_CONTEXT'));
});
