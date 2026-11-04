#!/usr/bin/env python3
"""Actual loopback HTTP against C's disposable Moodle. No B harness code is modified."""
import base64, concurrent.futures, hashlib, hmac, json, secrets, struct, subprocess, time, urllib.request, urllib.error
HOST='http://127.0.0.1:18767'
KEY=bytes([17])*32
FIELDS='version kind keyRef sender receiver audience deploymentEpoch method path requestRef contextRef sourceHash proposalHash bodyHash issuedAt expiresAtExclusive requestHash status'.split()
ZERO='0'*64
checks=[]
def check(value,name):
    assert value, name
    checks.append(name)
    print('PASS',name,flush=True)
def canonical(value): return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
def signing(meta):
    result=b'CLEAR\0PREVIEW\0PEER\0HMAC-SHA256\0V1\0'
    for field in FIELDS:
        value=str(meta[field]).encode('ascii');result+=struct.pack('>I',len(value))+value
    return result
def wire(body,changes=None):
    now=int(time.time());body=canonical(body)
    meta=dict(version='clear-preview-peer.1',kind='REQUEST',keyRef='synthetic-key',sender='B',receiver='C',audience='synthetic-C-observations',deploymentEpoch='epoch-1',method='POST',path='/observations',requestRef=secrets.token_hex(32),contextRef='self-context',sourceHash='2'*64,proposalHash='3'*64,bodyHash=hashlib.sha256(body).hexdigest(),issuedAt=now,expiresAtExclusive=now+5,requestHash=ZERO,status=0)
    meta.update(changes or {})
    return canonical(dict(body=base64.b64encode(body).decode(),meta=meta,mac=hmac.new(KEY,signing(meta),hashlib.sha256).hexdigest())),meta
def call(data,path='/observations',method='POST',headers=None):
    request=urllib.request.Request(HOST+path,data=data,method=method,headers=headers or {'Content-Type':'application/json'})
    try: response=urllib.request.urlopen(request,timeout=15)
    except urllib.error.HTTPError as e: response=e
    return response.status,dict(response.headers),response.read()
def fresh():
    result=subprocess.run(['docker','exec','-u','www-data','clear-c-peer-web','php','/probe/moodle-integration/peer_fixture.php'],check=True,capture_output=True,text=True)
    return json.loads(result.stdout)['request']
def sql(statement):
    subprocess.run(['docker','exec','clear-c-peer-db','psql','-U','moodle','-d','moodle','-v','ON_ERROR_STOP=1','-c',statement],check=True,stdout=subprocess.DEVNULL)
def rejected(result,name):
    status,headers,body=result
    check(status==403 and body==b'{"code":"REJECTED"}' and not any(k.lower()=='set-cookie' for k in headers),name)
def valid(result,meta,name):
    status,headers,body=result
    check(status==200 and headers.get('Content-Type')=='application/json' and not any(k.lower()=='set-cookie' for k in headers),name+' HTTP')
    value=json.loads(body);m=value['meta'];payload=base64.b64decode(value['body'])
    check(canonical(value)==body and hmac.compare_digest(value['mac'],hmac.new(KEY,signing(m),hashlib.sha256).hexdigest()) and hashlib.sha256(payload).hexdigest()==m['bodyHash'],name+' canonical signed bytes')
    check(m['requestHash']==hashlib.sha256(signing(meta)).hexdigest() and all(m[k]==meta[k] for k in ['requestRef','contextRef','sourceHash','proposalHash','deploymentEpoch']) and m['sender']=='C' and m['receiver']=='B' and m['expiresAtExclusive']<=meta['expiresAtExclusive'] and int(time.time())<m['expiresAtExclusive'],name+' correlation and exclusive expiry')
    dto=json.loads(payload)
    check(dto['version']=='clear-moodle-observations.3' and dto['sourceStatus']=='OBSERVED_AT' and dto['observations'][0]['status'] in ['INCOMPLETE','COMPLETE'] and dto['checkedAt']-dto['observedAt']<=5,name+' full native .3 DTO')
    return dto
if __name__=='__main__':
    request=fresh()
    for name,changes in [('zero proposal with valid MAC',{'proposalHash':ZERO}),('wrong epoch',{'deploymentEpoch':'other'}),('wrong audience',{'audience':'other'}),('wrong sender',{'sender':'other'}),('wrong keyRef',{'keyRef':'other'}),('expired envelope',{'issuedAt':int(time.time())-6,'expiresAtExclusive':int(time.time())-1})]:
        data,_=wire(request,changes);rejected(call(data),name)
    for name,change in [('scope mismatch',{'bindingScopeHash':'a'*64}),('issuer mismatch',{'issuerEpoch':'other'}),('confirmation mismatch',{'confirmationRef':'other'}),('extra field',{'userId':999})]:
        data,_=wire(request|change);rejected(call(data),name)
    data,meta=wire(request)
    rejected(call(data,path='/observations?scope=other'),'query route rejected')
    rejected(call(data,path='/local/clearbridge/observations.php'),'direct PHP alias rejected')
    rejected(call(data,method='GET'),'GET rejected')
    rejected(call(data,headers={'Content-Type':'text/plain'}),'wrong media rejected')
    rejected(call(data,headers={'Content-Type':'application/json','Content-Encoding':'gzip'}),'encoding rejected')
    data,meta=wire(request)
    valid(call(data),meta,'native observation')
    rejected(call(data),'persistent replay rejected')
    data,meta=wire(request)
    with concurrent.futures.ThreadPoolExecutor(2) as pool: results=list(pool.map(lambda _:call(data),range(2)))
    check(sorted(x[0] for x in results)==[200,403],'concurrent duplicate exactly one success')
    valid(next(x for x in results if x[0]==200),meta,'concurrent winner')
    target=json.loads(subprocess.check_output(['docker','exec','clear-c-peer-web','cat','/tmp/clear-target.json']))
    uid=int(target['user']);course=int(target['course'])
    # Each trusted-owner mutation invalidates authority. Restoration never revives the old receipt.
    request=fresh();sql(f'UPDATE mdl_user_enrolments SET status=1 WHERE userid={uid}')
    try: rejected(call(wire(request)[0]),'withdrawn enrolment rejected')
    finally: sql(f'UPDATE mdl_user_enrolments SET status=0 WHERE userid={uid}')
    rejected(call(wire(request)[0]),'restored enrolment cannot revive old confirmation')
    request=fresh();sql(f"INSERT INTO mdl_role_assignments(roleid,contextid,userid,timemodified,modifierid,component,itemid,sortorder) SELECT r.id,c.id,{uid},0,0,'',0,0 FROM mdl_role r,mdl_context c WHERE r.shortname='editingteacher' AND c.contextlevel=50 AND c.instanceid={course}")
    try: rejected(call(wire(request)[0]),'privileged role bypass rejected')
    finally: sql(f"DELETE FROM mdl_role_assignments WHERE userid={uid} AND roleid=(SELECT id FROM mdl_role WHERE shortname='editingteacher')")
    rejected(call(wire(request)[0]),'role restoration cannot revive old confirmation')
    request=fresh();data,meta=wire(request);valid(call(data),meta,'new confirmation after restored gates')
    print(json.dumps({'mode':'SYNTHETIC_ONLY','checks':len(checks),'passed':checks},ensure_ascii=False))
