export class ClaimState {
  constructor(){this.manifest=null;this.evidence=null;this.rpcUrl='';this.rpcProvider=null;this.walletProvider=null;this.signer=null;this.account=null;this.walletKind=null;this.fileChecked=false;this.chainChecked=false;this.walletChecked=false;this.claiming=false;this.phase='idle';this.epoch=0;}
  invalidate(scope='all'){
    this.epoch++;this.phase='idle';this.claiming=false;
    if(scope==='file'){this.evidence=null;this.fileChecked=false;}
    if(scope==='rpc'||scope==='file'){this.rpcProvider=null;this.chainChecked=false;}
    if(['all','rpc','file','wallet'].includes(scope)){this.walletChecked=false;this.signer=null;this.account=null;if(scope==='all'||scope==='wallet')this.walletProvider=null;}
  }
  get ready(){return this.fileChecked&&this.chainChecked&&this.walletChecked&&!this.claiming;}
}
