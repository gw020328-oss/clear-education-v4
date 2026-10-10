/* global ethers */
import { createValidation } from '/shared/validation.mjs';
const V=createValidation(ethers),trusted=await(await fetch('/manifest.json')).json(),normal=await(await fetch('/demo-evidence.json')).json(),clone=()=>structuredClone(normal);
const run=text=>{try{const p=V.parseEvidenceText(text);V.validateEvidence(p,trusted,p.recipient,trusted.terms.claimUntil);return'ACCEPT'}catch(e){return e.code||e.message}};
const sig=normal.submissions[0].signature,n=BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141'),s=BigInt('0x'+sig.slice(66,130)),cases={normal};let x;
x=clone();x.submissions[0].signature=ethers.Signature.from(sig).compactSerialized;cases.compact=x;
x=clone();x.submissions[0].signature=sig.slice(0,-2)+'00';cases.v01=x;
x=clone();x.submissions[0].signature={r:'0x1',s:'0x2',v:27};cases.object=x;
x=clone();x.submissions[0].signature=sig.slice(0,66)+(n-s).toString(16).padStart(64,'0')+(sig.endsWith('1b')?'1c':'1b');cases.highS=x;
x=clone();x.extra=true;cases.extra=x;
const result={};for(const[k,v]of Object.entries(cases))result[k]=run(JSON.stringify(v));result.oneMiB=run(JSON.stringify(normal)+' '.repeat(1024*1024));result.deep=run(JSON.stringify({x:Array.from({length:15}).reduce(v=>[v],0)}));
document.getElementById('result').textContent=JSON.stringify(result);
