#!/bin/sh
# Starts only a fresh local synthetic test installation. Does not remove existing resources.
set -eu
test "$#" -eq 2 || { echo 'Usage: sh run_course_dto_fixture.sh /absolute/path/plugin.zip /absolute/path/new-evidence-dir' >&2; exit 2; }
zip=$1
evidence=$2
probe=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
prefix=clear-c-course-dto
phpimage=501f19fa75ad
dbimage=fe03a7605299
case "$zip:$evidence" in
    /*:/*) ;;
    *) exit 2 ;;
esac
expected=afc65f9a4732a63964b2655b160bf5c0b3f9106983cccbe5e926c9fc68e8e54f
actual=$(shasum -a 256 "$zip" | cut -d ' ' -f 1)
test "$actual" = "$expected" || { echo 'Expected the reviewed 1a480e0 ZIP' >&2; exit 2; }
docker volume inspect clear-zip-code >/dev/null
for name in "$prefix-db" "$prefix-web"; do
    if docker container inspect "$name" >/dev/null 2>&1; then exit 2; fi
done
for name in "$prefix-code" "$prefix-data"; do
    if docker volume inspect "$name" >/dev/null 2>&1; then exit 2; fi
done
for name in "$prefix-net" "$prefix-http"; do
    if docker network inspect "$name" >/dev/null 2>&1; then exit 2; fi
done
mkdir "$evidence"
cat > "$evidence/config.php" <<'PHP'
<?php
unset($CFG); global $CFG; $CFG = new stdClass();
$CFG->dbtype = 'pgsql';
$CFG->dblibrary = 'native';
$CFG->dbhost = 'clear-c-course-dto-db';
$CFG->dbname = 'moodle';
$CFG->dbuser = 'moodle';
$CFG->dbpass = 'isolatedtest';
$CFG->prefix = 'mdl_';
$CFG->wwwroot = 'http://127.0.0.1:18770';
$CFG->dataroot = '/var/moodledata';
$CFG->admin = 'admin';
$CFG->directorypermissions = 02777;
$CFG->sessioncookie = 'ClearCourseDTO';
$CFG->session_handler_class = '\core\session\database';
$CFG->local_clearbridge_demo_courseid = 2;
require_once(__DIR__ . '/lib/setup.php');
PHP
docker network create --internal "$prefix-net"
docker network create "$prefix-http"
docker volume create "$prefix-code"
docker volume create "$prefix-data"
docker run -d --pull never --name "$prefix-db" --network "$prefix-net" \
    -e POSTGRES_DB=moodle -e POSTGRES_USER=moodle -e POSTGRES_PASSWORD=isolatedtest "$dbimage"
docker run --rm --pull never --network none --entrypoint sh -v clear-zip-code:/source:ro \
    -v "$prefix-code":/var/www/html -v "$prefix-data":/var/moodledata \
    -v "$evidence/config.php":/fixture/config.php:ro -v "$zip":/fixture/plugin.zip:ro "$phpimage" -c '
        cp -a /source/. /var/www/html/ && rm -rf /var/www/html/local/clearbridge &&
        cp /fixture/config.php /var/www/html/config.php && cd /var/www/html/local &&
        unzip -q /fixture/plugin.zip && chown -R www-data:www-data /var/moodledata'
docker run --rm --pull never --network "$prefix-net" --entrypoint php \
    -v "$prefix-code":/var/www/html -v "$prefix-data":/var/moodledata "$phpimage" \
    /var/www/html/admin/cli/install_database.php --agree-license --adminuser=synthetic-admin \
    --adminpass=Public-Synthetic-Only-2026 --adminemail=admin@example.invalid \
    --fullname='CLEAR synthetic DTO test' --shortname=cleardto > "$evidence/install.log" 2>&1
docker run --rm --pull never --network "$prefix-net" --entrypoint php -e CLEAR_ISOLATED_COURSE_UI=1 \
    -v "$prefix-code":/var/www/html:ro -v "$prefix-data":/var/moodledata -v "$probe":/probe:ro \
    "$phpimage" /probe/course_ui_fixture.php > "$evidence/course-ids.json"
docker run -d --pull never --name "$prefix-web" --network "$prefix-http" -p 127.0.0.1:18770:80 \
    -e CLEAR_ISOLATED_COURSE_DTO=1 -v "$prefix-code":/var/www/html:ro -v "$prefix-data":/var/moodledata \
    -v "$probe":/probe:ro -v "$probe/course_dto_fixture.apache.conf":/etc/apache2/sites-enabled/000-default.conf:ro "$phpimage"
docker network connect "$prefix-net" "$prefix-web"
curl --retry 5 --retry-connrefused --retry-all-errors --retry-delay 1 -fsS -o /dev/null http://127.0.0.1:18770/login/index.php
python3 "$probe/course_dto_http_test.py" "$evidence/course-ids.json" > "$evidence/http.log"
cat "$evidence/http.log"
