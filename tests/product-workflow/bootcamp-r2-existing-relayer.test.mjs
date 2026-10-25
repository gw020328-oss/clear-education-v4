// Existing immutable V4 subset verification only; does not implement/authorize the new bootcamp bridge.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../vault/fixture.mjs';
test('existing V4 relayer pays native gas; fixed learner receives TEST and pays no claim gas',async t=>{
 const f=await fixture(t),first=await f.enroll(),second=await f.enroll();await f.setTime(f.config.normalSubmitFrom);
 const grant=f.grant(first.typed),relayer=await f.provider.getSigner(f.app.bob.address);
 await (await f.vault.connect(relayer).authorizeGrant(grant,await f.signGrant(grant))).wait();
 const learnerGasBefore=await f.provider.getBalance(f.app.alice.address),relayGasBefore=await f.provider.getBalance(f.app.bob.address);
 const receipt=await (await f.vault.connect(relayer).claim(first.typed.message.applicationId)).wait();
 assert.ok(receipt.gasUsed>0n&&receipt.fee>0n);assert.equal(receipt.from.toLowerCase(),f.app.bob.address.toLowerCase());
 assert.equal(await f.provider.getBalance(f.app.alice.address),learnerGasBefore);
 assert.equal(relayGasBefore-await f.provider.getBalance(f.app.bob.address),receipt.fee);
 assert.equal(await f.token.balanceOf(f.app.alice.address),BigInt(f.config.amount));assert.equal(await f.token.balanceOf(f.app.bob.address),0n);
 assert.equal(await f.vault.totalReserved(),BigInt(f.config.amount));
 assert.equal((await f.vault.enrollments(second.typed.message.applicationId)).settled,false);
 await assert.rejects(()=>f.vault.connect(relayer).claim.staticCall(first.typed.message.applicationId),/CLAIM_STATE/);
});
