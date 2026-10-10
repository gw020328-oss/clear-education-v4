"""Read-only Stage13 authorization/preservation audit. No network, subprocess or writes."""
import datetime, hashlib, json, os, pathlib, sys

stage = pathlib.Path(__file__).resolve().parents[1]
project = stage.parent
def read(relative):
    return json.loads((stage / relative).read_text())
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def require(condition):
    if not condition:
        raise AssertionError('Check failed')
checks = []
def check(name, fn):
    try:
        detail = fn()
        checks.append(dict(name=name, passed=True, detail=detail))
    except Exception as error:
        checks.append(dict(name=name, passed=False, error=str(error)))

baseline = read('artifacts/prior-files.json')
def preservation():
    changed = [p for p, h in baseline['files'].items() if not (project/p).is_file() or digest(project/p) != h]
    require(not changed)
    return dict(protectedFiles=len(baseline['files']), stage12Files=sum(p.startswith('stage12/') for p in baseline['files']), changedFiles=changed)
check('all-prior-files-byte-preserved', preservation)
def new_files():
    extra = []
    for here, dirs, names in os.walk(project):
        dirs[:] = [d for d in dirs if d not in ['.git', 'node_modules', 'stage13']]
        for name in names:
            p = pathlib.Path(here)/name
            if p.is_file() and str(p.relative_to(project)) not in baseline['files']:
                extra.append(str(p.relative_to(project)))
    require(not extra)
    return dict(addedOutsideStage13=extra)
check('only-stage13-new-files', new_files)
def frozen():
    root = project/'stage12/protocol-v3'
    manifest = json.loads((root/'SHA256_MANIFEST.json').read_text())
    receipt = json.loads((root/'FREEZE_RECEIPT.json').read_text())
    require(digest(root/'SHA256_MANIFEST.json') == receipt['manifestSha256'])
    require(all(digest(project/'stage12'/p) == h for p,h in manifest['files'].items()))
    require(receipt['semanticOutputsAtFreeze'] == 0)
    return dict(frozenFileCount=len(manifest['files']), manifestSha256=receipt['manifestSha256'])
check('stage12-original-manifest-and-receipt', frozen)
def prechecks():
    commands = read('artifacts/precheck/commands.json')
    a,b,c,d = [read('artifacts/precheck/'+n+'.json') for n in ['scorer','frozen','plan','final_checks']]
    require(len(commands)==4 and all(x['exitCode']==0 and x['performedBeforeStage13Creation'] for x in commands))
    require(a['passed']==42 and a['failed']==0 and a['total']==42)
    require(b['passed']==74 and b['failed']==0 and b['total']==74 and all(x['pass'] for x in b['checks']))
    require(c['plannedCalls']==42 and c['semanticCallsExecuted']==0)
    require(d['protectedFilesChecked']==527 and not d['changedPriorFiles'] and not d['actualProductModelResponses'])
    return dict(scorer='42/42', originalFrozenAudit='74/74', plannedCalls=42, originalProtectedFiles=527)
check('requested-four-prechecks-passed', prechecks)
auth = dict(route='NONE',model='NONE',max_cost_usd=0,max_download_gb=0,allow_paid_api=False,allow_local_download=False)
lock, plan, run = [read(p) for p in ['MODEL_LOCK.json','EXECUTION_PLAN.json','RUN_RECORD.json']]
def authorization():
    require(read('artifacts/authorization.json')['authorization']==auth)
    require(all(x['authorization']==auth for x in [lock,plan,run]))
    require(all(x['status']=='NOT_RUN' and x['reason']=='MODEL_AUTHORIZATION_ROUTE_NONE_AND_MODEL_NONE' for x in [lock,plan,run]))
    require(run['finalVerdict']=='AWAITING_MODEL_AUTHORIZATION')
    return dict(verdict=run['finalVerdict'], route=auth['route'], model=auth['model'])
check('exact-user-authorization-and-not-run-verdict', authorization)
def unchanged_plan():
    original = json.loads((project/'stage12/protocol-v3/CALL_PLAN.json').read_text())
    config = json.loads((project/'stage12/protocol-v3/RUN_CONFIG.json').read_text())
    require(plan['calls']==original and len(original)==42)
    require(sum(c['split']=='dev' for c in original)==6 and sum(c['split']=='eval' for c in original)==36)
    require(all(config[k]==v for k,v in plan['settings'].items()))
    require(lock['generationSettings']['frozenRequiredValues']==plan['settings'])
    require(plan['sourceCallPlanSha256']==digest(project/'stage12/protocol-v3/CALL_PLAN.json'))
    return dict(planned=42, authorized=plan['authorizedCallCount'], dev=6, evaluation=36, seeds=config['seeds'])
check('frozen-plan-order-seeds-and-settings-unchanged', unchanged_plan)
def not_locked():
    require(lock['locked'] is False and lock['executionStartedAt'] is None)
    require(lock['modelId']=='NONE' and lock['localModelDigest'] is None and lock['returnedModelIdentifier'] is None)
    require(lock['transport']['path'] is None and lock['transport']['sha256'] is None and lock['runner']['usedRunnerSha256'] is None)
    require(lock['runner']['referenceStage12Sha256']==digest(project/lock['runner']['referenceStage12Path']))
    return 'No fabricated provider lock, transport implementation, or runtime identifier'
check('model-lock-is-explicitly-not-created', not_locked)
def no_calls():
    require(not run['calls'] and not run['rawResponses'])
    require(run['actualSemanticCalls']==0 and run['actualNeutralSmokeCalls']==0 and run['actualEndpointRequests']==0)
    require(run['plannedSemanticCalls']==42 and run['unstartedPlannedCalls']==42 and run['authorizedSemanticCalls']==0)
    require(run['semanticRunStartedAt'] is None and run['semanticRunEndedAt'] is None)
    require(all(x['status']=='NOT_RUN' for x in run['stages']))
    return dict(plannedCalls=42, actualCalls=0, authorizedCalls=0, unstarted=42, reason='Authorization gate before any run')
check('planned-versus-actual-calls-explained', no_calls)
def no_raw():
    raw = [str(p.relative_to(stage)) for p in (stage/'raw').rglob('*') if p.is_file() and p.name!='README.md']
    old = project/'stage12/artifacts/model-runs'
    old_files = [str(p.relative_to(project)) for p in old.rglob('*') if p.is_file()] if old.exists() else []
    require(not raw and not old_files)
    return dict(stage13RawModelResponses=len(raw), stage12ModelRunFiles=len(old_files))
check('no-model-responses-or-replayed-results', no_raw)
def no_repair():
    require(all(run[k]==0 for k in ['retries','repairs','manualCorrections','modelResponseReplayCount','codexRepliesUsedAsEvaluationData','actualCostUSD','actualDownloadGB']))
    require(run['tokens']['input'] is None and run['tokens']['output'] is None and run['latency'] is None)
    require(run['bcConditions']['actuallyAppliedSameModelAndSettings'] is None)
    return dict(retries=0, repair=0, costUSD=0, downloadGB=0, actualSettingsEquality='NOT_RUN')
check('no-retry-repair-cost-or-fabricated-measurement', no_repair)
def no_scores():
    require(run['metrics']['B'] is None and run['metrics']['C'] is None and run['metrics']['pairedDifferences'] is None and run['metrics']['status']=='NOT_RUN')
    require('NOT_RUN' in (stage/'ERROR_AUDIT.md').read_text())
    return 'No zero-denominator accuracy, safety or paired-case conclusion'
check('performance-and-qualitative-audit-not-run', no_scores)
def outputs():
    required=['README.md','AUTHORIZATION_STATUS.md','PREFLIGHT.md','MODEL_LOCK.json','EXECUTION_PLAN.json','RUN_RECORD.json','RESULTS.md','ERROR_AUDIT.md','DECISION.md']
    require(all((stage/p).is_file() and (stage/p).stat().st_size>0 for p in required))
    return dict(requiredDocuments=len(required))
check('required-status-documents-present', outputs)
def local_metadata():
    m = read('artifacts/model-availability.json')
    require(m['inferenceCalls']==0 and m['networkEndpointCalls']==0)
    require(len(m['candidates'])==3 and all(c['matchesStage12Digest'] for c in m['candidates']))
    return dict(localManifests=3, runtimeAccessTested=False)
check('candidate-presence-not-inference-access', local_metadata)

if '--with-checksums' in sys.argv:
    def checksums():
        checksum = stage/'checksums.sha256'
        entries = [line.split('  ',1) for line in checksum.read_text().splitlines() if line]
        require(all(digest(project/p)==h for h,p in entries))
        actual = {str(p.relative_to(project)) for p in stage.rglob('*') if p.is_file() and p!=checksum}
        require({p for h,p in entries}==actual and len(entries)==len(actual))
        return dict(matchedFiles=len(entries), checksumFileExcludedFromItself=True)
    check('stage13-checksums-and-complete-coverage', checksums)

result = dict(kind='STAGE13_READ_ONLY_FINAL_VERIFICATION_NOT_BENCHMARK',at=datetime.datetime.now(datetime.timezone.utc).isoformat(),passed=sum(c['passed'] for c in checks),failed=sum(not c['passed'] for c in checks),total=len(checks),checks=checks)
print(json.dumps(result,ensure_ascii=False,indent=2))
sys.exit(bool(result['failed']))
