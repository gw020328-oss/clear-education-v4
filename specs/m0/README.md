# M0 public synthetic contract examples

Status: **FIXED_FOR_M0_FIXTURES / CONSUMER_AGREEMENT_PENDING / NOT_RUNTIME**.

Read [the Korean contract](../../docs/current/M0_CONTRACT.ko.md), [decision register](../../docs/current/M0_DECISIONS.ko.md) and [frontend handoff](../../docs/current/FRONTEND_M0_HANDOFF.ko.md).

- `schema.mjs` exports a bounded JSON Schema 2020-12 subset. All declared object fields are required; nullable fields are explicit. No new dependency or production import.
- `fixtures.json` contains public, invented data and metadata of public source snapshots, independent request/reply snapshots, UI scenario sequences, and mutations expected to fail. References resolve inside the catalog. No real documents, keys, proofs or transactions.
- `benefits.json` adds bounded Siwon 750-course tier/amount cases and 400% blog-precheck stubs. `benefits-check.mjs` checks hand-authored outcomes with limited reference logic and integer arithmetic; it is not a production evaluator or settlement service.
- `lifecycle.json` and `lifecycle-check.mjs` add six two-stage exam scenarios. `Lifecycle*` schemas are re-exported from the isolated SYNTHETIC-only executable reference in `src/exam-evidence/lifecycle.mjs`. It checks purpose/binding/time and retains receipt pins in memory; it is not a live verifier, durable store or product eligibility authority. See [H1](../../docs/current/EXAM_LIFECYCLE.ko.md).
- `check.mjs` is an offline consistency checker for those examples. It accepts only the schema keywords actually used. It checks references, selected fixed invariants and the expected rejection category. It does not implement a production evaluator, trusted source, model, command dispatcher, authorization service, funding engine or general JSON Schema validator.

Run from the repository root:

```sh
./tools/node specs/m0/check.mjs
```

This is required for M0 artifact changes and now runs in the existing public synthetic CI job. H1 boundary tests also run through `test:exam-evidence`. Existing CI remains required before merge. The examples are versioned design inputs, not HTTP responses or production wire/ABI specifications. Every production permission remains disabled; real Moodle/source verification is blocked, grant/outbox is held, and independent claim product transition is NO-GO.
