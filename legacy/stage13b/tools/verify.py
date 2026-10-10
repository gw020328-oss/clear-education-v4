"""Read-only 13B preservation/status audit; never reads environment or calls a network."""
import datetime, hashlib, json, os, pathlib, re, sys
stage=pathlib.Path(__file__).resolve().parents[1]
project=stage.parent
read=lambda p:json.loads((stage/p).read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
checks=[]
def require(value):
    if not value: raise AssertionError('CHECK_FAILED')
def check(name,fn):
    try: checks.append(dict(name=name,passed=True,detail=fn()))
    except Exception as e: checks.append(dict(name=name,passed=False,error=str(e)))
prior=read('artifacts/prior-files.json')['files']
run=read('RUN_RECORD.json')
plan=read('EXECUTION_PLAN.json')
lock=read('MODEL_LOCK.json')
transport=read('TRANSPORT_LOCK.json')
def preserve():
    changed=[p for p,h in prior.items() if not (project/p).is_file() or sha(project/p)!=h]
    require(not changed)
    return dict(checked=len(prior),changed=changed,stage12Files=sum(p.startswith('stage12/') for p in prior),stage13Files=sum(p.startswith('stage13/') for p in prior))
check('all-prior-files-byte-identical',preserve)
def no_other_new():
    extras=[]
    for here,dirs,names in os.walk(project):
        dirs[:]=[d for d in dirs if d not in ['.git','node_modules','stage13b']]
        for n in names:
            p=pathlib.Path(here)/n
            if p.is_file() and str(p.relative_to(project)) not in prior: extras.append(str(p.relative_to(project)))
    require(not extras)
    return dict(newFilesOutsideStage13b=extras)
check('only-stage13b-new-files',no_other_new)
def old_frozen():
    base=project/'stage12/protocol-v3'
    m=json.loads((base/'SHA256_MANIFEST.json').read_text())
    r=json.loads((base/'FREEZE_RECEIPT.json').read_text())
    require(sha(base/'SHA256_MANIFEST.json')==r['manifestSha256'])
    require(all(sha(project/'stage12'/p)==h for p,h in m['files'].items()))
    lines=(project/'stage13/checksums.sha256').read_text().splitlines()
    for line in lines:
        h,p=line.split('  ',1);require(sha(project/p)==h)
    return dict(stage12FrozenFiles=len(m['files']),stage13Checksums=len(lines))
check('original-stage12-and-stage13-hashes',old_frozen)
def prechecks():
    a=read('artifacts/precheck/stage13-verify.json');b=read('artifacts/precheck/stage12-scorer.json')
    require(a['passed']==14 and a['failed']==0 and a['total']==14)
    require(b['passed']==42 and b['failed']==0 and b['total']==42)
    lines=(stage/'artifacts/precheck/stage13-checksums.txt').read_text().splitlines()
    require(len(lines)==20 and all(x.endswith(': OK') for x in lines))
    commands=read('artifacts/precheck/commands.json')
    require(len(commands)==3 and all(x['exitCode']==0 and x['performedBeforeStage13bCreation'] for x in commands))
    return dict(stage13Verifier='14/14',checksums='20/20',stage12Scorer='42/42',notRerunAfterNewFolder=True)
check('original-prechecks-before-folder-creation',prechecks)
def auth_key():
    expected=dict(approved=True,provider='GOOGLE',route='GEMINI_API_FREE_TIER',model='gemini-3.8-flash',thinking_level='medium',api_key_environment_variable='GEMINI_API_KEY',allow_free_api=True,allow_paid_api=False,max_cost_usd=0,allow_model_download=False)
    require(read('artifacts/authorization.json')['authorization']==expected)
    require(all(x['authorization']==expected for x in [run,lock,transport]))
    k=read('artifacts/key-presence.json')
    require(k['GEMINI_API_KEY_present'] is False and not k['credentialFileSearchPerformed'] and not k['homeCredentialSearchPerformed'])
    require(run['finalVerdict']=='AWAITING_GEMINI_API_KEY')
    return dict(keyPresent=False,approvedFreeRoute=True,credentialSearch=False)
check('exact-approval-and-key-presence-gate',auth_key)
def frozen_plan():
    p=project/'stage12/protocol-v3/CALL_PLAN.json'
    original=json.loads(p.read_text())
    require(plan['calls']==original and plan['sourceCallPlanSha256']==sha(p) and len(original)==42)
    require(sum(x['split']=='dev' for x in original)==6 and sum(x['split']=='eval' for x in original)==36)
    require(plan['repeatSeedUse']=='IDENTIFIER_ONLY_NOT_SENT_TO_GEMINI')
    return dict(originalOrderAndRepeatIdentifiersPreserved=True,planned=42,dev=6,eval=36)
check('unchanged-original-42-call-plan',frozen_plan)
def transport_not_run():
    require(all(x['status']=='NOT_RUN' and x['reason']=='GEMINI_API_KEY_MISSING' for x in [transport,lock,plan,run]))
    require(transport['frozen'] is False and lock['locked'] is False and plan['executionPlanFrozen'] is False)
    require(transport['firstModelCallAt'] is None and transport['appliedTransport'] is None and plan['actuallyAppliedModelAndSettings'] is None)
    require(transport['transportCodeSha256'] is None and transport['geminiSchemaSha256'] is None and transport['schemaFixtureEquivalence']=='NOT_RUN')
    require(transport['originalSchemaSha256']==sha(project/'stage12/protocol-v3/schemas/output.schema.json'))
    return dict(firstModelCallOccurred=False,transportFreeze='NOT_RUN',schemaCompatibility='NOT_RUN',actualBCSettingsEquality='NOT_RUN')
check('no-fabricated-transport-schema-or-model-lock',transport_not_run)
def calls_absent():
    require(run['actualSmokeCalls']==0 and run['actualSemanticCalls']==0 and run['actualModelEndpointRequests']==0)
    require(run['plannedSemanticCalls']==42 and run['unstartedPlannedCalls']==42 and not run['requests'] and not run['rawResponses'])
    raw=[str(p.relative_to(stage)) for p in (stage/'raw').rglob('*') if p.is_file() and p.name!='README.md']
    require(not raw)
    require(run['actualRetries']==0 and run['actualJsonRepairs']==0 and run['manualCorrections']==0 and run['replayResponses']==0 and run['codexResponsesUsedAsEvaluationData']==0)
    return dict(planned=42,actual=0,unstarted=42,smoke=0,retries=0,repair=0,rawModelResponseFiles=raw,reason='Stopped before authentication; not a partial run')
check('call-count-gap-and-no-retry-repair-replay',calls_absent)
def free_unknown():
    require(run['freeTier']['status']=='NOT_RUN' and run['freeTier']['confirmed'] is None)
    require(all(run['quota'][k]=='UNKNOWN' for k in ['RPM','TPM','RPD']))
    require(run['actualCostUSD']==0 and run['actualModelDownloadGB']==0 and run['usage'] is None and run['paidUsageDetected'] is None)
    return dict(apiChargeUSD=0,basis='No API request',freeTierConfirmed='NOT_RUN',RPM='UNKNOWN',TPM='UNKNOWN',RPD='UNKNOWN')
check('no-paid-requests-and-no-invented-free-quota',free_unknown)
def results_absent():
    require(run['actualUsedModel'] is None and run['latency'] is None)
    require(run['metrics']['B'] is None and run['metrics']['C'] is None and run['metrics']['status']=='NOT_RUN')
    require(all(x['status']=='NOT_RUN' for x in run['stages']))
    return 'No relative performance or qualitative error conclusions without model data'
check('not-run-metrics-and-verdict-consistent',results_absent)
def secrets():
    patterns=[('google_key_pattern',re.compile(r'\bAIza[0-9A-Za-z_-]{20,}\b')),('auth_header_value',re.compile(r'(?i)"(?:x-goog-api-key|authorization)"\s*:\s*"[^"]+"'))]
    hits=[];count=0
    for p in stage.rglob('*'):
        if not p.is_file():continue
        count+=1;text=p.read_text(errors='replace')
        for name,pat in patterns:
            if pat.search(text):hits.append(dict(file=str(p.relative_to(stage)),pattern=name))
    require(not hits)
    return dict(filesScanned=count,recognizableSecretMatches=hits,keyAcquisition='Boolean only; absent key never acquired',scope='Limited recognizable patterns plus no-key/no-request execution path; not a proof against arbitrary encodings')
check('no-recorded-key-or-auth-header-values',secrets)
def required_outputs():
    names=['README.md','AUTHORIZATION.md','PREFLIGHT.md','TRANSPORT_ADDENDUM.md','TRANSPORT_LOCK.json','SCHEMA_COMPATIBILITY.md','MODEL_LOCK.json','EXECUTION_PLAN.json','RUN_RECORD.json','RESULTS.md','ERROR_AUDIT.md','DECISION.md','artifacts/prior-files.json']
    require(all((stage/p).is_file() and (stage/p).stat().st_size>0 for p in names))
    return dict(nonemptyRequiredDocuments=len(names))
check('required-documents-with-explicit-not-run',required_outputs)
if '--with-checksums' in sys.argv:
    def checksum():
        p=stage/'checksums.sha256'
        entries=[line.split('  ',1) for line in p.read_text().splitlines() if line]
        require(all(sha(project/f)==h for h,f in entries))
        actual={str(f.relative_to(project)) for f in stage.rglob('*') if f.is_file() and f!=p}
        require({f for h,f in entries}==actual and len(entries)==len(actual))
        return dict(matchedFiles=len(entries),excludesSelf=True)
    check('new-checksum-integrity-and-coverage',checksum)
result=dict(kind='STAGE13B_READ_ONLY_PRESERVATION_AND_NOT_RUN_AUDIT',at=datetime.datetime.now(datetime.timezone.utc).isoformat(),passed=sum(c['passed'] for c in checks),failed=sum(not c['passed'] for c in checks),total=len(checks),checks=checks)
print(json.dumps(result,ensure_ascii=False,indent=2));sys.exit(bool(result['failed']))
