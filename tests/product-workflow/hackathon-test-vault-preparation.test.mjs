// Staged E4 only: fresh memory-chain TEST funding/components and read-only views.
// No .3 payout signatures, accept/claim, live source or external RPC.
// Do not re-import E0/E2 suites already discovered by this guarded CI glob.
import '../hackathon-test-vault/components.test.mjs';
import '../hackathon-test-vault/reader.test.mjs';
import '../hackathon-test-vault/artifact.test.mjs';
