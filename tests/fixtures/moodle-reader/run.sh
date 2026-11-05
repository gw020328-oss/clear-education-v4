#!/bin/sh
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
reader=${1:-"$repo/tools/bootcamp/normal-moodle-reader.php"}
fixture="$repo/tests/fixtures/moodle-reader"
scratch=$(mktemp -d /private/tmp/clear-reader-revoke.XXXXXX)
trap 'rm -rf "$scratch"' EXIT HUP INT TERM
mkdir -p "$scratch/double/webservice" "$scratch/state"
printf '<?php\n' > "$scratch/double/externallib.php"
printf '<?php\n' > "$scratch/double/webservice/lib.php"
printf '{}' > "$scratch/scope.json"
docker run --rm --network none --entrypoint php \
  -v "$reader:/reader.php:ro" \
  -v "$fixture/config.php:/var/www/html/config.php:ro" \
  -v "$fixture/regression.php:/regression.php:ro" \
  -v "$scratch/double:/double:ro" \
  -v "$scratch/state:/scratch" \
  -v "$scratch/scope.json:/activity-reader-scope.json" \
  moodlehq/moodle-php-apache@sha256:501f19fa75ad3cdc8962f2a742f39d179b8aa8ffdc2ff233d8d27a32f14e0e05 /regression.php
