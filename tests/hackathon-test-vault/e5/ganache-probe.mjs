import ganache from 'ganache';
import {writeFileSync,mkdirSync} from 'node:fs';
const raw=ganache.provider({logging:{quiet:true},chain:{chainId:431719},wallet:{totalAccounts:1}});
const request=(method,params)=>raw.request({method,params});
const result={version:'clear-e5-ganache-blockhash-probe.1',runtime:'ganache/7.9.2',fallback:false,cases:[]};
try{
 const block=await request('eth_getBlockByNumber',['latest',false]),[address]=await request('eth_accounts',[]);
 for(const [method,args]of [['eth_getCode',[address]],['eth_getBalance',[address]],['eth_getTransactionCount',[address]],['eth_call',[{to:address,data:'0x'}]]]){
  for(const selector of [{blockHash:block.hash,requireCanonical:true},{blockHash:'0x'+'ab'.repeat(32),requireCanonical:true}]){
   try{await request(method,[...args,selector]);result.cases.push({method,known:selector.blockHash===block.hash,result:'ACCEPTED'});}
   catch(e){result.cases.push({method,known:selector.blockHash===block.hash,result:'REJECTED',code:e.code??null,message:String(e.message).slice(0,160)});}
  }
 }
}finally{await raw.disconnect();}
mkdirSync(new URL('../../../.toolchain/hackathon-test-vault/e5/',import.meta.url),{recursive:true});
writeFileSync(new URL('../../../.toolchain/hackathon-test-vault/e5/ganache-probe.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
