import {createPinnedReadTransport} from './readonly-transport.mjs';
// Dedicated isolated bootcamp host. Writer functions belong only to fixture harness.
export const BOOTCAMP_READ_FUNCTIONS=Object.freeze([
 'core_webservice_get_site_info','core_course_get_contents','core_completion_get_activities_completion_status',
 'mod_assign_get_assignments','mod_assign_get_submission_status','mod_forum_get_forums_by_courses',
 'mod_forum_get_forum_discussions','mod_forum_get_discussion_post']);
export function createBootcampMoodleClient(options){return createPinnedReadTransport({...options,baseUrl:'http://127.0.0.1:18767',parameters:{
 core_webservice_get_site_info:[],core_course_get_contents:['courseid'],
 core_completion_get_activities_completion_status:['courseid','userid'],
 mod_assign_get_assignments:['courseids[0]'],mod_assign_get_submission_status:['assignid','userid'],
 mod_forum_get_forums_by_courses:['courseids[0]'],mod_forum_get_forum_discussions:['forumid','page','perpage'],
 mod_forum_get_discussion_post:['postid']}});}

// E6 preparation has its own owned instance; never rebrand it as offline fixture execution.
export function createE6MoodleClient(options){return Object.freeze({...createPinnedReadTransport({...options,baseUrl:'http://127.0.0.1:18768',parameters:{
 core_webservice_get_site_info:[],core_course_get_contents:['courseid'],
 core_completion_get_activities_completion_status:['courseid','userid'],
 mod_assign_get_assignments:['courseids[0]'],mod_assign_get_submission_status:['assignid','userid'],
 mod_forum_get_forums_by_courses:['courseids[0]'],mod_forum_get_forum_discussions:['forumid','page','perpage'],
 mod_forum_get_discussion_post:['postid']}}),execution:'LOCAL_SYNTHETIC_SOURCE_PREPARATION'});}
