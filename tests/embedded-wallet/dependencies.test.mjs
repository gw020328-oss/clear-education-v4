import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,cpSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {Wallet,TypedDataEncoder} from 'ethers';
import {recipientRegistration} from '../../src/bootcamp/recipient-registration.mjs';
import {reviewedDependencies} from '../../tools/embedded-wallet/reviewed-dependencies.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const sdkRoot=process.env.CLEAR_SDK_TEST_ROOT??join(root,'src/embedded-wallet');
const req=createRequire(join(sdkRoot,'package.json')),lock=JSON.parse(readFileSync(join(sdkRoot,'package-lock.json')));
const copies=Object.keys(lock.packages).filter(p=>p.endsWith('/zod'));
globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};
test('reviewed graph and all patched files verified; second application is idempotent',()=>{
 assert.equal(reviewedDependencies({sdkRoot}).files,12);
 assert.equal(reviewedDependencies({sdkRoot,apply:true}).appliedFiles,0);
});
for(const copy of copies){
 const pkg=JSON.parse(readFileSync(join(sdkRoot,copy,'package.json')));
 for(const entry of ['.','./v3','./v4','./v4-mini','./v4/mini'])for(const mode of ['import','require']){
  test(`Zod ${pkg.version} ${entry} ${mode}: bounded rejection, normal parsing and unbounded limitation`,async()=>{
   const path=resolve(sdkRoot,copy,pkg.exports[entry][mode]);
   const z=mode==='import'?await import(pathToFileURL(path)):req(path);
   const mini=entry.includes('mini'),parse=(schema,value)=>mini?z.safeParse(schema,value):schema.safeParse(value);
   let visits=0;const scalar=z.string().check?z.string().check(z.check(()=>{visits++;})):z.string().superRefine(()=>{visits++;});
   const a=mini?z.array(scalar).check(z.maxLength(2)):z.array(scalar).max(2);
   const tooBig=parse(a,Array(32).fill('x'));assert.equal(tooBig.success,false);assert.equal(tooBig.error.issues.length,1);assert.equal(visits,0);
   assert.equal(parse(a,['a','b']).success,true);assert.equal(visits,2);
   visits=0;assert.equal(parse(z.array(scalar),Array(32).fill('x')).success,true);assert.equal(visits,32);
   visits=0;const set=mini?z.set(scalar).check(z.maxSize(2)):z.set(scalar).max(2);
   assert.equal(parse(set,new Set(['a','b','c'])).success,false);assert.equal(visits,0);
   const wide=Object.fromEntries(Array.from({length:64},(_,i)=>['k'+i,String(i)]));
   assert.equal(parse(z.intersection(z.record(z.string(),z.string()),z.record(z.string(),z.string())),wide).success,true);
   const emoji=mini?z.emoji():z.string().emoji();assert.equal(parse(emoji,'😀').success,true);assert.equal(parse(emoji,'🦰'.repeat(12)+' ').success,false);
   if(!mini){
    visits=0;assert.equal((await a.safeParseAsync(Array(32).fill('x'))).success,false);assert.equal(visits,0);
    let parents=0;const limited=z.array(scalar).length(2).superRefine(()=>{parents++;});
    assert.equal(limited.safeParse(['a','b','c']).success,false);assert.equal(visits,0);assert.equal(parents,0);
    assert.equal(limited.safeParse(['a','b']).success,true);assert.equal(parents,1);
   }
  });
 }
 for(const mode of ['import','require'])test(`Zod ${pkg.version} core ${mode} map/array/set share bounded implementation`,async()=>{
  const path=resolve(sdkRoot,copy,pkg.exports['./v4/core'][mode]),z=mode==='import'?await import(pathToFileURL(path)):req(path);
  let visits=0;const value=new z.$ZodString({type:'string',checks:[new z.$ZodCheck({check:'custom'})]});
  value._zod.def.checks[0]._zod.check=()=>{visits++;};
  for(const schema of [new z.$ZodArray({type:'array',element:value,checks:[new z.$ZodCheckMaxLength({check:'max_length',maximum:2})]}),
   new z.$ZodSet({type:'set',valueType:value,checks:[new z.$ZodCheckMaxSize({check:'max_size',maximum:2})]}),
   new z.$ZodMap({type:'map',keyType:value,valueType:value,checks:[new z.$ZodCheckMaxSize({check:'max_size',maximum:2})]})]){
   visits=0;const input=schema._zod.def.type==='array'?['a','b','c']:schema._zod.def.type==='set'?new Set(['a','b','c']):new Map([['a','a'],['b','b'],['c','c']]);
   assert.equal(z.safeParse(schema,input).success,false);assert.equal(visits,0);
  }
 });
}
test('patch rejects drift before applying any changes',()=>{
 const directory=mkdtempSync(join(tmpdir(),'clear-zod-drift-'));
 try{
  for(const name of ['package.json','package-lock.json'])cpSync(join(sdkRoot,name),join(directory,name));
  for(const copy of copies)cpSync(join(sdkRoot,copy),join(directory,copy),{recursive:true});
  cpSync(join(sdkRoot,'node_modules/porto/package.json'),join(directory,'node_modules/porto/package.json'));
  const plan=JSON.parse(readFileSync(join(root,'tools/embedded-wallet/patches/zod-6699.json')));
  const first=plan.packages.find(p=>p.version===JSON.parse(readFileSync(join(directory,copies[0],'package.json'))).version).files[0];
  const untouched=join(directory,copies[0],first.path);let before=readFileSync(untouched,'utf8');
  for(const edit of [...first.edits].reverse())before=before.replace(edit.after,()=>edit.before);
  writeFileSync(untouched,before); // First valid pending write must not happen if a later file drifts.
  const target=join(directory,copies.at(-1),'v3/types.js');writeFileSync(target,readFileSync(target,'utf8')+'\n// drift\n');
  assert.throws(()=>reviewedDependencies({sdkRoot:directory,apply:true}),/SDK_PATCH_HASH/);
  assert.equal(readFileSync(untouched,'utf8'),before);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test('Privy viem paths keep normal wire recovery and reject malformed struct names',async()=>{
 const v=await import(pathToFileURL(req.resolve('viem')).href);
 const wallet=Wallet.createRandom(),message='Synthetic CLEAR SIWE and source approval';
 const sig=await wallet.signMessage(message);assert.equal((await v.recoverMessageAddress({message,signature:sig})).toLowerCase(),wallet.address.toLowerCase());
 const h='0x'+'ab'.repeat(32),packet=recipientRegistration({chainId:31339017,verifyingContract:'0x'+'12'.repeat(20),instanceId:h,policyHash:h,runtimeMappingHash:h,participant:wallet.address,applicationSalt:h,nonce:h,deadline:1900000090});
 const wire=TypedDataEncoder.getPayload(packet.domain,packet.types,packet.message);
 assert.equal(v.hashTypedData(wire),TypedDataEncoder.hash(packet.domain,packet.types,packet.message));
 const signature=await wallet.signTypedData(packet.domain,packet.types,packet.message);
 assert.equal((await v.recoverTypedDataAddress({...wire,signature})).toLowerCase(),wallet.address.toLowerCase());
 assert.throws(()=>v.validateTypedData({domain:{},primaryType:'Bad-Name',types:{'Bad-Name':[{name:'value',type:'uint256'}]},message:{value:1n}}));
 for(const path of Object.keys(lock.packages).filter(p=>p.endsWith('/@privy-io/ethereum')||p.endsWith('/@privy-io/react-auth')||p.endsWith('/@privy-io/js-sdk-core'))){
  assert.equal(createRequire(resolve(sdkRoot,path,'package.json')).resolve('viem'),req.resolve('viem'));
 }
});
test('actual product entrypoints emit only reviewed Zod copies',async()=>{
 if(process.env.CLEAR_SDK_TEST_ROOT)return; // Scratch graph checks run before the repository install.
 reviewedDependencies();const {build}=req('esbuild');
 const result=await build({absWorkingDir:root,entryPoints:['src/embedded-wallet/onboarding.jsx','src/embedded-wallet/operator.jsx'],
  outdir:'var/unused-dependency-test-output',write:false,bundle:true,splitting:true,format:'esm',platform:'browser',target:['chrome120'],
  minify:true,metafile:true,logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'}});
 const emitted=Object.values(result.metafile.outputs).flatMap(o=>Object.entries(o.inputs??{}).filter(([,v])=>v.bytesInOutput>0).map(([p])=>p));
 const zod=emitted.filter(p=>p.includes('/node_modules/zod/'));
 assert.ok(zod.some(p=>p.endsWith('/zod/v3/types.js')));
 for(const path of zod){const packageRoot=path.slice(0,path.lastIndexOf('/node_modules/zod/')+'/node_modules/zod'.length);
  assert.ok(copies.some(c=>resolve(sdkRoot,c)===resolve(root,packageRoot)),path);}
});
