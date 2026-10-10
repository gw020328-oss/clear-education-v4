import { spawn } from 'node:child_process';
import { readdir,writeFile,mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root=fileURLToPath(new URL('./',import.meta.url));
const files=(await readdir(join(root,'test'))).filter(n=>n.endsWith('.test.mjs')).map(n=>join(root,'test',n));
const child=spawn(process.execPath,['--test','--test-reporter=tap','--test-concurrency=1',...files],{stdio:['ignore','pipe','pipe']});let output='';
child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
const exitCode=await new Promise(resolve=>child.once('exit',resolve));
// TAP failure diagnostics must not accidentally persist an arbitrary hex32 secret.
const safe=output.replace(/0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/g,'[hex32 redacted]');
await mkdir(join(root,'artifacts'),{recursive:true});await writeFile(join(root,'artifacts/stage7-tests.tap'),safe,{mode:0o600});console.log(safe);process.exitCode=exitCode??1;
