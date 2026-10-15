import ganache from 'ganache';
import { BrowserProvider, ContractFactory, Wallet, id } from 'ethers';
import { buildLab } from './build.mjs';
import { createLabReader } from './reader.mjs';

// Fresh in-memory chain only, no RPC endpoint/secret/env/DB import or reset API.
export async function openLab({ eligible = true, tier = 100, entitlement = '100000000', configChanges = {} } = {}) {
  const wallets = Array.from({length:4},()=>Wallet.createRandom());
  const raw = ganache.provider({ logging:{quiet:true},chain:{chainId:31338,hardfork:'shanghai',time:new Date('2030-03-01T00:00:00Z')},
    miner:{timestampIncrement:0},wallet:{accounts:wallets.map(w=>({secretKey:w.privateKey,balance:'0x3635c9adc5dea00000'}))} });
  const provider = new BrowserProvider(raw,undefined,{cacheTimeout:-1}); provider.pollingInterval=10;
  const close = async()=>{provider.destroy();await raw.disconnect();};
  try {
    const signers = await Promise.all(wallets.map(w=>provider.getSigner(w.address))), artifacts=buildLab();
    const token=await new ContractFactory(artifacts.ClearTestToken.abi,artifacts.ClearTestToken.bytecode,signers[0]).deploy(1000000000000n);await token.waitForDeployment();
    const t=1898553600;
    const config={instanceId:id('ephemeral-'+crypto.randomUUID()),assumptionsHash:id('PER_APPLICATION_TEST_ADAPTER:fixed-fixtures:no-source-verification:v1'),
      token:await token.getAddress(),sponsor:wallets[0].address,refundRecipient:wallets[0].address,allocationUntil:t+3600,claimUntil:t+7200,minClaimWindow:3600,...configChanges};
    const fixtures=[0,1].map(i=>({applicationId:id('synthetic-app-'+i),learner:wallets[i+1].address,recipient:wallets[i+1].address,
      policyHash:id('SYNTHETIC_AGREEMENT_ONLY'),decisionCommitment:id('CONSTRUCTOR_FIXTURE_NOT_SOURCE_EVIDENCE-'+i),entitlement,tier,syntheticEligible:eligible}));
    const vault=await new ContractFactory(artifacts.FundingLab.abi,artifacts.FundingLab.bytecode,signers[0]).deploy(config,fixtures);await vault.waitForDeployment();
    const pin={chainId:31338,genesisHash:(await provider.send('eth_getBlockByNumber',['0x0',false])).hash,vault:await vault.getAddress(),token:config.token,instanceId:config.instanceId,configHash:await vault.configHash(),confirmations:2};
    const mine=()=>provider.send('evm_mine',[]);
    await mine();
    let operationCounter=0;
    return {raw,provider,signers,token,vault,config,fixtures,pin,artifacts,close,mine,reader:createLabReader(provider,pin),
      async time(n){await provider.send('evm_setTime',[n*1000]);await mine();await mine();},
      async register(i=0){const app=fixtures[i].applicationId;await(await vault.connect(signers[i+1]).register(app,await vault.agreementHash(app))).wait();await mine();},
      async topUp(amount,i=0,operationId=id('synthetic-operation-'+ ++operationCounter)){
        await(await token.approve(pin.vault,amount)).wait();
        const tx=await vault.topUp(fixtures[i].applicationId,operationId,amount);await tx.wait();await mine();return {tx,operationId};
      },
    };
  } catch(e) {await close();throw e;}
}
