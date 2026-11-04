"""Exercise the installed ZIP against synthetic Moodle roles on the fixed loopback fixture."""
import http.cookiejar
import json
from html.parser import HTMLParser
from pathlib import Path
import sys
from urllib.error import HTTPError
from urllib.parse import urlencode, urlparse
from urllib.request import build_opener, HTTPCookieProcessor, HTTPRedirectHandler, ProxyHandler

ORIGIN = 'http://127.0.0.1:18769'


class LocalRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, file, code, msg, headers, newurl):
        target = urlparse(newurl)
        assert (target.scheme, target.netloc) == ('http', '127.0.0.1:18769')
        return super().redirect_request(request, file, code, msg, headers, newurl)


class Inputs(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.values = {}
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == 'input' and values.get('type') == 'hidden' and 'name' in values:
            self.values[values['name']] = values.get('value', '')


def client():
    return build_opener(ProxyHandler({}), HTTPCookieProcessor(http.cookiejar.CookieJar()), LocalRedirect())


def fetch(browser, path, data=None):
    body = urlencode(data).encode() if data else None
    try:
        response = browser.open(ORIGIN + path, data=body, timeout=20)
    except HTTPError as error:
        response = error
    with response:
        return response.status, urlparse(response.geturl()).path, response.headers, response.read().decode()


def login(actor):
    browser = client()
    path = '/login/index.php'
    token = Inputs(fetch(browser, path)[3]).values['logintoken']
    status, actual_path, _, body = fetch(browser, path, {
        'username': f'synthetic-{actor}', 'password': 'Public-Synthetic-Only-2026', 'logintoken': token,
    })
    assert status == 200 and actual_path != path, (actor, status, actual_path)
    return browser


ids = json.loads(Path(sys.argv[1]).read_text())
student_url = f"/local/clearbridge/index.php?id={int(ids['course'])}"
teacher_url = f"/local/clearbridge/configure.php?id={int(ids['course'])}"
other_student_url = f"/local/clearbridge/index.php?id={int(ids['other'])}"
other_teacher_url = f"/local/clearbridge/configure.php?id={int(ids['other'])}"
policy = 'Demo refund when all conditions are met: 100 TEST'
student_only = 'Your Moodle enrolment in this course is confirmed.'
teacher_only = 'This saves only the course activity mapping.'

for url in (student_url, teacher_url):
    status, path, _, body = fetch(client(), url)
    assert path == '/login/index.php' and policy not in body, (status, path)
print('PASS anonymous requests to both routes require Moodle login')

student = login('student')
status, path, headers, body = fetch(student, student_url + '&role=teacher&registered=1&paid=1')
assert status == 200 and path == '/local/clearbridge/index.php'
for label in (policy, student_only, 'Introductory lecture completion mark', 'Practice assignment submission',
              'problem solving and lessons learned', 'HackerRank Python (Basic) certification',
              'CLEAR recipient registration cannot be checked yet', 'A receipt will appear here'):
    assert label in body, label
assert teacher_only not in body
assert 'no-store' in headers.get('Cache-Control', ''), headers.get('Cache-Control', '')
assert '<iframe' not in body.lower()
print('PASS enrolled student sees four conditions, unavailable authority state and no iframe or caching')

status, path, _, body = fetch(student, other_student_url)
assert status == 200 and path == '/local/clearbridge/index.php' and policy not in body
assert 'CLEAR refund review is not connected for this course.' in body
assert teacher_only not in fetch(student, teacher_url)[3]
print('PASS URL substitution cannot show the fixed policy in another enrolled course or grant teacher access')

teacher = login('editingteacher')
status, path, _, body = fetch(teacher, teacher_url)
assert status == 200 and path == '/local/clearbridge/configure.php'
assert policy in body and teacher_only in body and student_only not in body
assert 'AI structuring and tool execution preview are not connected yet.' in body
assert {'sesskey', 'id'}.issubset(Inputs(body).values)
assert teacher_only not in fetch(teacher, other_teacher_url)[3]
assert student_only not in fetch(teacher, student_url)[3]
print('PASS editing teacher gets the existing protected mapping form only in the authorized course')

for actor in ('suspended', 'outsider'):
    browser = login(actor)
    for url in (student_url, teacher_url):
        status, path, _, body = fetch(browser, url)
        assert policy not in body and teacher_only not in body and student_only not in body, (actor, status, path)
print('PASS suspended and unenrolled accounts cannot open either protected view')

course_url = f"/course/view.php?id={int(ids['course'])}"
for browser, entry in ((student, student_url), (teacher, teacher_url)):
    status, path, _, body = fetch(browser, course_url)
    assert status == 200 and path == '/course/view.php' and entry in body
print('PASS actual Moodle course navigation contains the role-specific entry links')
