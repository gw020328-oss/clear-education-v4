import {normalE2Hash} from '../../src/hackathon-test-vault/normal-source-compatibility.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {keccak256,toUtf8Bytes,TypedDataEncoder} from 'ethers';
import {MESSAGE_FIELDS,PRIMARY_TYPE,TYPES} from '../../src/bootcamp-authorization/test-schema-v3.mjs';
import {buildExecution} from './execution-build.mjs';
import {executionArtifact} from './execution-artifact.mjs';
const read=path=>readFileSync(new URL('../../'+path,import.meta.url));
const nodes=(value,predicate,out=[])=>{if(!value||typeof value!=='object')return out;if(predicate(value))out.push(value);for(const child of Object.values(value))if(child&&typeof child==='object')nodes(child,predicate,out);return out;};
const fn=name=>nodes(buildExecution().ast,n=>n.nodeType==='FunctionDefinition'&&n.name===name)[0];
const identifiers=body=>new Set(nodes(body,n=>n.nodeType==='Identifier').map(n=>n.name));

test('execution compilation enforces EIP170 and Shanghai initcode limits with normal optimizer',()=>{
 const b=buildExecution();assert(b.runtimeBytes>0&&b.runtimeBytes<=24576);assert(b.creationBytes+b.constructorArgumentBytes<=49152);assert.deepEqual(b.warnings,[]);
 assert.equal(b.constructorArgumentBytes,320);assert(Object.keys(b.immutableReferences).length>0);
});
test('execution compiled ABI keeps exact frozen .3 24-field tuple and type hash',()=>{
 const b=buildExecution(),accept=b.contract.abi.find(f=>f.name==='accept');
 assert.deepEqual(accept.inputs[1].components.map(({name,type})=>({name,type})),MESSAGE_FIELDS);
 const typeHash=nodes(b.ast,n=>n.nodeType==='VariableDeclaration'&&n.name==='TYPE_HASH')[0].value.value;
 assert.equal(typeHash,keccak256(toUtf8Bytes(TypedDataEncoder.from(TYPES).encodeType(PRIMARY_TYPE))));
 const literals=nodes(fn('domainSeparator'),n=>n.nodeType==='Literal').map(n=>n.value);
 assert(literals.includes('ClearBootcampTestPayment')&&literals.includes('3'));
});
test('execution compiled ABI exposes claim by app only, with no withdraw upgrade or activation',()=>{
 const functions=buildExecution().contract.abi.filter(x=>x.type==='function'),names=functions.map(x=>x.name);
 assert.deepEqual(functions.find(x=>x.name==='claim').inputs.map(({name,type})=>({name,type})),[{name:'appId',type:'bytes32'}]);
 for(const forbidden of ['withdraw','upgrade','activate','setRecipient','setAmount','setClaimExpiry'])assert(!names.includes(forbidden));
 assert(names.includes('acceptedRight')&&names.includes('usedNonces'));
 assert(!nodes(buildExecution().ast,n=>(n.nodeType==='Identifier'&&['selfdestruct','delegatecall'].includes(n.name))||(n.nodeType==='MemberAccess'&&['delegatecall','callcode'].includes(n.memberName))).length);
});
test('compile inspection keeps role/CAS/current validation on accept and only reentrancy modifier on claim',()=>{
 const accept=fn('accept'),claim=fn('claim');
 assert.deepEqual(accept.modifiers.map(x=>x.modifierName.name),['only','unlocked','active','once']);
 const ai=identifiers(accept.body);for(const name of ['_mutable','_checkUnsigned','StrictECDSA','usedNonces','rights'])assert(ai.has(name));
 assert.deepEqual(claim.modifiers.map(x=>x.modifierName.name),['unlocked']);
 const ci=identifiers(claim.body);for(const name of ['_checkUnsigned','keys','usedNonces','newOperationsPaused','roles'])assert(!ci.has(name));
 const members=nodes(claim.body,n=>n.nodeType==='MemberAccess').map(n=>n.memberName);
 for(const name of ['expiresAt','sourceValidUntilExclusive','epoch','signer','mutualConsent'])assert(!members.includes(name));
 // Static boundary evidence only; state transition and transfer behavior are NOT executed.
});
test('execution fixed token code and frozen preparation/E2 artifact sources remain identical',()=>{
 const prep=JSON.parse(read('docs/hackathon-test-vault/preparation-artifact.json'));
 assert.equal(buildExecution().tokenCodeHash,prep.fixedToken.runtimeCodeHash);
 const e2=JSON.parse(read('specs/bootcamp/hackathon-test-consumer-pins-v1.json'));
 for(const [path,expected] of [...Object.entries(prep.sourceSha256),...Object.entries(e2.artifactSha256)])assert.equal(createHash('sha256').update(read(path)).digest('hex'),normalE2Hash(path,expected),path);
});
test('published execution compile artifact is reproducible and records zero execution',()=>{
 const stored=JSON.parse(read('docs/hackathon-test-vault/execution-artifact.json'));assert.deepEqual(stored,executionArtifact());
 for(const k of ['executionContractDeployments','authorizationSignatures','validSignerPositiveControls','accepts','claims','persistentChains','externalRpc','actualSources'])assert.equal(stored[k],0);
 assert.equal(stored.runtimePin,null);assert.equal(stored.positiveExecutionAuthorized,false);
});
