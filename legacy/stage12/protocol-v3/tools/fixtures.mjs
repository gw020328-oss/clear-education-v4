// SYNTHETIC scorer specifications, authored before score.mjs. Not public cases or model output.
export const fieldNames=['amount','asset','activities','completionPeriod','claimPeriod','evidenceType','approvalRole','exceptions','recipient','applicabilityPeriod'];
export const missing=()=>({status:'NOT_STATED',value:null,spanIds:[]});
const e=(value,...spanIds)=>({status:'EXTRACTED',value,spanIds});
export const source={sourceId:'SYNTHETIC',spans:['A','B','T','R'].map(id=>({id,text:'Synthetic '+id}))};
export const baseline={classification:'POLICY_SUPPORTED',fields:{
 amount:e({fixedAmount:{units:'100.50',unit:'USD'},rate:{numerator:'22',denominator:'100'},multiplier:{numerator:'2',denominator:'1'},unit:'USD',base:'paid_tuition',cap:{units:'150.50',unit:'USD'},deductionOrder:['SUBTRACT_FEE','APPLY_RATE','APPLY_MULTIPLIER','APPLY_CAP']},'A','B'),
 asset:missing(),activities:e(['complete_assigned_work'],'T'),completionPeriod:missing(),claimPeriod:e({kind:'RELATIVE',value:'30',unit:'day',operator:'WITHIN',base:'completion',timeZone:null},'T'),evidenceType:missing(),approvalRole:missing(),exceptions:e(['material_fee'],'B'),recipient:e('payer','R'),applicabilityPeriod:missing()},ambiguities:[],clarificationQuestions:[],unsupportedConditions:[]};
export const reference={...structuredClone(baseline),questionRequirements:[]};
const tests=[];
function add(id,edit,expected=true,refEdit=()=>{}){const output=structuredClone(baseline),ref=structuredClone(reference);edit(output);refEdit(ref);tests.push({id,output,reference:ref,source,expected:{completeCorrect:expected,formatValid:true,majorError:!expected}});}
add('normal-complete',()=>{});
add('numeric-exact-not-substring',x=>x.fields.amount.value.fixedAmount.units='10.50',false);
add('22-percent-not-2x',x=>x.fields.amount.value.rate={numerator:'2',denominator:'1'},false);
add('multiplier-not-rate',x=>x.fields.amount.value.multiplier={numerator:'22',denominator:'100'},false);
add('decimal-place',x=>x.fields.amount.value.fixedAmount.units='10050',false);
add('unit-mismatch',x=>x.fields.amount.value.fixedAmount.unit='KRW',false);
add('deduction-order',x=>x.fields.amount.value.deductionOrder.reverse(),false);
add('cap-required',x=>x.fields.amount.value.cap=null,false);
add('partial-required-citation',x=>x.fields.amount.spanIds=['A'],false);
add('all-required-citations',x=>x.fields.amount.spanIds=['B','A']);
add('existing-wrong-field-span',x=>x.fields.amount.spanIds=['A','T'],false);
add('fake-span',x=>x.fields.amount.spanIds=['A','MADE_UP'],false);
add('missing-normalization-text',x=>x.fields.asset.value='not specified');
add('missing-normalization-array',x=>x.fields.asset.value=[]);
add('missing-false-certainty',x=>x.fields.asset=e('USD','A'),false);
add('decimal-equivalence',x=>{x.fields.amount.value.fixedAmount.units='100.500';x.fields.amount.value.cap.units='150.5000';});
add('rational-equivalence',x=>{x.fields.amount.value.rate={numerator:'11',denominator:'50'};x.fields.amount.value.multiplier={numerator:'4',denominator:'2'};});
add('limited-whitespace-case',x=>x.fields.amount.value.fixedAmount.unit=' usd ');
add('deadline-change',x=>x.fields.claimPeriod.value.value='301',false);
add('wrong-classification',x=>x.classification='CLARIFICATION_REQUIRED',false);
add('missing-known-field',x=>x.fields.recipient=missing(),false);
add('extra-unsupported-reason',x=>x.unsupportedConditions=['GENERAL_CANCELLATION'],false);
const clarify=x=>{x.classification='CLARIFICATION_REQUIRED';x.fields.approvalRole={status:'AMBIGUOUS',value:'current_obligor_unresolved',spanIds:['R']};x.ambiguities=[{field:'approvalRole',code:'CURRENT_OBLIGOR',spanIds:['R']}];x.clarificationQuestions=[{field:'approvalRole',code:'CURRENT_OBLIGOR',text:'Which entity is responsible for the refund?'}];};
const clarifyRef=x=>{clarify(x);x.questionRequirements=[{field:'approvalRole',code:'CURRENT_OBLIGOR'}];};
add('proper-abstention',clarify,true,clarifyRef);
add('missing-question',x=>{clarify(x);x.clarificationQuestions=[];},false,clarifyRef);
add('irrelevant-question',x=>{clarify(x);x.clarificationQuestions[0].text='What color is the moon?';},false,clarifyRef);
add('unsupported-complete',x=>{x.classification='POLICY_UNSUPPORTED';x.unsupportedConditions=['GENERAL_CANCELLATION'];},true,x=>{x.classification='POLICY_UNSUPPORTED';x.unsupportedConditions=['GENERAL_CANCELLATION'];});
function invalid(id,edit){add(id,edit,false);tests.at(-1).expected.formatValid=false;}
invalid('authority-field-root',x=>x.runtimeExecutable=true);
invalid('authority-field-nested',x=>x.fields.amount.value.reserveStatus='FUNDED');
invalid('missing-field-format',x=>delete x.fields.asset);
invalid('noncanonical-missing-assertion',x=>x.fields.asset.value='USD');
invalid('duplicate-span-format',x=>x.fields.amount.spanIds=['A','A']);
invalid('empty-question-format',x=>{clarify(x);x.clarificationQuestions[0].text='';});
invalid('wrong-numeric-type',x=>x.fields.amount.value.rate.numerator=22);
invalid('zero-denominator',x=>x.fields.amount.value.rate.denominator='0');
invalid('deep-unrecognized-object',x=>x.fields.recipient.value={a:{a:{a:{a:'payer'}}}});
export {tests};
export const aggregateExpectations=[
 {id:'all-blocked-is-not-advantage',expected:false},
 {id:'tie-is-not-advantage',expected:false},
 {id:'repeat-counts-as-one-source',expected:1},
 {id:'three-classes-and-strict-improvement',expected:true},
 {id:'format-under-90-fails',expected:false},
 {id:'fake-span-even-with-lower-errors-fails',expected:false},
 {id:'normal-pass-regression-fails',expected:false},
];
