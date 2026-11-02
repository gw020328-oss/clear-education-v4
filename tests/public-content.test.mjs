import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync,spawnSync } from 'node:child_process';
const scanner=fileURLToPath(new URL('../tools/check-public-content.mjs',import.meta.url));
async function repo(t){
 const root=await fs.mkdtemp(join(tmpdir(),'clear-public-scan-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',['-c','core.hooksPath=/dev/null','-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid',...args],{cwd:root,stdio:'pipe'});
 git('init','-q');return {root,git,scan:()=>spawnSync(process.execPath,[scanner],{cwd:root,encoding:'utf8'})};
}
test('public code and synthetic canary pass',async t=>{
 const f=await repo(t);await fs.writeFile(join(f.root,'source.mjs'),'const cookieStr="SYNTHETIC_'+ 'X'.repeat(40)+'";');f.git('add','.');f.git('commit','-qm','synthetic fixture');
 const r=f.scan();assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(JSON.parse(r.stdout).status,'PASS');
});
test('removed historical token is found without printing its value',async t=>{
 const f=await repo(t),token=['gh','p_', 'A'.repeat(36)].join('');
 await fs.writeFile(join(f.root,'example.txt'),JSON.stringify({token,privateKey:'0x'+'ab'.repeat(32),mnemonic:Array(12).fill('synthetic').join(' ')}));f.git('add','.');f.git('commit','-qm','synthetic token fixture');
 f.git('rm','example.txt');f.git('commit','-qm','remove fixture');
 const r=f.scan();assert.equal(r.status,1);assert.ok(JSON.parse(r.stdout).findings.some(x=>x.rule==='GITHUB_TOKEN'));assert.ok(!r.stdout.includes(token));assert.ok(!r.stdout.includes('ab'.repeat(32)));assert.ok(JSON.parse(r.stdout).findings.some(x=>x.rule==='PRIVATE_KEY_LITERAL'));assert.ok(JSON.parse(r.stdout).findings.some(x=>x.rule==='MNEMONIC_LITERAL'));
});
test('private paths and browser artifacts block publication',async t=>{
 const f=await repo(t);await fs.mkdir(join(f.root,'private'));await fs.writeFile(join(f.root,'private','synthetic.txt'),'test');await fs.writeFile(join(f.root,'Cookies'),'test');f.git('add','.');f.git('commit','-qm','synthetic forbidden paths');
 const r=f.scan();assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).findings.length,2);
});
test('reviewed fonts pass only at their reviewed paths and exact bytes',async t=>{
 const f=await repo(t);
 await fs.mkdir(join(f.root,'web/fonts'),{recursive:true});
 const font=await fs.readFile(new URL('../web/fonts/pretendard-std.woff2',import.meta.url));
 await fs.writeFile(join(f.root,'web/fonts/pretendard-std.woff2'),font);
 f.git('add','.');f.git('commit','-qm','reviewed upstream font');
 assert.equal(f.scan().status,0);
 // Historical normalized bytes are reviewed too, but an unrelated mutation is not.
 await fs.writeFile(join(f.root,'web/fonts/pretendard-std.woff2'),Buffer.from(font.toString('latin1').replaceAll('\r\n','\n'),'latin1'));
 f.git('add','.');f.git('commit','-qm','historical normalized font');
 assert.equal(f.scan().status,0);
 await fs.writeFile(join(f.root,'copied.woff2'),font);
 f.git('add','.');f.git('commit','-qm','same blob at unreviewed path');
 let r=f.scan();assert.equal(r.status,1);assert.ok(JSON.parse(r.stdout).findings.some(x=>x.path==='copied.woff2'));
 f.git('rm','copied.woff2');
 const changed=Buffer.from(font);changed[100]^=1;
 await fs.writeFile(join(f.root,'web/fonts/pretendard-std.woff2'),changed);
 f.git('add','.');f.git('commit','-qm','modified font');
 r=f.scan();assert.equal(r.status,1);assert.ok(JSON.parse(r.stdout).findings.some(x=>x.path==='web/fonts/pretendard-std.woff2'));
});
