"""HTTP verification for the explicitly mounted, isolated synthetic DTO fixture."""
import http.cookiejar
import json
from html.parser import HTMLParser
from pathlib import Path
import sys
from urllib.error import HTTPError
from urllib.parse import urlencode, urlparse
from urllib.request import (build_opener, HTTPRedirectHandler, HTTPCookieProcessor,
                            ProxyHandler, Request)

ORIGIN = 'http://127.0.0.1:18770'
B_RESULT = 'The current source status was not checked.'
A_RESULT = 'Synthetic receipt display sample: 100 TEST. No transfer occurred.'
UNAVAILABLE = 'CLEAR projections unavailable.'


class LocalRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urlparse(newurl)
        assert (target.scheme, target.netloc) == ('http', '127.0.0.1:18770')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class LoginToken(HTMLParser):
    token = None

    def handle_starttag(self, tag, attrs):
        fields = dict(attrs)
        if tag == 'input' and fields.get('name') == 'logintoken':
            self.token = fields.get('value')


def client():
    return build_opener(ProxyHandler({}), HTTPCookieProcessor(http.cookiejar.CookieJar()), LocalRedirect())


def fetch(browser, path, grant=None, data=None):
    request = Request(ORIGIN + path, data=urlencode(data).encode() if data else None)
    if grant is not None:
        request.add_unredirected_header('X-Clear-Test-Grant', grant)
    try:
        response = browser.open(request, timeout=20)
    except HTTPError as exc:
        response = exc
    with response:
        return response.status, urlparse(response.geturl()).path, response.headers, response.read().decode()


def login(actor):
    browser = client()
    path = '/login/index.php'
    parser = LoginToken()
    parser.feed(fetch(browser, path)[3])
    assert parser.token
    status, actual_path, _, _ = fetch(browser, path, data={
        'username': f'synthetic-{actor}', 'password': 'Public-Synthetic-Only-2026', 'logintoken': parser.token,
    })
    assert status == 200 and actual_path != path, actor
    return browser


def no_projections(body):
    assert B_RESULT not in body and A_RESULT not in body


def unavailable(response):
    status, _, headers, body = response
    assert status == 200 and UNAVAILABLE in body and 'no-store' in headers.get('Cache-Control', '')
    no_projections(body)


ids = json.loads(Path(sys.argv[1]).read_text())
course, other = int(ids['course']), int(ids['other'])
student_route = f'/__course-dto/student.php?id={course}'
teacher_route = f'/__course-dto/teacher.php?id={course}'
for path, grant in [(student_route, 'fixture-student'), (teacher_route, 'fixture-operator')]:
    _, actual_path, _, body = fetch(client(), path, grant)
    assert actual_path == '/login/index.php'
    no_projections(body)
print('PASS separate synthetic CLEAR grant without Moodle login cannot display either DTO')

student, teacher = login('student'), login('editingteacher')
for browser, path, matching, wrong in [
    (student, student_route, 'fixture-student', 'fixture-operator'),
    (teacher, teacher_route, 'fixture-operator', 'fixture-student'),
]:
    unavailable(fetch(browser, path))
    unavailable(fetch(browser, path, wrong))
    unavailable(fetch(browser, path + '&grant=' + matching + '&role=COURSE_OPERATOR&applicationId=attacker'))
    status, _, headers, body = fetch(browser, path, matching)
    assert status == 200 and 'no-store' in headers.get('Cache-Control', '')
    assert B_RESULT in body and A_RESULT in body and 'Evidence expired' in body and UNAVAILABLE not in body
    assert 'fixture-student' not in body and 'fixture-operator' not in body
    assert '<iframe' not in body.lower()
print('PASS only matching separate grant enables synthetic DTOs for both Moodle roles; query cannot supply authority')

for browser, path, grant in [(student, teacher_route, 'fixture-operator'), (teacher, student_route, 'fixture-student')]:
    no_projections(fetch(browser, path, grant)[3])
for actor in ['suspended', 'outsider']:
    no_projections(fetch(login(actor), student_route, 'fixture-student')[3])
print('PASS mismatched Moodle role, suspended and unenrolled accounts cannot display DTOs')

unavailable(fetch(student, f'/__course-dto/student.php?id={other}', 'fixture-student'))
print('PASS another actively enrolled Moodle course remains unconnected')

for scenario in ['b-error', 'a-error', 'revoked']:
    response = fetch(student, student_route, f'fixture-student-{scenario}')
    unavailable(response)
    assert 'Synthetic B read error' not in response[3] and 'Synthetic A read error' not in response[3]
print('PASS B error, A error and final authority loss suppress both projections')

assert fetch(student, student_route, 'fixture-student', {'id': course})[0] == 404
body = fetch(student, f'/local/clearbridge/index.php?id={course}', 'fixture-student')[3]
no_projections(body)
assert 'CLEAR recipient registration cannot be checked yet' in body
print('PASS POST is refused and the shipped plugin route remains unconnected')
