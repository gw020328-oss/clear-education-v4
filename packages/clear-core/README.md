# CLEAR preview core

Node 24.21.0+. Zero dependencies, no secrets, no network or payment interfaces.
Exports: structureSynthetic, buildPlan, validatePlan, executePublicDemo, TOOL_MANIFEST, TOPICS, hash.

This is a closed Korean grammar and public synthetic verifier demonstration, not a live AI parser, Moodle collector, Reclaim signature verifier or settlement SDK. Unknown clauses stop the whole plan. All results deny eligibility/payment. Hashes bind bytes, not authenticity or semantic truth. Reflection uses three fixed public quote spans, not AI judgement.

Use `npm pack /path/to/packages/clear-core --ignore-scripts` and install the resulting tarball with `npm install --offline --ignore-scripts --no-audit --no-fund /path/to/tarball`. Import from `@clear/preview-core`. No build step required. The repository example is `examples/clear-core/demo.mjs`; copy it into the clean install directory and run `node demo.mjs`.

## Full offline demonstration package

From the repository with its pinned Node and npm on PATH, run
`./tools/node packages/clear-core/pack-modules.mjs /tmp/clear-delivery`.
Install the generated `clear-preview-core-0.3.1.tgz` in a clean directory with
`npm install --ignore-scripts --no-audit --no-fund /tmp/clear-delivery/clear-preview-core-0.3.1.tgz`.
Installation needs registry access or a populated npm cache. Copy
`examples/clear-core/modules-demo.mjs` into that directory and run
`node modules-demo.mjs`. The package exports the original core and the
fixed public demos under `@clear/preview-core/modules`.

The build stages an explicit dependency closure from repository sources and
records the SHA-256 of each staged file in the tarball. It leaves the source
owners' files in place. The module entry points run on public synthetic
inputs, including transient synthetic Reclaim signatures and an in-memory
read-only S4 decision view. Gemini preparation returns a request body only.

The 0.3.1 tarball also exports `@clear/preview-core/gemini`. Copy
`examples/clear-core/gemini-preview-demo.mjs` into the installed directory
and run it with Node to exercise the offline response fixture and its
selected existing modules. See the repository handoff for the host approval
and operator review integration requirements.
