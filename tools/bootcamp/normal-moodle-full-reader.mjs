// Full native journey: exact selected local post, never a second Moodle environment.
import {normalMoodleReadParameters,normalMoodleReadClient} from './normal-moodle-read-policy.mjs';
import {reflectionSelection} from './normal-reflection-selection.mjs';
import {exactKeys,requireRule as check} from '../../src/policy/values.mjs';
const forumParameters=Object.freeze({mod_forum_get_forums_by_courses:Object.freeze(['courseids[0]']),
 mod_forum_get_forum_discussions:Object.freeze(['forumid','page','perpage']),mod_forum_get_discussion_post:Object.freeze(['postid'])});
export const normalMoodleFullReadParameters=Object.freeze({...normalMoodleReadParameters,...forumParameters});
export function normalMoodleFullReadClient(transport,assertCurrent,selection,now=()=>Math.floor(Date.now()/1000)){
 const fixed=reflectionSelection(selection,{origin:'https://127.0.0.1:9477',participantWallet:'0x0ea0675b3ae1e92d21ca286e5cd050f64f0bbab1',time:now()});
 check(fixed.postId===3&&fixed.discussionId===3,'BC_REFLECTION_SELECTION');
 const base=normalMoodleReadClient(transport,assertCurrent);
 const current=()=>{assertCurrent();check(now()>=fixed.observedAt&&now()<fixed.expiresAtExclusive,'BC_REFLECTION_SELECTION_EXPIRED');};
 return Object.freeze({async call(method,args={},signal){
  if(!Object.hasOwn(forumParameters,method))return base.call(method,args,signal);
  check(!signal?.aborted,'REVIEW_CANCELLED');current();exactKeys(args,forumParameters[method],'ACTIVITY_READER_TARGET');
  check(method==='mod_forum_get_forums_by_courses'?args['courseids[0]']==='2':method==='mod_forum_get_forum_discussions'?
   args.forumid==='3'&&typeof args.page==='string'&&/^[0-9]$/.test(args.page)&&args.perpage==='20':args.postid==='3','ACTIVITY_READER_TARGET');
  const result=await transport.call(method,args,signal);check(!signal?.aborted,'REVIEW_CANCELLED');current();
  if(method==='mod_forum_get_discussion_post'){
   const p=result?.post;check(p?.id===3&&p.discussionid===3&&p.author?.id===3&&p.timecreated===fixed.createdAt
    &&p.timemodified===fixed.modifiedAt&&p.capabilities?.view===true&&p.isdeleted===false&&p.isprivatereply===false,'BC_REFLECTION_SELECTION_CHANGED');
  }
  return result;
 }});
}
export function selectNormalMoodleReader({moodleFirst,nativeReader,legacyReader}){
 check(!moodleFirst||typeof nativeReader==='function','NORMAL_HOST_NATIVE_READER_REQUIRED');
 return moodleFirst?nativeReader:legacyReader;
}
