import { fixture } from './lib/fixture.mjs';
const f=await fixture();
await f.stop('main');await f.stop('issuerService');
console.log(JSON.stringify({centralUI:'http://127.0.0.1:'+f.centralUI.port,onchainUI:'http://127.0.0.1:'+f.onchainUI.port,savedEvidence:f.evidencePath,manifest:f.manifestPath,stopped:f.stops}));
await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve)});
const audit=await f.close();console.log(JSON.stringify({audit}));
