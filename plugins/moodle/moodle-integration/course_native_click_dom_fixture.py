from pathlib import Path
import re,json,sys
# Build an offline, synthetic-only fixture using the deployed AMD and pinned panel.
# Serve on an isolated loopback port and use a real browser click (not element.click()).
repo=Path(__file__).resolve().parents[3];target=Path(sys.argv[1]);out=target.parent;out.mkdir(exist_ok=True)
template=(repo/'plugins/moodle/local_clearbridge/templates/course_refund.mustache').read_text()
messages=''.join(f'<span data-workflow-message="{k}">{k}</span>' for k in re.findall(r'data-workflow-message="([^"]+)"',template))
head='''<!doctype html><meta charset="utf-8"><title>Offline Moodle click regression</title><div id="root"><button data-workflow-action="read-session">Read synthetic session</button><input id="ack" type="checkbox" data-workflow-ack><div data-workflow-status></div><div data-native-panel-status></div><div data-native-activity-status></div><div data-native-condition-cards></div>'''+messages+'</div><button id="return">Simulate return</button><button id="destroy">Destroy mount</button><pre id="result"></pre>'
scripts=[]
for name in ['course_native_panels','course_native_workflow']:
 src=(repo/f'plugins/moodle/local_clearbridge/amd/build/{name}.min.js').read_text()
 scripts.append('window.define=(_,factory)=>window.'+name+'=factory();\n'+src)
scripts.append('''
const actions=[], events=[];
const root=document.querySelector('#root'), cardRoot=root.querySelector('[data-native-condition-cards]');
const write=()=>document.querySelector('#result').textContent=JSON.stringify({actions,events});
const rows=['activity-complete','assignment-submitted','reflection-topics','python-basic-certificate'].map(criterionId=>({criterionId,state:'MISSING',current:false,evidenceId:null,evidenceRevision:null}));
const ui=course_native_workflow.create({root,role:'participant',panels:course_native_panels,courseId:2,origin:location.origin,newKey:()=> 'synthetic-key',invoke:async input=>{
 actions.push(input);write();
 if(input.action==='read-session')return {version:'clear-bootcamp-normal-session.1',role:'PARTICIPANT',applicationId:'app-one',conditionTargets:{version:'clear-student-condition-targets.1',applicationId:'app-one',courseId:2,moodleOrigin:location.origin,targets:[{criterionId:'activity-complete',module:'page',cmId:3,instanceId:1},{criterionId:'assignment-submitted',module:'assign',cmId:4,instanceId:1},{criterionId:'reflection-topics',module:'forum',cmId:5,instanceId:3}]}};
 if(input.action==='read-application')return {version:'clear-bootcamp-normal-view.1',displayOnly:true,applicationId:'app-one',role:'PARTICIPANT',target:{expectedRevision:2},agreedPayment:{},decision:{id:'decision-one',hash:'hash-one',revision:2,current:true},criteria:rows};
 if(input.action==='decision-evidence')return {version:'clear-bootcamp-decision-evidence.1',applicationId:'app-one',role:'PARTICIPANT',currentDecision:{decisionId:'decision-one',applicationActive:true,matchesRequestedDecision:true},manifest:{version:'clear-bootcamp-evidence-manifest.1',applicationId:'app-one',decision:{decisionId:'decision-one',decisionHash:'hash-one',decisionRevision:2},criteria:rows},availability:rows.map(r=>({criterionId:r.criterionId,evidenceId:null,status:'MISSING'}))};
 if(input.action==='refresh-activity')return {status:'QUEUED',operationId:'op-one'};
 throw Error('UNEXPECTED_WRITE');
}});
root.addEventListener('click',e=>{const a=e.target.closest('a.crc-go');if(a){events.push({phase:'capture',connected:cardRoot.contains(a),href:a.getAttribute('href')});write();}},true);
root.addEventListener('click',e=>{const a=e.target.closest('a.crc-go');if(a){events.push({phase:'bubble',connected:cardRoot.contains(a),href:a.getAttribute('href')});write();}});
document.addEventListener('click',e=>{if(e.target.closest('a.crc-go'))e.preventDefault();});
document.querySelector('#return').onclick=()=>document.dispatchEvent(new Event('visibilitychange'));
document.querySelector('#destroy').onclick=()=>{ui.destroy();write();};
ui.update({role:'participant',phase:'CONNECTED',authenticated:true,busy:false},true);
document.querySelector('[data-workflow-action="read-session"]').click();
''')
target.write_text(head+''.join('<script>'+s.replace('</script','<\\/script')+'</script>' for s in scripts))
print('Built isolated synthetic fixture')
