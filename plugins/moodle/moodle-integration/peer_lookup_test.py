import json,secrets,subprocess
r=dict(version='clear-moodle-confirmation.3',attemptRef=secrets.token_hex(32),requestRef=secrets.token_hex(32),issuerEpoch='synthetic-B-lookup-issuer',bindingScopeHash='c'*64)
f=subprocess.run(['docker','exec','-i','-u','www-data','clear-c-peer-web','php','/probe/moodle-integration/peer_fixture.php','--stdin'],input=json.dumps(r),capture_output=True,text=True,check=True)
c=json.loads(f.stdout)['confirmation']
def state():
    return subprocess.check_output(['docker','exec','clear-c-peer-db','psql','-U','moodle','-d','moodle','-Atc',"SELECT count(*)::text||':'||(SELECT md5(string_agg(id::text||':'||userid||':'||sessdata,',' ORDER BY id)) FROM mdl_sessions) FROM clear_probe.confirmations"],text=True).strip()
before=state();outputs=[]
for i in range(2):
    r['requestRef']=secrets.token_hex(32)
    result=subprocess.run(['docker','exec','-i','-u','www-data','clear-c-peer-web','curl','-fsS','-H','Content-Type: application/json','--data-binary','@-','http://127.0.0.1:18767/lookup'],input=json.dumps({'request':r}),capture_output=True,text=True,check=True)
    value=json.loads(result.stdout);assert value['ok'] is True;v=value['result']
    assert v['requestRef']==r['requestRef']
    for k in ['attemptRef','confirmationRef','confirmedAt','expiresAtExclusive','moodleSessionGeneration','enrolmentRevision','bindingScopeHash','issuerEpoch']: assert v[k]==c[k], k
    assert v['checkedAt']>=c['checkedAt'] and v['observedAt']>=c['observedAt']
    outputs.append({k:v[k] for k in ['requestRef','observedAt','checkedAt','expiresAtExclusive']})
assert state()==before
print(json.dumps({'checks':3,'same_attempt_two_fresh_requestRefs':True,'persistent_sessions_and_confirmation_count_unchanged':True,'fresh_native_times':outputs}))
