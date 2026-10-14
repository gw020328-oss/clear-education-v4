# M0 public synthetic contract examples

Status: **FIXED_FOR_M0_FIXTURES / CONSUMER_AGREEMENT_PENDING / NOT_RUNTIME**.

Read [the Korean contract](../../docs/current/M0_CONTRACT.ko.md), [decision register](../../docs/current/M0_DECISIONS.ko.md) and [frontend handoff](../../docs/current/FRONTEND_M0_HANDOFF.ko.md).

- `schema.mjs` exports a bounded JSON Schema 2020-12 subset. All declared object fields are required; nullable fields are explicit. No new dependency or production import.
- `fixtures.json` contains public, invented data and metadata of public source snapshots, independent request/reply snapshots, UI scenario sequences, and mutations expected to fail. References resolve inside the catalog. No real documents, keys, proofs or transactions.
- `check.mjs` is an offline consistency checker for those examples. It accepts only the schema keywords actually used. It checks references, selected fixed invariants and the expected rejection category. It does not implement an evaluator, trusted source, model, command dispatcher, authorization service, funding engine or general JSON Schema validator.

Run from the repository root:

```sh
./tools/node specs/m0/check.mjs
```

This is a manual required check for M0 artifact changes; existing GitHub CI is unchanged and does not run it. Existing CI remains required before merge. The examples are versioned design inputs, not HTTP responses or production wire/ABI specifications. Every production permission remains disabled; real Moodle/source verification is blocked, grant/outbox is held, and independent claim product transition is NO-GO.
