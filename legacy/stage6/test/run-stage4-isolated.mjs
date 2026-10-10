import { mkdtemp,cp,readFile,writeFile,symlink,rm,readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { freePort } from './processes.mjs';

const project=fileURLToPath(new URL('../../',import.meta.url)),dir=await mkdtemp(join(tmpdir(),'refund-stage4-isolated-'));
try{
  await Promise.all([cp(join(project,'stage2'),join(dir,'stage2'),{recursive:true}),cp(join(project,'stage4'),join(dir,'stage4'),{recursive:true})]);await symlink(join(project,'node_modules'),join(dir,'node_modules'),'dir');
  const ports=await Promise.all([freePort(),freePort(),freePort(),freePort()]),replacements=[['8545',String(ports[0])],['4300',String(ports[1])],['4301',String(ports[2])],['4400',String(ports[3])]];
  for(const path of [join(dir,'stage4/harness.mjs'),join(dir,'stage4/claim-ui/index.html')]){let source=await readFile(path,'utf8');for(const [from,to]of replacements)source=source.replaceAll(from,to);await writeFile(path,source);}
  const testDir=join(dir,'stage4/test'),files=(await readdir(testDir)).filter(name=>name.endsWith('.test.mjs')).map(name=>join(testDir,name));
  const child=spawn(process.execPath,['--test','--test-reporter=tap',...files],{cwd:join(dir,'stage4'),stdio:'inherit'});const code=await new Promise(resolve=>child.once('exit',resolve));if(code!==0)process.exitCode=code;
}finally{await rm(dir,{recursive:true,force:true});}
