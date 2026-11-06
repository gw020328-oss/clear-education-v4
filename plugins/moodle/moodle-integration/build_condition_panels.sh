#!/usr/bin/env bash
# Build the existing D response adapter and Claude cards from their pinned Git trees.
set -euo pipefail
output="$(cd "$(dirname "$0")/../local_clearbridge/amd/build" && pwd)/course_native_panels.min.js"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
git -C "$1" archive 34f2f3bc0b6dc38dd8bfd1d06298341c14902039 web/src/bootcamp/finals-panels/moodle-response.js | tar -x -C "$scratch"
# Participant cards, stage strip and payout summary: #173 (codex/ux-first-glance) reviewed head.
git -C "$2" archive 9bda108e6ea527ae54b90e2a51cd811cfe9cd1ea web/src | tar -x -C "$scratch"
# Operator condition draft panel (display only): mount + ai-compare + operator-proposer + v2.1 converter.
mkdir -p "$scratch/operator"
git -C "$2" archive 8546b67b1ca1e4a525b9b82d8d5254347d6cb0e9 web/src | tar -x -C "$scratch/operator"
cat > "$scratch/panels.js" <<'ENTRY'
export {toParticipantEntry, toOperatorCourseLink} from './web/src/bootcamp/finals-panels/moodle-response.js';
export {createConditionCards} from './web/src/bootcamp/condition-return/controller.js';
export {memoryStore} from './web/src/bootcamp/condition-return/tracker.js';
export {stageStrip, participantStage} from './web/src/bootcamp/condition-return/stage-strip.js';
export {payoutSummary} from './web/src/bootcamp/panels.js';
export {mountOperatorConditionPanel} from './operator/web/src/bootcamp/finals-panels/operator-condition-mount.js';
ENTRY
npm exec --yes --package=esbuild@0.25.12 -- esbuild "$scratch/panels.js" \
    --bundle --format=iife --global-name=panels --minify --legal-comments=none \
    '--banner:js=define([],function(){' '--footer:js=return panels;});' --outfile="$output"
