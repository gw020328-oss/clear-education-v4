// Constructor-only selection of a newly authored local demonstration post.
// This metadata is not source authority or permission to invoke a model.
import {exactKeys,freeze,requireRule as check} from '../../src/policy/values.mjs';
import {readPrivate} from '../../src/hackathon-test-vault/e5/private-storage.mjs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export function reflectionSelection(value,{origin,participantWallet,time}){
 exactKeys(value,['version','origin','participantWallet','courseId','cmId','forumId','authorId','postId','discussionId','createdAt','modifiedAt','observedAt','expiresAtExclusive'],'BC_REFLECTION_SELECTION');
 check(value.version==='clear-normal-reflection-selection.1'&&value.origin===origin&&value.participantWallet===participantWallet
  &&value.courseId===2&&value.cmId===5&&value.forumId===3&&value.authorId===3,'BC_REFLECTION_SELECTION');
 for(const k of ['postId','discussionId','createdAt','modifiedAt','observedAt','expiresAtExclusive'])check(Number.isSafeInteger(value[k])&&value[k]>0,'BC_REFLECTION_SELECTION');
 check(value.postId!==1&&value.modifiedAt>=value.createdAt&&value.observedAt>=value.modifiedAt
  &&value.expiresAtExclusive>value.observedAt&&value.expiresAtExclusive-value.observedAt<=3600
  &&time>=value.observedAt&&time<value.expiresAtExclusive,'BC_REFLECTION_SELECTION_EXPIRED');
 return freeze(structuredClone(value));
}
export function readReflectionSelection(directory,config,time=Math.floor(Date.now()/1000)){
 if(config.reflectionSelectionSha256===undefined)return null;
 check(/^[a-f0-9]{64}$/.test(config.reflectionSelectionSha256),'BC_REFLECTION_SELECTION');
 const bytes=readPrivate(join(directory,'reflection-selection.json'));
 check(createHash('sha256').update(bytes).digest('hex')===config.reflectionSelectionSha256,'BC_REFLECTION_SELECTION_CHANGED');
 return reflectionSelection(JSON.parse(bytes),{origin:config.origin,participantWallet:config.participantWallet,time});
}
export function selectedReflectionTarget(original,selection){
 return selection?{...original,selectedPostId:selection.postId}:structuredClone(original);
}
export function withSelectedReflectionReader(withReader,selection,now=()=>Math.floor(Date.now()/1000)){
 if(!selection)return withReader;
 const fixed=reflectionSelection(selection,{origin:selection.origin,participantWallet:selection.participantWallet,time:now()});
 const current=()=>check(now()>=fixed.observedAt&&now()<fixed.expiresAtExclusive,'BC_REFLECTION_SELECTION_EXPIRED');
 return use=>withReader(client=>use({call:async(method,args,signal)=>{
  check(!signal?.aborted,'REVIEW_CANCELLED');current();
  if(method==='mod_forum_get_discussion_post')check(String(args.postid)===String(fixed.postId),'BC_REFLECTION_SELECTION_CHANGED');
  const value=await client.call(method,args,signal);check(!signal?.aborted,'REVIEW_CANCELLED');current();
  if(method==='mod_forum_get_discussion_post'){
   const p=value?.post;check(p?.id===fixed.postId&&p.discussionid===fixed.discussionId&&p.author?.id===fixed.authorId
    &&p.timecreated===fixed.createdAt&&p.timemodified===fixed.modifiedAt&&p.capabilities?.view===true
    &&p.isdeleted===false&&p.isprivatereply===false,'BC_REFLECTION_SELECTION_CHANGED');
  }
  return value;
 }}));
}
