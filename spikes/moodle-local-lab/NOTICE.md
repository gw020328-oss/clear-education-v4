# Local Moodle laboratory source notices

The `plugins/local/clearwatch` source and `videocheck-clearwatch.patch` are derived
from the public CLEAR Moodle error-correction prototype supplied on 2026-10-14.
They retain GPL-3.0-or-later notices. Changes on 2026-10-15 add transactional
current-export revision hooks; the browser telemetry timing protocol is retained.
`plugins/local/clearapi` is new GPL-3.0-or-later source. See LICENSE-GPL-3.0.txt.
The checked-in AMD build is readable source with the named AMD module header;
it is not an opaque minified dependency. Regeneration: copy tracker.js and replace
`define(['core/ajax']` with `define('local_clearwatch/tracker', ['core/ajax']`.

Moodle (GPL-3.0-or-later) and Video Checkpoints (GPL-3.0-or-later, copyright 2026
Eduardo Kraus) are fetched separately at the pinned commits in bootstrap.mjs.
Their source, original license notices and dependencies are retained in the
ignored runtime clones. This repository does not redistribute their full trees
or the synthetic video binary. Docker images are digest-pinned separately.
