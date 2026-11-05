// Source-defined method/status and allowlisted D summaries only. No arguments, URL or raw error text.
import {types} from 'node:util';
import {executionErrorSummary} from '../../src/bootcamp/execution-diagnostics.mjs';
import {normalMoodleFullReadParameters} from './normal-moodle-full-reader.mjs';
export function createNormalMoodleReaderDiagnostics(persist){
 const events=[];
 const record=(method,error)=>{
  if(events.length>=16)return;
  let httpStatus=null;
  try{if(error&&!types.isProxy(error)){const value=Object.getOwnPropertyDescriptor(error,'httpStatus')?.value;
   if(Number.isInteger(value)&&value>=100&&value<=599)httpStatus=value;}}catch{}
  events.push(Object.freeze({method:Object.hasOwn(normalMoodleFullReadParameters,method)?method:'UNSUPPORTED_METHOD',httpStatus,...executionErrorSummary(error)}));
  try{persist?.(structuredClone(events));}catch{}
 };
 return Object.freeze({wrap(client){return Object.freeze({async call(method,args={},signal){
  try{return await client.call(method,args,signal);}catch(error){record(method,error);throw error;}
 }});},snapshot:()=>structuredClone(events)});
}
