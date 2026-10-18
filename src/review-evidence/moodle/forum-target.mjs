import {digest} from '../../policy/mvp/contract.mjs';
const hash=v=>digest('CLEAR-MOODLE-REVIEW-FACTS.1',v);
const positive=x=>Number.isSafeInteger(x)&&x>0;
const check=(x,c)=>{if(!x)throw Error(c);};
// Fixed target only; no complete-history or absence assertion.
export async function readForumTarget(call,p){
 const forums=await call('mod_forum_get_forums_by_courses',{'courseids[0]':String(p.courseId)});
 check(Array.isArray(forums),'REVIEW_RESPONSE_SHAPE');
 const forum=forums.find(f=>f.id===p.forumId);check(forum&&forum.course===p.courseId,'REVIEW_COURSE_FORUM_MISMATCH');
 let listing,seen=new Set();
 for(let page=0;page<10;page++){
  const v=await call('mod_forum_get_forum_discussions',{forumid:String(p.forumId),page:String(page),perpage:'20'});
  check(Array.isArray(v?.discussions)&&Array.isArray(v.warnings)&&!v.warnings.length,'REVIEW_PAGE_UNAVAILABLE');
  for(const row of v.discussions){check(positive(row.id)&&!seen.has(row.id),'REVIEW_PAGE_CHANGED');seen.add(row.id);if(row.id===p.postId)listing=row;}
  if(listing||v.discussions.length<20)break;
  if(page===9)throw Error('REVIEW_PAGE_LIMIT');
 }
 // Target lookup is not a complete-history or absence assertion.
 check(listing,'REVIEW_TARGET_NOT_IN_VISIBLE_PAGES');
 check(positive(listing.discussion),'REVIEW_RESPONSE_SHAPE');
 const v=await call('mod_forum_get_discussion_post',{postid:String(p.postId)}),post=v?.post;
 check(Array.isArray(v?.warnings)&&!v.warnings.length&&post&&post.id===p.postId&&post.discussionid===listing.discussion,'REVIEW_RESPONSE_SHAPE');
 check(post.author?.id===p.authorId&&listing.userid===p.authorId,'REVIEW_AUTHOR_MISMATCH');
 check(post.capabilities?.view===true&&!post.isdeleted&&post.isprivatereply===false,'REVIEW_NOT_VISIBLE');
 check(typeof post.subject==='string'&&typeof post.message==='string'&&Buffer.byteLength(post.message)<=131072
  &&[0,1,2,4].includes(post.messageformat)&&positive(post.timecreated)&&positive(post.timemodified)&&post.timemodified>=post.timecreated,'REVIEW_RESPONSE_SHAPE');
 // Re-read target to discard a torn observation, including same-second edits.
 const again=await call('mod_forum_get_discussion_post',{postid:String(p.postId)});
 const select=x=>({id:x.id,discussionId:x.discussionid,authorId:x.author?.id,subject:x.subject,body:x.message,messageFormat:x.messageformat,
  createdAt:x.timecreated,modifiedAt:x.timemodified,visible:x.capabilities?.view,deleted:x.isdeleted,privateReply:x.isprivatereply});
 check(Array.isArray(again?.warnings)&&!again.warnings.length&&again.post&&hash(select(post))===hash(select(again.post)),'REVIEW_SOURCE_CHANGED');
 const source={instanceRef:p.instanceRef,courseId:p.courseId,forumId:p.forumId,...select(post)};
 return source;
}
