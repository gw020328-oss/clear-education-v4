# Reviewed Zod backport

Run from the repository root with the pinned toolchain:

```sh
./tools/npm --prefix src/embedded-wallet ci --strict-peer-deps --ignore-scripts --no-audit --no-fund
./tools/node tools/embedded-wallet/reviewed-dependencies.mjs --apply
./tools/node tools/embedded-wallet/reviewed-dependencies.mjs
```

This is an explicit, offline reviewed patch, not an npm lifecycle script or a new npm release. Both wallet build entrypoints verify the installed hashes and refuse an unpatched or changed graph. The patch runner checks the manifest, every installed Zod copy, package metadata, and all before/after hashes before writing any file. A second application is a no-op. A changed lock/version/context requires review; do not bypass the check.

`zod-6699.json` pins official [PR6699](https://github.com/colinhacks/zod/pull/6699) commit `540f40974ff131ab96130b8fcc29af14bb750395`, based on `50606616c0d291caf3210a7521da51271b918333`, including [PR6696](https://github.com/colinhacks/zod/pull/6696). Source changes are accompanied by equivalent ESM/CJS edits, not runtime monkey patches. The original MIT license is included.

All Zod 3 consumers resolve 3.25.76; its root/v3, bundled v4/core, classic and mini entrypoints are covered. Porto's Zod 4.6.7 still exports v3: the v3 collection/intersection backport is applied there too, preserving its existing emoji fix and prototype guard. Its v4 implementation is already fixed and remains unchanged. The installed graph has two Zod packages and twelve patched files.

Oversized **bounded** arrays/sets/maps reject before parsing elements, intersections use linear key lookup, and emoji matching avoids the reviewed overlapping alternatives. **Unbounded collections remain unbounded**; the patch does not add application limits to x402 or establish whole-SDK non-reachability. Audit still reports Zod because package versions are deliberately unchanged. Keep audit output visible.

Scoped Privy overrides retain viem 2.57.13 / ox 0.14.59, instead of downgrading to ethereum's published exact viem 2.56.5 peer. This is a locally tested compatibility decision, not an upstream declaration. Strict peer installation, actual product bundle paths, personal-sign recovery, the actual V2 EIP-712 wire payload, and malformed struct rejection are tested. Future SDK updates must re-review the overrides and hashes.
