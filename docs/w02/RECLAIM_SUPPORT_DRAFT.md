# Reclaim support draft — not sent

Subject: Manual provider builder session endpoint has no A/AAAA answers

At approximately 2026-10-10 12:06–12:07 KST (03:06–03:07 UTC), the authenticated manual provider builder at https://dev.reclaimprotocol.org/provider-builder failed in both Chrome and the Codex in-app browser:

`/channel.SessionService/GenerateSession UNKNOWN: Response closed without headers`

The public bundle `https://dev.reclaimprotocol.org/static/js/main.05e68e77.js` configures the session backend as `https://dev-tool.reclaimprotocol.org`. The local system could not resolve that host. Both Google and Cloudflare DNS-over-HTTPS returned status 0 (NOERROR), no Answer, and an SOA authority for both A and AAAA queries. This is NODATA, not NXDOMAIN. As a control, `devapi.reclaimprotocol.org` returned an A answer.

Could you confirm whether the manual builder remains supported, restore its DNS/service or correct the frontend endpoint, and identify the supported replacement flow if it has been retired? We need to build a custom authenticated YBM/TOEIC provider with reviewable request/extraction rules and exact provider-version pinning.

No login token, password, cookie, application secret, or private exam proof is included. This draft has not been sent.
