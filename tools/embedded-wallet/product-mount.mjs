import {randomBytes} from 'node:crypto';
import {validateConfig, embeddedCsp} from '../../src/embedded-wallet/config.mjs';

// Opt-in marker is part of the owner's reviewed public asset snapshot. No
// request parameter can enable this mount or choose App ID/runtime/RPC.
export function productWalletMount({assets, origin, chainId, network, runtime}) {
  const marker = assets.get('/clear-wallet-app.html');
  if (!marker) return null;
  const match = /^<meta name="clear-wallet-app" content="([a-z0-9]{10,80})">\n$/.exec(marker.body.toString());
  if (!match || !runtime || !network || !assets.has('/assets/onboarding.js') || !assets.has('/assets/operator.js')) throw Error('EMBEDDED_PRODUCT_ASSETS');
  const config = validateConfig({appId: match[1], origin, chainId, rpcUrl: network.rpcUrls[0],
    redirectUri: origin + '/onboarding', phase: 'ACTIVE_LOCAL_TEST', instanceId: runtime.instanceId});
  return Object.freeze({config,
    isDocument(req) { return req.method === 'GET' && ['/onboarding', '/operator'].includes(req.url.split('?')[0]); },
    handle(req, res) {
      if (req.method === 'GET' && req.url === '/__embedded/config') {
        res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify(config)); return true;
      }
      if (!this.isDocument(req)) return false;
      const nonce = randomBytes(24).toString('base64'), operator = req.url.split('?')[0] === '/operator';
      res.setHeader('Content-Security-Policy', embeddedCsp(nonce, config.rpcUrl));
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="sc-nonce" content="${nonce}"><title>CLEAR ${operator ? '운영자 승인' : '참가자 신청'}</title><link rel="stylesheet" href="/assets/style.css"></head><body><div id="root"></div><script type="module" nonce="${nonce}" src="/assets/${operator ? 'operator' : 'onboarding'}.js"></script></body></html>`); return true;
    },
  });
}

// Server-owned source/runtime anchors. These never come from a signable packet.
export function productSigningContext({runtime, pins, applicationId, participantId, participant}) {
  if (!applicationId) return null;
  return {source: {applicationId, participantId, policyHash: runtime.policyHash,
    runtimeMappingHash: runtime.runtimeMappingHash, audience: pins.audience,
    trustConfigHash: pins.trustConfigHash, recipeHash: pins.recipeHash,
    expectedClaimOwner: pins.expectedClaimOwner, selectedCertificateId: pins.selectedCertificateId},
    registration: {applicationId, instanceId: runtime.instanceId, verifyingContract: runtime.vaultAddress,
      policyHash: runtime.policyHash, runtimeMappingHash: runtime.runtimeMappingHash, participant}};
}
