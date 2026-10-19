import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../../../',import.meta.url);
const intake=JSON.parse(readFileSync(new URL('specs/bootcamp/hackathon-test-e5-development-intake-v1.json',root)));
const digest=p=>createHash('sha256').update(readFileSync(new URL(p,root))).digest('hex');
for(const [path,expected]of Object.entries(intake.e4.artifactSha256AtAcceptedHead))assert.equal(digest(path),expected,path);
assert.equal(digest(intake.frozenInputs.memoryBoundary),intake.frozenInputs.memoryBoundarySha256);
console.log(JSON.stringify({frozenE4Files:Object.keys(intake.e4.artifactSha256AtAcceptedHead).length,memoryBoundaryV1:'UNCHANGED'}));
