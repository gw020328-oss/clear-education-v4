import {createPinnedReadTransport} from './readonly-transport.mjs';
// Existing laboratory factory/allowlist remains fixed and read-only.
export function createReviewClient(options){return createPinnedReadTransport({...options,baseUrl:'http://127.0.0.1:18766',parameters:{
 core_webservice_get_site_info:[],mod_forum_get_forums_by_courses:['courseids[0]'],
 mod_forum_get_forum_discussions:['forumid','page','perpage'],mod_forum_get_discussion_post:['postid']}});}
