// Lightweight v2 host/IPC/reuse research runs in the existing isolated wrapper
// CI. Native compiler + ACVM component tests have a separate explicit command.
import './v2/parser.test.mjs';
import './v2/adapter.test.mjs';
import './v2/reuse.test.mjs';
import './v2/registration.test.mjs';
import './v2/memory.test.mjs';
