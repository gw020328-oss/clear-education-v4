import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { id, Wallet } from 'ethers';
import { createApplicationService } from '../../src/application/service.mjs';
import { draft, epoch } from '../policy/fixture.mjs';

export async function fixture(t, { policyDraft = draft(), proofSourceSigner = null } = {}) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'clear-application-test-')));
  const alice = Wallet.createRandom(), bob = Wallet.createRandom(), operator = Wallet.createRandom(), outsider = Wallet.createRandom();
  let time = Number(epoch('2020-02-01T12:00:00Z'));
  const config = { directory, origin: 'https://clear.example.invalid', chainId: 431701,
    instanceId: id('SYNTHETIC_APPLICATION_INSTANCE'), participants: [alice.address, bob.address], operators: [operator.address], proofSourceSigner };
  let service = createApplicationService({ ...config, now: () => time });
  t.after(() => { service.close(); rmSync(directory, { recursive: true, force: true }); });
  async function login(wallet, target = service) {
    const challenge = target.challenge({ wallet: wallet.address, chainId: config.chainId });
    const signature = await wallet.signMessage(challenge.message);
    const result = target.login({ nonce: challenge.nonce, signature }, challenge.browserToken);
    return { token: result.token, wallet: result.wallet, chainId: config.chainId, csrf: result.csrf };
  }
  const operatorContext = await login(operator);
  const compiled = service.registerPolicy(operatorContext, policyDraft);
  const aliceContext = await login(alice), bobContext = await login(bob);
  return { config, directory, alice, bob, outsider, operator, operatorContext, aliceContext, bobContext, compiled, login,
    get service() { return service; }, get time() { return time; }, setTime(t) { time = t; },
    restart(overrides = {}) { service.close(); service = createApplicationService({ ...config, ...overrides, now: () => time }); },
    create(context = aliceContext, key = 'create-1') { return service.createApplication(context, { policyHash: compiled.policyHash }, key); },
    async signedConsent(app, context = aliceContext, wallet = alice) {
      const typed = service.consentChallenge(context, app.applicationId);
      return { typed, body: { nonce: typed.message.nonce.slice(2), signature: await wallet.signTypedData(typed.domain, typed.types, typed.message) } };
    },
  };
}
