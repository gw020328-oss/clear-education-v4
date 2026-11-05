#!/usr/bin/env bash
# Build the existing D response adapter and Claude cards from their pinned Git trees.
set -euo pipefail
output="$(cd "$(dirname "$0")/../local_clearbridge/amd/build" && pwd)/course_native_panels.min.js"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
git -C "$1" archive 34f2f3bc0b6dc38dd8bfd1d06298341c14902039 web/src/bootcamp/finals-panels/moodle-response.js | tar -x -C "$scratch"
git -C "$2" archive 05918d9bdf864360b3b2e149c4ab1aab0e78eac8 web/src | tar -x -C "$scratch"
cat > "$scratch/panels.js" <<'ENTRY'
export {toParticipantEntry, toOperatorCourseLink} from './web/src/bootcamp/finals-panels/moodle-response.js';
export {createConditionCards} from './web/src/bootcamp/condition-return/controller.js';
export {memoryStore} from './web/src/bootcamp/condition-return/tracker.js';
ENTRY
npm exec --yes --package=esbuild@0.25.12 -- esbuild "$scratch/panels.js" \
    --bundle --format=iife --global-name=panels --minify --legal-comments=none \
    '--banner:js=define([],function(){' '--footer:js=return panels;});' --outfile="$output"
