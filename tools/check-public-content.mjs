// Heuristic pre-push/CI check. Values are never printed. Review remains necessary.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
// Exact reviewed public assets only; provenance in web/fonts/README.ko.md.
const reviewedBinaries = new Map([
 ['web/fonts/inter-variable.woff2', new Set(['f052ee44c3728dfd23aba8a4567150bc314d23903026fbb6ad089422c2df56af'])],
 ['web/fonts/pretendard-std.woff2', new Set([
  '64a2b7110454edf0e5f555785273b5817d7e3a0a107a55acf8e4150e09a31557',
  // Historical upstream bytes after the former global CRLF normalization.
  '3a178c75a4e3fc7d295d2135a25aaf8a84a7adc9c6eacfc7a11446153cc1ef56',
 ])],
]);
const git=(...args)=>execFileSync('git',args,{maxBuffer:32*1024*1024});
const revisions=process.argv.slice(2);if(!revisions.length)revisions.push('HEAD');
for(const ref of revisions)if(ref.startsWith('-')||!/^[A-Za-z0-9_./-]+$/.test(ref))throw new Error('INVALID_REVISION');
const objects=new Map();const findings=[];
const commits=git('rev-list',...revisions).toString().trim().split('\n').filter(Boolean);
const forbidden=/(?:^|\/)(?:private|data|var|node_modules|\.toolchain|artifacts|\.runtime|logs|tmp|\.env(?:\.[^/]*)?)(?:\/|$)|\.(?:key|pem|p12|pfx|sqlite(?:3)?(?:-wal|-shm)?|log|har)$/i;
const profile=/(?:^|\/)(?:Cookies|Login Data|Local State|Web Data|History|Session Storage|Local Storage)(?:\/|$)/;
for(const commit of commits){
 for(const entry of git('ls-tree','-rz',commit).toString().split('\0').filter(Boolean)){
  const match=entry.match(/^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]*)$/);if(!match)throw new Error('TREE_PARSE');
  const [,mode,type,oid,path]=match;
  if(forbidden.test(path)||profile.test(path))findings.push({rule:'PRIVATE_OR_RUNTIME_PATH',path,commit});
  if(mode==='120000')findings.push({rule:'SYMLINK_REQUIRES_REVIEW',path,commit});
  if(type==='blob'){
   if(!objects.has(oid))objects.set(oid,new Set());
   objects.get(oid).add(path);
  }
 }
}
const rules=[
 ['GITHUB_TOKEN',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
 ['CLOUD_ACCESS_ID',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
 ['API_SECRET',/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/g],
 ['PRIVATE_KEY_PEM',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\r\n]{40,}/g],
 ['JWT_LITERAL',/\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{16,}\b/g],
 ['PRIVATE_KEY_LITERAL',/["']?(?:privateKey|private_key)["']?\s*[=:]\s*['"](?:0x)?[a-fA-F0-9]{64}['"]/gi],
 ['MNEMONIC_LITERAL',/["']?(?:mnemonic|seedPhrase|seed_phrase)["']?\s*[=:]\s*['"](?:[a-z]+ ){11,23}[a-z]+['"]/gi],
 ['COOKIE_LITERAL',/["']?(?:cookieStr|cookieHeader|authorization)["']?\s*[=:]\s*['"](?:Bearer\s+)?[A-Za-z0-9_./+=;-]{32,}['"]/gi],
];
for(const [oid,paths] of objects){
 const path=paths.values().next().value;
 const bytes=git('cat-file','blob',oid);
 if(bytes.includes(0)){
  const digest=createHash('sha256').update(bytes).digest('hex');
  for(const binaryPath of paths){
   if(!reviewedBinaries.get(binaryPath)?.has(digest))findings.push({rule:'BINARY_REQUIRES_REVIEW',path:binaryPath,blob:oid});
  }
  continue;
 }
 const text=bytes.toString('utf8');
 for(const [rule,pattern] of rules){
  pattern.lastIndex=0;
  for(const hit of text.matchAll(pattern)){
   // Clearly named synthetic canaries are not credentials. No arbitrary secret allowlist.
   if(hit[0].includes('SYNTHETIC_'))continue;
   findings.push({rule,path,blob:oid,line:text.slice(0,hit.index).split('\n').length});
  }
 }
}
const unique=[...new Map(findings.map(f=>[JSON.stringify(f),f])).values()];
console.log(JSON.stringify({status:unique.length?'REVIEW_REQUIRED':'PASS',commits:commits.length,blobs:objects.size,findings:unique},null,2));
if(unique.length)process.exitCode=1;
