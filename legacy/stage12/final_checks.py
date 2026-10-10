"""Read-only final preservation and limited secret-pattern inspection; no values printed."""
import datetime,hashlib,json,pathlib,re
stage=pathlib.Path(__file__).resolve().parent; project=stage.parent
before=json.loads((stage/'artifacts/precheck/prior-files.json').read_text())['files']
changed=[p for p,h in before.items() if not (project/p).is_file() or hashlib.sha256((project/p).read_bytes()).hexdigest()!=h]
patterns={
 'pem_private_key':re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
 'assigned_wallet_private_key':re.compile(r'"privateKey"\s*:\s*"(?:0x)?[0-9a-fA-F]{64}"'),
 'assigned_wallet_mnemonic':re.compile(r'"mnemonic"\s*:\s*"[a-z]+(?: [a-z]+){11,23}"'),
 'api_secret_token':re.compile(r'\bsk-[A-Za-z0-9_-]{24,}\b'),
}
files=[p for p in stage.rglob('*') if p.is_file()];hits=[]
for p in files:
 text=p.read_text(errors='replace')
 for name,pat in patterns.items():
  if pat.search(text):hits.append({'path':str(p.relative_to(stage)),'pattern':name})
out={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'protectedFilesChecked':len(before),'changedPriorFiles':changed,'stage12FilesScanned':len(files),'secretPatternMatches':hits,'secretCheckScope':'Limited recognizable text patterns, not proof against arbitrary encoded secrets; no secret values emitted','actualHumanParticipants':0,'actualProductModelResponses':list(str(p.relative_to(stage)) for p in (stage/'artifacts/model-runs').glob('**/smoke.json'))+list(str(p.relative_to(stage)) for p in (stage/'artifacts/model-runs').glob('**/[0-9][0-9][0-9].json'))}
print(json.dumps(out,ensure_ascii=False,indent=2));raise SystemExit(bool(changed or hits))
