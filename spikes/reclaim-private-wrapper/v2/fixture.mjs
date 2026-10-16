import {id} from 'ethers';
import {fixtureSigner,fixtureOwner,core} from '../model.mjs';
import {sourceParams,sourceHash,programProfile,registryDigest,makeContext} from './adapter.mjs';
export const NOW=1792120000;
export const rows=[
 {date:'2026.10.10',number:'123456',score:'850'},
 {date:'2026.09.20',number:'1234567890',score:'700'},
 {date:'2026.08.16',number:'98765432',score:'990'},
];
export function table(list=rows,{space='\n',header=true,attrs=' class="synthetic"',extra=true}={}){
 const head=header?'<thead><tr><th>시험</th><th>시험일</th><th>수험번호</th><th>성적</th><th>발급</th></tr></thead>':'';
 return `<table${attrs}>${space}${head}<tbody>${list.map(r=>`<tr name='TOE' class='trSB'>${space}<!-- public synthetic -->${space}<td> TOEIC </td><td>${r.date}(일)</td><td>${r.number}</td><td>Total ${r.score} (LC 400, RC 450)</td>${extra?'<td><a href="/synthetic">확인</a><input type="button" value="sample"></td>':''}</tr>`).join(space)}</tbody>${space}</table>`;
}
export const record=(overrides={})=>({version:'PRIVATE_WRAPPER_V2_RESEARCH',application:id('PUBLIC_SYNTHETIC_APPLICATION_A'),reuseScope:id('PUBLIC_SYNTHETIC_PRODUCT_CYCLE'),
 recipient:'0x1111111111111111111111111111111111111111',owner:fixtureOwner().address.toLowerCase(),chainId:431798,verifyingContract:'0x2222222222222222222222222222222222222222',
 threshold:750,periodFrom:20261001,periodUntil:20261031,sourceHash,programProfile,registryDigest,createdAt:NOW-60,expiresAt:NOW+600,...overrides});
export async function proof({r=record(),html=table(),signer=fixtureSigner(),timestampS=NOW-10,epoch=1,params=sourceParams,context}={}){
 const claim={provider:'http',parameters:params,context:context??makeContext(r,html),owner:r.owner,timestampS,epoch};
 claim.identifier=core.getIdentifierFromClaimInfo({...claim});return {claim,signature:await signer.signMessage(core.createSignDataForClaim({...claim})),attestor:signer.address.toLowerCase()};
}
