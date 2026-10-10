/* global ethers */
'use strict';

const AMOUNT = 50_000_000n;
const expectedSchema = 'refund-evidence/1';
const receiptTypes = { Receipt: [
  { name: 'termsHash', type: 'bytes32' }, { name: 'learner', type: 'address' },
  { name: 'session', type: 'uint32' }, { name: 'completedAt', type: 'uint64' }
] };
const acceptanceTypes = { TermsAcceptance: [
  { name: 'termsHash', type: 'bytes32' }, { name: 'learner', type: 'address' },
  { name: 'acceptedAt', type: 'uint64' }
] };
const vaultAbi = [
  'function token() view returns (address)', 'function sponsor() view returns (address)',
  'function verifier() view returns (address)', 'function termsHash() view returns (bytes32)',
  'function start() view returns (uint256)', 'function due() view returns (uint256)',
  'function claimUntil() view returns (uint256)', 'function amount() view returns (uint256)',
  'function totalReserved() view returns (uint256)', 'function enrolled(address) view returns (bool)',
  'function settled(address) view returns (bool)', 'function acceptedAt(address) view returns (uint64)',
  'function consentDigest(address) view returns (bytes32)',
  'function claim(address learner,(bytes32 termsHash,address learner,uint32 session,uint64 completedAt)[] receipts,bytes[] signatures)',
  'event Paid(address indexed learner,address indexed submitter,uint256 amount)'
];
const tokenAbi = ['function balanceOf(address) view returns (uint256)'];

const state = { manifest: null, evidence: null, provider: null, signer: null, walletKind: null,
  fileChecked: false, chainChecked: false, walletChecked: false, claiming: false };
const $ = id => document.getElementById(id);

const messages = {
  SCHEMA: '증빙 파일 구조가 고정 명세와 다릅니다.', EVIDENCE_VERSION: '지원하지 않는 증빙 버전입니다.',
  TERMS_MISMATCH: '파일의 조건이 이 화면의 고정 조건과 다릅니다.', DOMAIN_MISMATCH: '파일의 체인·계약 식별 정보가 다릅니다.',
  RECIPIENT_MISMATCH: '증빙의 수령자가 등록된 참가자와 다릅니다.', CONSENT_SIGNATURE: '참가자 동의 서명이 유효하지 않습니다.',
  ISSUER_SIGNATURE: '제출 증빙 서명이 지정 발급자의 서명이 아닙니다.', DUPLICATE: '같은 회차의 증빙이 중복됩니다.', COUNT: '제출 증빙 4개가 모두 필요합니다.',
  CHAIN_MISMATCH: '잘못된 체인입니다. chainId 31337 로컬 체인에 접속하세요.', DEPLOYMENT_MISMATCH: '배포 블록이 고정 명세와 다릅니다.',
  VAULT_CODE_MISMATCH: '환급 계약 코드가 고정 배포와 다릅니다.', TOKEN_CODE_MISMATCH: '토큰 계약 코드가 고정 배포와 다릅니다.',
  CONTRACT_CONFIG_MISMATCH: '체인의 계약 설정이 고정 조건과 다릅니다.', EXPIRED: '청구 기한이 지났습니다. 거래를 보내지 않았습니다.',
  NOT_CLAIMABLE: '등록되지 않았거나 이미 청구된 수령자입니다.', RESERVE_NOT_CONFIRMED: '전액 예치금을 확인할 수 없습니다.',
  NO_GAS: '청구 전달 지갑에 가스가 없습니다.', RPC_NOT_LOCAL: '이 시제품은 127.0.0.1의 로컬 RPC만 사용합니다.',
  FILE_PARSE: 'JSON 증빙 파일을 읽을 수 없습니다.', WALLET_CHAIN: '브라우저 지갑을 같은 로컬 체인에 연결하세요.',
  PAYMENT_NOT_CONFIRMED: '거래 영수증과 수령 잔액을 모두 확인하지 못했습니다.'
};

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function need(value, code) { if (!value) fail(code); }
function canonical(value) {
  const sort = item => Array.isArray(item) ? item.map(sort) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sort(item[key])])) : item;
  return JSON.stringify(sort(value));
}
function exactKeys(value, expected) {
  need(value && typeof value === 'object' && !Array.isArray(value), 'SCHEMA');
  need(Object.keys(value).sort().join('|') === [...expected].sort().join('|'), 'SCHEMA');
}
function validAddress(value) { try { return typeof value === 'string' && ethers.getAddress(value) !== ethers.ZeroAddress; } catch { return false; } }
function uiError(error) {
  const raw = error?.code || error?.shortMessage || error?.message || 'UNKNOWN';
  const code = Object.keys(messages).find(key => String(raw).includes(key));
  return messages[code] || '처리하지 못했습니다. RPC 연결과 증빙 상태를 확인하세요.';
}
function status(id, kind, title, detail) {
  const box = $(id); box.className = `status ${kind}`;
  box.querySelector('span').textContent = kind === 'success' ? '✓' : kind === 'error' ? '!' : '…';
  box.querySelector('strong').textContent = title; box.querySelector('small').textContent = detail;
}
function toast(message) { const box = $('toast'); box.textContent = message; box.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { box.hidden = true; }, 5000); }
function displayAddress(value) { return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : ''; }

function validateManifest(trusted) {
  exactKeys(trusted, ['manifestVersion', 'terms', 'termsHash', 'domain', 'deployment']);
  need(trusted.manifestVersion === 1, 'TERMS_MISMATCH');
  exactKeys(trusted.terms, ['version', 'courseId', 'submissionIds', 'amount', 'tokenDecimals', 'tokenSymbol', 'chainId', 'token', 'issuer', 'sponsor', 'start', 'due', 'claimUntil', 'expiryPolicy', 'evidenceStatement']);
  const t = trusted.terms;
  need(t.version === 1 && t.courseId === 'refund-course-001' && canonical(t.submissionIds) === '[0,1,2,3]', 'TERMS_MISMATCH');
  need(t.amount === AMOUNT.toString() && t.tokenDecimals === 6 && t.tokenSymbol === 'TEST' && t.chainId === 31337, 'TERMS_MISMATCH');
  need(validAddress(t.token) && validAddress(t.issuer) && validAddress(t.sponsor), 'TERMS_MISMATCH');
  need(Number.isSafeInteger(t.start) && Number.isSafeInteger(t.due) && Number.isSafeInteger(t.claimUntil) && t.start > 0 && t.start < t.due && t.due < t.claimUntil, 'TERMS_MISMATCH');
  need(trusted.termsHash === ethers.keccak256(ethers.toUtf8Bytes(canonical(t))), 'TERMS_MISMATCH');
  exactKeys(trusted.domain, ['name', 'version', 'chainId', 'verifyingContract']);
  need(trusted.domain.name === 'RefundRights' && trusted.domain.version === '2' && trusted.domain.chainId === 31337 && validAddress(trusted.domain.verifyingContract), 'DOMAIN_MISMATCH');
  exactKeys(trusted.deployment, ['genesisHash', 'blockNumber', 'blockHash', 'vaultCodeHash', 'tokenCodeHash']);
  need(Number.isSafeInteger(trusted.deployment.blockNumber) && trusted.deployment.blockNumber >= 0, 'DEPLOYMENT_MISMATCH');
  for (const name of ['genesisHash', 'blockHash', 'vaultCodeHash', 'tokenCodeHash']) need(/^0x[0-9a-f]{64}$/.test(trusted.deployment[name]), 'DEPLOYMENT_MISMATCH');
  return trusted;
}

function validateEvidence(packet, trusted, chainNow) {
  exactKeys(packet, ['schemaVersion', 'terms', 'termsHash', 'domain', 'recipient', 'acceptance', 'submissions']);
  need(packet.schemaVersion === expectedSchema, 'EVIDENCE_VERSION');
  need(canonical(packet.terms) === canonical(trusted.terms) && packet.termsHash === trusted.termsHash, 'TERMS_MISMATCH');
  need(canonical(packet.domain) === canonical(trusted.domain), 'DOMAIN_MISMATCH');
  need(validAddress(packet.recipient), 'RECIPIENT_MISMATCH');
  const recipient = ethers.getAddress(packet.recipient);
  const acceptance = packet.acceptance;
  exactKeys(acceptance, ['termsHash', 'learner', 'acceptedAt', 'signature']);
  need(acceptance.termsHash === trusted.termsHash && validAddress(acceptance.learner) && ethers.getAddress(acceptance.learner) === recipient, 'RECIPIENT_MISMATCH');
  need(Number.isSafeInteger(acceptance.acceptedAt) && acceptance.acceptedAt > 0 && acceptance.acceptedAt <= trusted.terms.due, 'CONSENT_SIGNATURE');
  const acceptValue = { termsHash: acceptance.termsHash, learner: acceptance.learner, acceptedAt: acceptance.acceptedAt };
  let acceptSigner; try { acceptSigner = ethers.verifyTypedData(trusted.domain, acceptanceTypes, acceptValue, acceptance.signature); } catch { fail('CONSENT_SIGNATURE'); }
  need(ethers.getAddress(acceptSigner) === recipient, 'CONSENT_SIGNATURE');
  need(Array.isArray(packet.submissions) && packet.submissions.length === 4, 'COUNT');
  const seen = new Set();
  for (const item of packet.submissions) {
    exactKeys(item, ['receipt', 'signature']); exactKeys(item.receipt, ['termsHash', 'learner', 'session', 'completedAt']);
    const r = item.receipt;
    need(r.termsHash === trusted.termsHash && validAddress(r.learner) && ethers.getAddress(r.learner) === recipient, 'RECIPIENT_MISMATCH');
    need(Number.isSafeInteger(r.session) && r.session >= 0 && r.session < 4, 'COUNT');
    need(!seen.has(r.session), 'DUPLICATE'); seen.add(r.session);
    need(Number.isSafeInteger(r.completedAt) && r.completedAt >= trusted.terms.start && r.completedAt <= trusted.terms.due, 'ISSUER_SIGNATURE');
    let issuer; try { issuer = ethers.verifyTypedData(trusted.domain, receiptTypes, r, item.signature); } catch { fail('ISSUER_SIGNATURE'); }
    need(ethers.getAddress(issuer) === ethers.getAddress(trusted.terms.issuer), 'ISSUER_SIGNATURE');
    if (chainNow !== undefined) need(r.completedAt <= chainNow, 'ISSUER_SIGNATURE');
  }
  if (chainNow !== undefined) need(chainNow <= trusted.terms.claimUntil, 'EXPIRED');
  return { recipient, consentDigest: ethers.TypedDataEncoder.hash(trusted.domain, acceptanceTypes, acceptValue) };
}

async function latestTime(provider) {
  return Number((await provider.send('eth_getBlockByNumber', ['latest', false])).timestamp);
}
async function verifyChain() {
  need(state.evidence, 'FILE_PARSE');
  const rpc = new URL($('rpc').value);
  need(rpc.protocol === 'http:' && rpc.hostname === '127.0.0.1', 'RPC_NOT_LOCAL');
  const provider = new ethers.JsonRpcProvider(rpc.href, undefined, { cacheTimeout: -1 });
  const chainId = Number(await provider.send('eth_chainId', []));
  need(chainId === state.manifest.domain.chainId && chainId === 31337, 'CHAIN_MISMATCH');
  const deployment = state.manifest.deployment;
  const genesis = await provider.send('eth_getBlockByNumber', ['0x0', false]);
  const block = await provider.send('eth_getBlockByNumber', [`0x${deployment.blockNumber.toString(16)}`, false]);
  need(genesis?.hash === deployment.genesisHash && block?.hash === deployment.blockHash, 'DEPLOYMENT_MISMATCH');
  const vaultAddress = state.manifest.domain.verifyingContract;
  const vaultCode = await provider.send('eth_getCode', [vaultAddress, 'latest']);
  const tokenCode = await provider.send('eth_getCode', [state.manifest.terms.token, 'latest']);
  need(vaultCode !== '0x' && ethers.keccak256(vaultCode) === deployment.vaultCodeHash, 'VAULT_CODE_MISMATCH');
  need(tokenCode !== '0x' && ethers.keccak256(tokenCode) === deployment.tokenCodeHash, 'TOKEN_CODE_MISMATCH');
  const vault = new ethers.Contract(vaultAddress, vaultAbi, provider);
  const settings = await Promise.all([vault.token(), vault.sponsor(), vault.verifier(), vault.termsHash(), vault.start(), vault.due(), vault.claimUntil(), vault.amount()]);
  const terms = state.manifest.terms;
  need(ethers.getAddress(settings[0]) === ethers.getAddress(terms.token) && ethers.getAddress(settings[1]) === ethers.getAddress(terms.sponsor) && ethers.getAddress(settings[2]) === ethers.getAddress(terms.issuer), 'CONTRACT_CONFIG_MISMATCH');
  need(settings[3] === state.manifest.termsHash && settings[4] === BigInt(terms.start) && settings[5] === BigInt(terms.due) && settings[6] === BigInt(terms.claimUntil) && settings[7] === AMOUNT, 'CONTRACT_CONFIG_MISMATCH');
  const checked = validateEvidence(state.evidence, state.manifest, await latestTime(provider));
  need(await vault.enrolled(checked.recipient) && !await vault.settled(checked.recipient), 'NOT_CLAIMABLE');
  need(await vault.consentDigest(checked.recipient) === checked.consentDigest && await vault.acceptedAt(checked.recipient) === BigInt(state.evidence.acceptance.acceptedAt), 'CONSENT_SIGNATURE');
  const token = new ethers.Contract(terms.token, tokenAbi, provider);
  const [reserve, vaultBalance] = await Promise.all([vault.totalReserved(), token.balanceOf(vaultAddress)]);
  need(reserve >= AMOUNT && vaultBalance >= reserve, 'RESERVE_NOT_CONFIRMED');
  state.provider = provider; state.chainChecked = true;
  status('chain-status', 'success', '체인·계약·전액 예치 확인', `chainId ${chainId} · 환급 예약 ${ethers.formatUnits(reserve, 6)} TEST`);
  return { checked, vault, token };
}

function updateReady() {
  const ready = state.fileChecked && state.chainChecked && state.walletChecked && !state.claiming;
  $('claim-button').disabled = !ready;
  $('claim-title').textContent = ready ? '모두 확인했습니다' : '아직 청구할 수 없습니다';
  [...$('checklist').children].forEach((item, i) => item.classList.toggle('done', [state.fileChecked, state.chainChecked, state.walletChecked][i]));
}

async function loadPacket(packet, source) {
  validateEvidence(packet, state.manifest);
  state.evidence = packet; state.fileChecked = true; state.chainChecked = false;
  $('recipient').textContent = ethers.getAddress(packet.recipient);
  status('file-status', 'success', '파일 구조·서명 확인', `${source} · 체인 상태 대조가 남았습니다.`);
  updateReady();
}

$('file-input').addEventListener('change', async event => {
  try { const file = event.target.files[0]; need(file, 'FILE_PARSE'); await loadPacket(JSON.parse(await file.text()), file.name); }
  catch (error) { state.fileChecked = false; status('file-status', 'error', '증빙 파일 거부', uiError(error)); updateReady(); }
});
$('demo-file').addEventListener('click', async () => {
  try { const response = await fetch('/demo-evidence.json', { cache: 'no-store' }); need(response.ok, 'FILE_PARSE'); await loadPacket(await response.json(), '독립 화면의 보관 복사본'); }
  catch (error) { state.fileChecked = false; status('file-status', 'error', '증빙 파일 거부', uiError(error)); updateReady(); }
});
$('chain-button').addEventListener('click', async () => {
  state.chainChecked = false; status('chain-status', 'neutral', '체인 확인 중…', '고정 배포 명세와 온체인 상태를 대조합니다.'); updateReady();
  try { await verifyChain(); }
  catch (error) { status('chain-status', 'error', '체인 검증 실패', uiError(error)); toast(uiError(error)); }
  updateReady();
});

async function setSigner(signer, kind) {
  need(state.provider && state.chainChecked, 'CHAIN_MISMATCH');
  const address = await signer.getAddress();
  if (kind === 'browser') {
    const walletNetwork = await signer.provider.getNetwork(); need(Number(walletNetwork.chainId) === 31337, 'WALLET_CHAIN');
  }
  state.signer = signer; state.walletKind = kind;
  const gas = await state.provider.getBalance(address);
  state.walletChecked = gas > 0n;
  status('wallet-status', gas > 0n ? 'success' : 'error', `${displayAddress(address)} 연결`, gas > 0n ? `가스 잔액 ${ethers.formatEther(gas)} ETH · 이 주소는 청구 전달자입니다.` : `${messages.NO_GAS} 다른 가스 보유 지갑도 같은 파일로 전달할 수 있습니다.`);
  const showGas = gas === 0n && kind === 'demo'; $('gas-button').hidden = !showGas; $('gas-note').hidden = !showGas;
  if (gas === 0n) toast(`${messages.NO_GAS} 거래는 전송하지 않았습니다.`);
  updateReady();
}
$('demo-wallet').addEventListener('click', async () => {
  try { await setSigner(ethers.Wallet.createRandom().connect(state.provider), 'demo'); }
  catch (error) { status('wallet-status', 'error', '지갑 연결 실패', uiError(error)); }
});
$('wallet-button').addEventListener('click', async () => {
  try {
    need(window.ethereum, 'WALLET_CHAIN'); const browser = new ethers.BrowserProvider(window.ethereum);
    await browser.send('eth_requestAccounts', []); await setSigner(await browser.getSigner(), 'browser');
  } catch (error) { status('wallet-status', 'error', '브라우저 지갑 연결 실패', window.ethereum ? uiError(error) : '이 브라우저에 주입된 지갑이 없습니다. 로컬 데모 지갑을 사용하세요.'); }
});
$('gas-button').addEventListener('click', async () => {
  try {
    need(state.walletKind === 'demo' && state.provider, 'NO_GAS');
    const address = await state.signer.getAddress();
    await state.provider.send('evm_setAccountBalance', [address, '0xDE0B6B3A7640000']);
    await setSigner(state.signer, 'demo'); $('gas-button').hidden = true; $('gas-note').hidden = true;
    toast('로컬 체인에서만 쓰는 테스트 가스를 추가했습니다.');
  } catch (error) { status('wallet-status', 'error', '테스트 가스 추가 실패', uiError(error)); }
});

$('claim-button').addEventListener('click', async () => {
  state.claiming = true; updateReady();
  try {
    const { checked, vault, token } = await verifyChain();
    const sender = await state.signer.getAddress();
    need(await state.provider.getBalance(sender) > 0n, 'NO_GAS');
    const before = await token.balanceOf(checked.recipient);
    $('result').className = 'result pending'; $('result-mark').textContent = '↗'; $('result-label').textContent = '청구 접수';
    $('result-title').textContent = '거래를 전송했습니다'; $('result-detail').textContent = '이 시점은 지급 완료가 아닙니다. 거래 영수증과 수령 잔액을 확인하는 중입니다.';
    const tx = await vault.connect(state.signer).claim(checked.recipient, state.evidence.submissions.map(item => item.receipt), state.evidence.submissions.map(item => item.signature), { gasLimit: 900000 });
    $('tx').textContent = tx.hash; $('receipt').hidden = false;
    const receipt = await tx.wait();
    need(receipt.status === 1 && await vault.settled(checked.recipient), 'PAYMENT_NOT_CONFIRMED');
    const paid = receipt.logs.map(log => { try { return vault.interface.parseLog(log); } catch { return null; } }).find(log => log?.name === 'Paid');
    need(paid && ethers.getAddress(paid.args.learner) === checked.recipient && paid.args.amount === AMOUNT, 'PAYMENT_NOT_CONFIRMED');
    const after = await token.balanceOf(checked.recipient); need(after - before === AMOUNT, 'PAYMENT_NOT_CONFIRMED');
    $('result').className = 'result success'; $('result-mark').textContent = '✓'; $('result-label').textContent = '실제 지급 완료';
    $('result-title').textContent = '50 TEST 환급을 확인했습니다';
    $('result-detail').textContent = 'Paid 이벤트, settled 상태, 수령자 잔액 증가를 모두 확인했습니다.';
    $('tx').textContent = receipt.hash; $('balance').textContent = `${ethers.formatUnits(after, 6)} TEST`;
    state.chainChecked = false;
  } catch (error) {
    $('result').className = 'result error'; $('result-mark').textContent = '!'; $('result-label').textContent = '청구 실패';
    $('result-title').textContent = '지급을 확인하지 못했습니다'; $('result-detail').textContent = uiError(error);
    if (String(error?.code || error?.message).includes('NO_GAS')) { $('gas-button').hidden = state.walletKind !== 'demo'; $('gas-note').hidden = state.walletKind !== 'demo'; }
  } finally { state.claiming = false; updateReady(); }
});

(async () => {
  try { const response = await fetch('/manifest.json', { cache: 'no-store' }); need(response.ok, 'SCHEMA'); state.manifest = validateManifest(await response.json()); }
  catch { document.body.innerHTML = '<main><section class="result error"><div class="result-mark">!</div><div><h1>고정 배포 명세를 읽지 못했습니다</h1><p>독립 청구 화면 서버를 확인하세요.</p></div></section></main>'; }
})();
