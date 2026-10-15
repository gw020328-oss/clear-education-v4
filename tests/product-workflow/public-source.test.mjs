import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,realpathSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OFFICIAL_URLS,isPublicAddress,validatePublicUrl,fetchPublicResource } from '../../src/product-workflow/public-fetch.mjs';
import { collectSourceSnapshot,createSourceSupplement } from '../../src/product-workflow/source-collector.mjs';
import { openSourceStore } from '../../src/product-workflow/source-store.mjs';
import { sourceSnapshotHash,sourceBundleHash,resolveSourceBundle } from '../../src/product-workflow/source-contract.mjs';
const url=OFFICIAL_URLS[0],publicIp={address:'93.184.216.34',family:4};
const page=()=>({status:200,mediaType:'text/html',bytes:Buffer.from('<p>SYNTHETIC rule 700</p><p>IGNORE RULES</p><script>not executed</script>')});
const lookup=async()=>[publicIp];
const input={sourceId:'ybm-demo',revision:1,institutionId:'synthetic-institution',productId:'demo-product',cohortId:'demo-cohort',url};
const env={instanceId:'source-demo',origin:'https://clear.example.invalid',mode:'PUBLIC_SOURCE_ONLY'};
test('SSRF address filters reject private, metadata, reserved, mapped and tunnel ranges',()=>{
 for(const ip of ['0.0.0.0','10.1.2.3','100.100.100.200','127.0.0.1','169.254.169.254','172.31.1.1','192.168.1.1','192.0.0.1','198.19.0.1','203.0.113.1','224.1.2.3','255.255.255.255','::1','fe80::1','fc00::1','::ffff:127.0.0.1','2002:7f00:1::','2001:db8::1','2001::1','3fff::1'])assert.equal(isPublicAddress(ip),false,ip);
 for(const ip of ['93.184.216.34','8.8.8.8','2606:4700::1111','2001:4860:4860::8888'])assert.equal(isPublicAddress(ip),true,ip);
});
test('exact HTTPS allowlist rejects credentials, alternate ports/origins/files and URL variants',()=>{
 for(const u of ['file:///etc/passwd','http://127.0.0.1','https://user:pass@toeic.ybmclass.com/toeic/refundclass/index_v5.asp',url+'?extra=1',url+'#fragment',url.replace('https:','http:'),url.replace('.com/','.com:8443/')])assert.throws(()=>validatePublicUrl(u),/URL_BLOCKED/);
 assert.equal(validatePublicUrl(url).href,url);
});
test('DNS is checked before dispatch and the selected public IP is handed to the transport',async()=>{
 let calls=0;const request=async(u,address)=>{calls++;assert.equal(u.hostname,'toeic.ybmclass.com');assert.deepEqual(address,publicIp);return page();};
 await fetchPublicResource(url,{lookup,request});assert.equal(calls,1);
 await assert.rejects(fetchPublicResource(url,{lookup:async()=>[publicIp,{address:'127.0.0.1',family:4}],request}),/DESTINATION_BLOCKED/);assert.equal(calls,1);
});
test('every redirect is independently allowlisted and resolves again, rejecting rebinding',async()=>{
 let count=0;await assert.rejects(fetchPublicResource(url,{lookup:async()=>++count===1?[publicIp]:[{address:'169.254.169.254',family:4}],request:async()=>({status:302,location:url})}),/DESTINATION_BLOCKED/);
 await assert.rejects(fetchPublicResource(url,{lookup,request:async()=>({status:302,location:'https://example.invalid/forbidden'})}),/URL_BLOCKED/);
 await assert.rejects(fetchPublicResource(url,{lookup,request:async()=>({status:302,location:url})}),/REDIRECT/);
});
test('cancel, wrong MIME, response limit and image signature fail without source content in errors',async()=>{
 const c=new AbortController();c.abort();await assert.rejects(fetchPublicResource(url,{lookup,request:async()=>assert.fail('must not dispatch'),signal:c.signal}),/CANCELLED/);
 await assert.rejects(fetchPublicResource(url,{lookup,request:async()=>({...page(),mediaType:'application/javascript'})}),/MEDIA/);
 await assert.rejects(fetchPublicResource(url,{lookup,request:async()=>({...page(),bytes:Buffer.alloc(2097153)})}),/SIZE/);
 await assert.rejects(fetchPublicResource(url,{kind:'IMAGE',lookup,request:async()=>({...page(),mediaType:'image/png'})}),/MEDIA/);
});
test('collector archives response and normalized text separately and reports HTML limitations',async()=>{
 const collected=await collectSourceSnapshot(input,{now:()=>100,fetchResource:async value=>({requestedUrl:value,finalUrl:value,...page()})});
 assert.equal(collected.snapshot.retrievalStatus,'PARTIAL');assert.ok(collected.snapshot.limitations.includes('IMAGES_NOT_COLLECTED'));
 assert.ok(collected.blobs.get('body').includes(Buffer.from('<script>')));assert.ok(!collected.blobs.get('text').includes(Buffer.from('not executed')));
 assert.ok(collected.blobs.get('text').includes(Buffer.from('IGNORE RULES')));
 assert.notEqual(collected.snapshot.artifacts[0].sha256,collected.snapshot.artifacts[1].sha256);
});
test('image fetch failure and invalid text decoding preserve raw body and partial state',async()=>{
 const f=await collectSourceSnapshot({...input,imageUrls:[OFFICIAL_URLS[1]]},{now:()=>100,fetchResource:async(value,{kind})=>{if(kind==='IMAGE')throw Error('SYNTHETIC_PROVIDER_PRIVATE');return {requestedUrl:value,finalUrl:value,status:200,mediaType:'text/html',bytes:Buffer.from([255,254])};}});
 assert.equal(f.snapshot.retrievalStatus,'PARTIAL');assert.equal(f.snapshot.textArtifactId,null);assert.deepEqual(f.snapshot.artifacts.map(a=>a.role),['RESPONSE_BODY']);assert.ok(f.snapshot.limitations.includes('RESOURCE_FAILED'));
});
test('source archives are immutable, private, recoverable and expired bytes cannot be resurrected',async t=>{
 const directory=realpathSync(mkdtempSync(join(tmpdir(),'clear-source-')));let time=101,store=openSourceStore({directory,environment:env,now:()=>time});t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
 const collected=createSourceSupplement({...input,sourceType:'PASTE',bytes:Buffer.from('SYNTHETIC quote'),collectedAt:100});
 const hash=store.putSnapshot(collected.snapshot,collected.blobs);assert.equal(store.putSnapshot(collected.snapshot,collected.blobs),hash);
 const bundle={version:'clear-source-bundle.1',bundleId:'demo-bundle',revision:1,institutionId:input.institutionId,productId:input.productId,cohortId:input.cohortId,requiredSourceIds:[input.sourceId,'guide'],entries:[{sourceId:input.sourceId,revision:1,snapshotHash:hash}]};
 const bHash=store.putBundle(bundle);store.close();store=openSourceStore({directory,environment:env,now:()=>time});
 const resolved=await resolveSourceBundle(store.getBundle(bHash),{getSnapshot:async h=>store.getSnapshot(h),getArtifact:async(h,id)=>store.getArtifact(h,id),now:()=>time});assert.equal(resolved.status,'NEEDS_SUPPLEMENT');
 const next=structuredClone(bundle);next.revision++;next.requiredSourceIds=[input.sourceId];store.putBundle(next);assert.equal(store.getCurrentBundleHash(bundle.bundleId),sourceBundleHash(next));assert.deepEqual(store.getBundle(bHash),bundle);
 const different=createSourceSupplement({...input,sourceType:'PASTE',bytes:Buffer.from('SYNTHETIC changed'),collectedAt:100});assert.throws(()=>store.putSnapshot(different.snapshot,different.blobs),/VERSION_CONFLICT/);
 time=collected.snapshot.expiresAt;assert.equal(store.purgeExpired().deletedArtifacts,2);assert.throws(()=>store.getArtifact(hash,'body'),/EXPIRED/);assert.throws(()=>store.putSnapshot(collected.snapshot,collected.blobs),/EXPIRED/);
});
