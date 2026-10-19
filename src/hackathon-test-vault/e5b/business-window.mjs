import {exactKeys} from '../../policy/values.mjs';
import {ensure} from '../e5/private-storage.mjs';
const eligible=new Set(['registerCurrentMet','allocate','startReview','replaceTarget','bindConsents','prepareUnsigned','accept']);
const integer=x=>Number.isSafeInteger(x)&&x>0;
export function validateWindowShape(window){
 exactKeys(window,['createdAt','sourceUntil','reviewUntil','messageUntil','businessValidUntil'],'E5B_BUSINESS_SHAPE');
 ensure(integer(window.createdAt)&&integer(window.businessValidUntil)&&['sourceUntil','reviewUntil','messageUntil'].every(k=>window[k]===null||integer(window[k])),'E5B_BUSINESS_TIME');
 ensure(window.businessValidUntil===Math.min(window.createdAt+120,...['sourceUntil','reviewUntil','messageUntil'].map(k=>window[k]??Infinity)),'E5B_BUSINESS_BOUND');
}
export function validateBusinessWindow(window,command,observation,now){
 validateWindowShape(window);ensure(window.createdAt<=now&&now<window.businessValidUntil,'E5B_BUSINESS_EXPIRED');
 if(!eligible.has(command.method)){ensure(window.sourceUntil===null&&window.reviewUntil===null&&window.messageUntil===null,'E5B_NON_ELIGIBILITY_WINDOW');return;}
 const a=observation.business.application;
 const target=command.method==='registerCurrentMet'?command.args[3]:command.method==='replaceTarget'?command.args[2]:a.target;
 ensure(window.sourceUntil!==null&&window.sourceUntil<=Number(target.sourceValidUntilExclusive),'E5B_SOURCE_WINDOW');
 const review=command.method==='startReview'?Number(command.args[3])+600:Number(a.firstStartedAt)>0?Number(a.firstStartedAt)+600:null;
 ensure(review===null?window.reviewUntil===null:window.reviewUntil!==null&&window.reviewUntil<=review,'E5B_REVIEW_WINDOW');
 const message=['prepareUnsigned','accept'].includes(command.method)?Number(command.args[1].expiresAt):null;
 ensure(message===null?window.messageUntil===null:window.messageUntil!==null&&window.messageUntil<=message,'E5B_MESSAGE_WINDOW');
}
