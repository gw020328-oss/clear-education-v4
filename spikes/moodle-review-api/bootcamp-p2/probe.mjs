// Private synthetic diagnostic for the isolated fixture. Never commit raw responses.
import {readFile,writeFile} from 'node:fs/promises';
import {createBootcampMoodleClient} from '../../../src/review-evidence/moodle/bootcamp-client.mjs';
const dir=new URL('../../../var/moodle-bootcamp-p2/',import.meta.url),f=JSON.parse(await readFile(new URL('fixture.json',dir)));
const client=createBootcampMoodleClient({tokenProvider:()=>f.tokens.one.read});
try{
 const data={identity:await client.call('core_webservice_get_site_info'),
  contents:await client.call('core_course_get_contents',{courseid:f.courseId}),
  completion:await client.call('core_completion_get_activities_completion_status',{courseid:f.courseId,userid:f.users.one}),
  assignments:await client.call('mod_assign_get_assignments',{'courseids[0]':f.courseId}),
  submission:await client.call('mod_assign_get_submission_status',{assignid:f.assignment.instanceId,userid:0})};
 await writeFile(new URL('probe.json',dir),JSON.stringify(data),{mode:0o600});
 console.log(JSON.stringify({version:data.identity.version,release:data.identity.release,modules:data.contents.flatMap(s=>s.modules??[]).map(m=>({id:m.id,instance:m.instance,modname:m.modname,completion:m.completion,completiondata:m.completiondata})),completion:data.completion,assignments:data.assignments.courses?.map(c=>({id:c.id,assignments:c.assignments.map(a=>({id:a.id,cmid:a.cmid,course:a.course,teamsubmission:a.teamsubmission}))})),submission:{state:data.submission.lastattempt?.submission?.status??null,fields:Object.keys(data.submission.lastattempt??{})}}));
}finally{client.close();}
