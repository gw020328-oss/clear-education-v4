import ganache from 'ganache';
import { BrowserProvider, ContractFactory, id, Wallet } from 'ethers';
import { fixture as applicationFixture } from '../application/fixture.mjs';
import { buildVault } from '../../src/vault/build.mjs';
import { createVaultReader } from '../../src/vault/reader.mjs';
import { finalTerms, grantTypes, vaultDomain } from '../../src/vault/encoding.mjs';

// Fresh isolated in-memory chain per test; ephemeral keys never leave memory.
// No HTTP listener, external RPC, existing chain reset or valuable assets.
export async function fixture(t, { config: overrides = {}, bind = true } = {}) {
  const app = await applicationFixture(t), issuer = Wallet.createRandom(), outage = Wallet.createRandom();
  const wallets = [app.operator, app.alice, app.bob, issuer, outage];
  const raw = ganache.provider({ logging: { quiet: true }, chain: { chainId: app.config.chainId, hardfork: 'shanghai', time: new Date(app.time * 1000) },
    miner: { timestampIncrement: 0 }, wallet: { accounts: wallets.map(w => ({ secretKey: w.privateKey, balance: '0x3635c9adc5dea00000' })) } });
  const provider = new BrowserProvider(raw, undefined, { cacheTimeout: -1 });
  t.after(async () => { provider.destroy(); await raw.disconnect(); });
  const signer = await provider.getSigner(app.operator.address), artifacts = buildVault();
  const token = await new ContractFactory(artifacts.ClearTestToken.abi, artifacts.ClearTestToken.bytecode, signer).deploy(1000000000000n);
  await token.waitForDeployment();
  const p = app.compiled.policy;
  const config = { configVersion: '4', instanceId: app.config.instanceId, cohortId: id(p.cohortId), policyHash: app.compiled.policyHash,
    token: await token.getAddress(), sponsor: app.operator.address, issuer: issuer.address, outageSigner: outage.address,
    ...Object.fromEntries(['amount', 'enrollmentStart', 'enrollmentUntil', 'normalSubmitFrom', 'normalSubmitAt', 'supplementEndAt', 'claimUntil'].map(k => [k, p[k]])), ...overrides };
  const vault = await new ContractFactory(artifacts.CourseRefundVaultV4.abi, artifacts.CourseRefundVaultV4.bytecode, signer).deploy(config);
  await vault.waitForDeployment();
  const pin = { chainId: app.config.chainId, genesisHash: (await provider.send('eth_getBlockByNumber', ['0x0', false])).hash,
    vaultAddress: await vault.getAddress(), deploymentTxHash: vault.deploymentTransaction().hash };
  const reader = createVaultReader(provider, pin);
  app.restart({ vaultReader: reader });
  if (bind) await app.service.bindRuntime(app.operatorContext, { policyHash: app.compiled.policyHash });
  const record = await reader.inspect();
  let serial = 0;
  const terms = (changes = {}) => finalTerms(record, { applicationId: id('application-' + ++serial), learner: app.alice.address,
    policyHash: config.policyHash, runtimeConfigHash: record.runtimeConfigHash, nonce: id('nonce-' + serial),
    signedAt: String(app.time), expiresAt: String(app.time + 600), ...changes });
  const sign = (typed, wallet = app.alice) => wallet.signTypedData(typed.domain, typed.types, typed.message);
  const enroll = async (typed = terms(), wallet = app.alice) => {
    await (await token.approve(pin.vaultAddress, config.amount)).wait();
    const sig = await sign(typed, wallet);
    const tx = await vault.enrollAndFund(typed.message, sig); await tx.wait();
    return { typed, signature: sig, tx };
  };
  return { app, config, issuer, outage, raw, provider, signer, token, vault, pin, record, reader, artifacts, terms, sign, enroll,
    async setTime(value) { app.setTime(Number(value)); await provider.send('evm_setTime', [Number(value) * 1000]); await provider.send('evm_mine', []); },
    async accepted(context = app.aliceContext, wallet = app.alice) {
      const a = app.create(context, 'create-' + ++serial), preliminary = await app.signedConsent(a, context, wallet);
      app.service.consent(context, a.applicationId, preliminary.body, 'consent-' + serial);
      const typed = await app.service.finalConsentChallenge(context, a.applicationId), signature = await sign(typed, wallet);
      const body = { nonce: typed.message.nonce.slice(2), signature };
      app.service.finalConsent(context, a.applicationId, body);
      return { a, typed, signature, body };
    },
    grant(typed, changes = {}) {
      return { grantId: id('grant-' + ++serial), applicationId: typed.message.applicationId, learner: typed.message.learner,
        policyHash: config.policyHash, runtimeConfigHash: record.runtimeConfigHash, examNullifier: id('exam-' + serial), amount: config.amount,
        verifiedAt: config.normalSubmitFrom, issueBy: config.normalSubmitAt, claimUntil: config.claimUntil, ...changes };
    },
    signGrant(g, wallet = issuer) { return wallet.signTypedData(vaultDomain(record), grantTypes, g); },
  };
}
