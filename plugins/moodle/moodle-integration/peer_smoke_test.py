#!/usr/bin/env python3
"""First physical C connection: exact B-shaped input, completed Page, target fences."""
import json, secrets, subprocess
import peer_http_tests as p
request=dict(version='clear-moodle-confirmation.3',attemptRef=secrets.token_hex(32),requestRef=secrets.token_hex(32),issuerEpoch='synthetic-B-exact-issuer',bindingScopeHash='d'*64)
result=subprocess.run(['docker','exec','-i','-u','www-data','clear-c-peer-web','php','/probe/moodle-integration/peer_fixture.php','--stdin'],input=json.dumps(request),text=True,capture_output=True,check=True)
receipt=json.loads(result.stdout);c=receipt['confirmation'];r=receipt['request']
p.check(all(c[k]==request[k] for k in ['attemptRef','requestRef','issuerEpoch','bindingScopeHash']),'exact input attempt/request/issuer/scope preserved in full confirmation')
p.check(c['version']=='clear-moodle-confirmation.3' and c['installationRef']=='synthetic-moodle' and c['courseRef']=='synthetic-course' and c['subjectRef']=='synthetic-subject' and c['audience']=='synthetic-clear','full confirmation registry scope')
wire,meta=p.wire(r);response=p.call(wire);dto=p.valid(response,meta,'Python native observation')
p.check(dto['observations']==[dict(targetRef='core-page-manual-mark',status='COMPLETE',observedAt=dto['observedAt'])],'browser completed Python Page is COMPLETE')
p.rejected(p.call(wire),'same envelope replay denied')
for label,patch in [('other student scope',{'bindingScopeHash':'e'*64}),('unrequested student selector',{'userId':999}),('unrequested course selector',{'courseId':999})]:
    p.rejected(p.call(p.wire(r|patch)[0]),label)
# Trusted owner corruption models a registry mapping to another native target.
# Both changes must fail even with a newly signed valid envelope. Restoration does not undo revocation.
for column,value in [('userid',1),('courseid',1)]:
    r=p.fresh()
    ref=r['confirmationRef']
    # ref is generated 64-hex by our own isolated CLI; never interpolate external inputs.
    assert len(ref)==64 and all(ch in '0123456789abcdef' for ch in ref)
    original=subprocess.check_output(['docker','exec','clear-c-peer-db','psql','-U','moodle','-d','moodle','-Atc',f"SELECT a.{column} FROM clear_probe.attempts a JOIN clear_probe.confirmations c ON a.attemptref=c.attemptref WHERE c.ref='{ref}'"],text=True).strip()
    assert original.isdecimal()
    p.sql(f"UPDATE clear_probe.attempts SET {column}={value} WHERE attemptref=(SELECT attemptref FROM clear_probe.confirmations WHERE ref='{ref}')")
    try: p.rejected(p.call(p.wire(r)[0]),'native registry other '+column+' denied')
    finally: p.sql(f"UPDATE clear_probe.attempts SET {column}={original} WHERE attemptref=(SELECT attemptref FROM clear_probe.confirmations WHERE ref='{ref}')")
print(json.dumps({'mode':'SYNTHETIC_ONLY','checks':len(p.checks),'passed':p.checks,'observation':dto},ensure_ascii=False))
