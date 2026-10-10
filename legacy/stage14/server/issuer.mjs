import {Wallet} from 'ethers';
import {makeReceipts} from '../../stage15/lib/chain.mjs';
let wallet;
process.on('message',async m=>{try{if(m.type==='init'){wallet=new Wallet(m.key);process.send({type:'ready'});}else if(m.type==='issue'){const t=m.plan.nativeTerms;if(t.issuer!==wallet.address.toLowerCase())throw Error('ISSUER_SCOPE');process.send({type:'issued',receipts:await makeReceipts(m.plan,wallet,t.due)});}}catch{process.send({type:'error',code:'ISSUER_FAILURE'});}});
