// E2-only entry point for the existing guarded product-workflow CI glob.
// Do not import P0/R2/E0 suites here: the same glob already discovers them.
// The probe deploys only a pure hash helper to a fresh in-memory EVM;
// no authorization signatures, transfers, persistent chain or external RPC.
import '../bootcamp-authorization/test-encoding-v3.test.mjs';
import '../bootcamp-authorization/test-hash-probe-v3.test.mjs';
