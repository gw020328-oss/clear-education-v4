import json,pathlib
P=pathlib.Path(__file__).resolve().parent/'protocol-v3'
def obj(props):return dict(type='object',properties=props,required=list(props),additionalProperties=False)
def arr(items,**more):return dict(type='array',items=items,**more)
def enum(*v):return dict(type='string',enum=list(v))
S=dict(type='string',minLength=1,maxLength=2000)
nullable=lambda s:dict(anyOf=[dict(type='null'),s])
integer=dict(type='string',pattern=r'^(0|[1-9][0-9]*)$')
decimal=dict(type='string',pattern=r'^(0|[1-9][0-9]*)(\.[0-9]+)?$')
quantity=obj(dict(units=decimal,unit=S))
ratio=obj(dict(numerator=integer,denominator=dict(type='string',pattern=r'^[1-9][0-9]*$')))
amount=obj(dict(fixedAmount=nullable(quantity),rate=nullable(ratio),multiplier=nullable(ratio),unit=nullable(S),base=S,cap=nullable(quantity),deductionOrder=arr(S,uniqueItems=True)))
period=obj(dict(kind=enum('RELATIVE','ABSOLUTE'),value=S,unit=S,operator=S,base=S,timeZone=nullable(S)))
names=['amount','asset','activities','completionPeriod','claimPeriod','evidenceType','approvalRole','exceptions','recipient','applicabilityPeriod']
spans=arr(S,uniqueItems=True,minItems=1)
missing=dict(anyOf=[dict(type='null'),enum('','NOT_STATED','not stated','not specified','none specified','(no value)','미기재','미명시'),arr(S,maxItems=0)])
def field(value):
 return dict(anyOf=[obj(dict(status=enum('EXTRACTED','AMBIGUOUS'),value=value,spanIds=spans)),obj(dict(status=enum('NOT_STATED'),value=missing,spanIds=arr(S,maxItems=0)))])
f={n:field(amount if n=='amount' else period if n.endswith('Period') else arr(S,uniqueItems=True) if n in ['activities','exceptions'] else S) for n in names}
issue=enum('MISSING_YEAR','MISSING_COURSE_THRESHOLD','CURRENT_OBLIGOR','REFUND_FORM_AND_AMOUNT')
schema=obj(dict(classification=enum('POLICY_SUPPORTED','POLICY_UNSUPPORTED','CLARIFICATION_REQUIRED'),fields=obj(f),ambiguities=arr(obj(dict(field=enum(*names),code=issue,spanIds=spans)),uniqueItems=True),clarificationQuestions=arr(obj(dict(field=enum(*names),code=issue,text=S)),uniqueItems=True),unsupportedConditions=arr(enum('GENERAL_CANCELLATION','DISCRETIONARY_EXCEPTION','SELF_COMMITMENT'),uniqueItems=True)))
schema={'$schema':'http://json-schema.org/draft-07/schema#','title':'PolicyProposal v3.2 (no execution authority)',**schema}
out={'schemas/output.schema.json':json.dumps(schema,ensure_ascii=False,indent=2)+'\n'}
print('*** Begin Patch')
for p,c in out.items():
 if (P/p).exists():
  print('*** Update File: '+str(P/p));print('@@');print('-'+(P/p).read_text().rstrip().replace('\n','\n-'));print('+'+c.rstrip().replace('\n','\n+'))
 else: print('*** Add File: '+str(P/p));print('+'+c.rstrip().replace('\n','\n+'))
print('*** End Patch')
