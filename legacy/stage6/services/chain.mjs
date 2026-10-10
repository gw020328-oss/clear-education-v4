import ganache from 'ganache';
import { JsonRpcProvider, Wallet, ContractFactory, keccak256 } from 'ethers';
import { compile } from '../lib/local.mjs';
import { AMOUNT, EXPIRY, STATEMENT, termsHash } from '../lib/evidence.mjs';

const port=Number(process.env.CHAIN_PORT??0),sponsorKey=process.env.SPONSOR_KEY,issuerAddress=process.env.ISSUER_ADDRESS,relayerKey=process.env.RELAYER_KEY;
if(!sponsorKey||!issuerAddress) throw new Error('CHAIN_CONFIGURATION');
const sponsorWallet=new Wallet(sponsorKey),startDate=new Date(process.env.CHAIN_TIME??'2026-09-13T00:00:00Z');
const accounts=[{secretKey:sponsorKey,balance:'0x3635c9adc5dea00000'}];if(relayerKey)accounts.push({secretKey:relayerKey,balance:'0x56BC75E2D63100000'});
const server=ganache.server({logging:{quiet:true},chain:{chainId:31337,hardfork:'shanghai',time:startDate},miner:{timestampIncrement:0},wallet:{accounts}});
await server.listen(port,'127.0.0.1'); const actualPort=server.address().port;
const provider=new JsonRpcProvider(`http://127.0.0.1:${actualPort}`,undefined,{cacheTimeout:-1}),sponsor=sponsorWallet.connect(provider);
try{
  const artifacts=compile();
  async function deploy(name,args=[]){const a=artifacts[name];const c=await new ContractFactory(a.abi,a.evm.bytecode.object,sponsor).deploy(...args);await c.waitForDeployment();return c;}
  const token=await deploy('TestToken'),start=Number((await provider.getBlock('latest')).timestamp);
  const terms={version:1,courseId:'refund-course-001',submissionIds:[0,1,2,3],amount:AMOUNT.toString(),tokenDecimals:6,tokenSymbol:'TEST',chainId:31337,token:token.target,issuer:issuerAddress,sponsor:sponsorWallet.address,start,due:start+86400,claimUntil:start+86400+604800,expiryPolicy:EXPIRY,evidenceStatement:STATEMENT};
  const hash=termsHash(terms),vault=await deploy('RefundVault',[token.target,issuerAddress,hash,terms.start,terms.due,terms.claimUntil]),deployed=await vault.deploymentTransaction().wait();
  await (await token.approve(vault.target,AMOUNT*3n)).wait();
  const manifest={manifestVersion:2,tokenProfile:'immutable-fixed-test-token/v1',terms,termsHash:hash,domain:{name:'RefundRights',version:'2',chainId:31337,verifyingContract:vault.target},deployment:{genesisHash:(await provider.getBlock(0)).hash,blockNumber:deployed.blockNumber,blockHash:deployed.blockHash,vaultCodeHash:keccak256(await provider.getCode(vault.target)),tokenCodeHash:keccak256(await provider.getCode(token.target))}};
  process.send?.({type:'ready',service:'chain',port:actualPort,manifest});
}catch{process.send?.({type:'failed',service:'chain',code:'CHAIN_SETUP_FAILED'});await provider.destroy();await server.close();process.exit(1);}
const stop=async()=>{await provider.destroy();await server.close();process.exit(0)};process.on('SIGTERM',stop);process.on('SIGINT',stop);
