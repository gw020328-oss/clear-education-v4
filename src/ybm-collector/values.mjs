import {id} from 'ethers';
export const requireValue=(value,code)=>{if(!value)throw new Error(code);};
export function canonical(value){
  if(value===null||typeof value==='string'||typeof value==='boolean'||(typeof value==='number'&&Number.isSafeInteger(value)))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  requireValue(value&&Object.getPrototypeOf(value)===Object.prototype,'INVALID_JSON_VALUE');
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
export const digest=value=>id(canonical(value));
export function exactKeys(value,required){
  requireValue(value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length===required.length&&required.every(k=>Object.hasOwn(value,k)),'SCHEMA_KEYS');
}
export function examFields(fields,role){
  exactKeys(fields,['exam_type','exam_date','registration_number',...(role==='score'?['total_score']:[])]);
  requireValue(fields.exam_type==='TOEIC','EXAM_TYPE');
  requireValue(typeof fields.registration_number==='string'&&/^\d{6,10}$/.test(fields.registration_number),'EXAM_NUMBER');
  requireValue(typeof fields.exam_date==='string'&&/^\d{4}([.-])\d{2}\1\d{2}$/.test(fields.exam_date),'EXAM_DATE');
  const date=fields.exam_date.replaceAll('.','-'),time=Date.parse(date+'T00:00:00Z');
  requireValue(Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===date,'EXAM_DATE');
  if(role==='score')requireValue(typeof fields.total_score==='string'&&/^[1-9]\d{1,2}$/.test(fields.total_score)&&Number(fields.total_score)<=990&&Number(fields.total_score)%5===0,'SCORE');
  return {...fields,exam_date:date};
}
export const examKey=fields=>[fields.exam_type,fields.exam_date,fields.registration_number].join(':');
