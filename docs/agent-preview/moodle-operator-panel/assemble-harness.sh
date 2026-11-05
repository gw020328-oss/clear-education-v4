#!/usr/bin/env bash
# Isolated harness for the operator condition panel on configure.php — NOT a real Moodle.
# Usage: ESBUILD=/path/to/esbuild assemble-harness.sh <C repo> <C commit> <cards+panel repo> <panel commit> <out dir>
#   C repo/commit   : local_clearbridge source (patch base f0c7ece9d77b9a4a8f5a6a8afa89a3e57db0f00d)
#   cards+panel repo: repo containing 05918d9 (student cards) and <panel commit> (this branch)
# The D adapter commit 34f2f3b is read from the C repo as in build_condition_panels.sh.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
c_repo="$1"; c_commit="$2"; web_repo="$3"; panel_commit="$4"; out="$5"
: "${ESBUILD:?set ESBUILD to an esbuild binary}"
mkdir -p "$out/amd"; work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
git -C "$c_repo" archive "$c_commit" plugins/moodle | tar -x -C "$work"
git -C "$work" init -q && git -C "$work" -c core.autocrlf=false apply "$here/c-f0c7ece-operator-conditions.patch"
sed -e "s#^output=.*#output=\"$out/amd/course_native_panels.js\"#" \
    -e "s#npm exec --yes --package=esbuild@0.25.12 -- esbuild#$ESBUILD#" \
    "$work/plugins/moodle/moodle-integration/build_condition_panels.sh" > "$work/build.sh"
OPERATOR_PANEL_COMMIT="$panel_commit" bash "$work/build.sh" "$c_repo" "$web_repo"
src="$work/plugins/moodle/local_clearbridge"
cp "$src"/amd/src/course_native_wallet_contract.js "$src"/amd/src/course_native_wallet_view.js \
   "$src"/amd/src/course_native_workflow.js "$src"/amd/src/course_native_wallet.js "$out/amd/"
cp "$src/styles.css" "$out/plugin-styles.css"
cp "$here/configure.html" "$here/harness.mjs" "$out/"
mkdir -p "$out/web/src"; git -C "$web_repo" archive "$panel_commit" web/src | tar -x -C "$out"
echo "harness ready: serve $out over http and open configure.html?port=none&auth=1"
