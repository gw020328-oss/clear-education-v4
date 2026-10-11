import {parse} from 'parse5';
import {digest,requireValue,examFields,examKey} from './values.mjs';

export const MAX_HTML_BYTES=512*1024,MAX_ROWS=16;
export const endpoints=Object.freeze({registration:'https://exam.toeic.co.kr/receipt/confirmDetail.php',score:'https://exam.toeic.co.kr/result/scoreList.php'});
export const methods=Object.freeze({registration:'POST',score:'GET'});
const cell='<td>\\s*';
const prefix=cell+'(?<exam_type>TOEIC)\\s*</td>\\s*'+cell+'(?<exam_date>\\d{4}\\.\\d{2}\\.\\d{2})\\((?:월|화|수|목|금|토|일)\\)\\s*</td>\\s*'+cell+'(?<registration_number>\\d{6,10})\\s*</td>\\s*'+cell+'Total (?<total_score>\\d{2,3}) \\(';
const opening='<tr class="trSB" name="TOE">';
const patterns={
  exam_type:'<html class=["\'](?<exam_type>TOEIC)["\']>',
  exam_date:'<th>\\s*시험일\\s*</th>\\s*<td>\\s*<div>\\s*(?<exam_date>\\d{4}\\.\\d{2}\\.\\d{2})',
  registration_number:'<th>\\s*수험번호\\s*</th>\\s*<td>\\s*(?<registration_number>\\d{6,10})\\s*</td>',
};
const binary=pattern=>Buffer.from(pattern,'utf8').toString('latin1');
function params(role,index=0){
  const base={url:endpoints[role],method:methods[role],headers:{'Accept-Encoding':'identity'},writeRedactionMode:'zk'};
  if(role==='registration')return {...base,headers:{...base.headers,'Content-Type':'application/x-www-form-urlencoded'},body:'encExamData={{encExamData}}&zzxxcc=',responseMatches:Object.values(patterns).map(value=>({type:'regex',value})),responseRedactions:Object.values(patterns).map(regex=>({regex:binary(regex)}))};
  // Reveal the row marker and the first four cells only through the total.
  // Comments and LC/RC values are outside these ranges. XPath selects a fixed,
  // pre-authorized index; no personal value is compiled into a policy regex.
  const xPath=`(//tr[@class="trSB" and @name="TOE"])[${index+1}]`;
  return {...base,responseMatches:[{type:'regex',value:opening+'[\\s*]*'+prefix}],responseRedactions:[{xPath,regex:opening},{xPath,regex:binary(prefix)}]};
}
export function sourceBundle(){return {
  revision:'ybm-minimal-candidate.1',status:'AWAITING_CURRENT_YBM_LAYOUT',encoding:'UTF-8',parser:'strict-ybm-dom.1',maxHtmlBytes:MAX_HTML_BYTES,maxRows:MAX_ROWS,listCompleteness:false,
  sources:{registration:[params('registration')],score:Array.from({length:MAX_ROWS},(_,i)=>params('score',i))},
};}
export const sourcePolicyHash=digest(sourceBundle());
export function policyFor(role,index=0){requireValue(['registration','score'].includes(role)&&Number.isInteger(index)&&index>=0&&index<(role==='score'?MAX_ROWS:1),'SOURCE_SELECTION');return structuredClone(sourceBundle().sources[role][index]);}
const attrs=node=>Object.fromEntries((node.attrs??[]).map(a=>[a.name,a.value]));
const text=node=>node.nodeName==='#text'?node.value:(node.childNodes??[]).map(text).join('');
const nodes=root=>{const out=[];function visit(n){out.push(n);for(const c of n.childNodes??[])visit(c);}visit(root);return out;};
function bodyTree(bytes){
  requireValue(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=MAX_HTML_BYTES,'HTML_SIZE');
  let html;try{html=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('HTML_ENCODING');}
  const tree=parse(html,{sourceCodeLocationInfo:true});return {html,all:nodes(tree)};
}
export function extractSource(role,bytes){
  requireValue(['registration','score'].includes(role),'SOURCE_ROLE');
  const {html,all}=bodyTree(bytes);
  if(role==='registration'){
    requireValue(all.some(n=>n.tagName==='html'&&attrs(n).class==='TOEIC'),'EXAM_TYPE');
    const values={exam_type:'TOEIC'};
    for(const [label,key] of [['시험일','exam_date'],['수험번호','registration_number']]){
      const headers=all.filter(n=>n.tagName==='th'&&text(n).trim()===label);
      requireValue(headers.length===1,'AMBIGUOUS_REGISTRATION');
      const row=headers[0].parentNode;requireValue(row?.tagName==='tr','REGISTRATION_LAYOUT');
      const cells=row.childNodes.filter(n=>n.tagName);
      requireValue(cells.length===2&&cells[0]===headers[0]&&cells[1].tagName==='td','REGISTRATION_LAYOUT');
      const raw=text(cells[1]).trim();
      values[key]=key==='exam_date'?raw.match(/^\d{4}\.\d{2}\.\d{2}(?=$|[\s(])/)?.[0]:raw;
    }
    // The local parser and exact SDK extraction recipe must agree.
    for(const [key,pattern] of Object.entries(patterns)){
      const matches=[...html.matchAll(new RegExp(pattern,'gis'))];
      requireValue(matches.length===1&&matches[0].groups[key]===values[key],'REGISTRATION_LAYOUT');
    }
    return [{index:0,fields:examFields(values,role)}];
  }
  const rows=all.filter(n=>n.tagName==='tr'&&attrs(n).name==='TOE');
  requireValue(rows.length>0&&rows.length<=MAX_ROWS,'SCORE_ROW_COUNT');
  const seen=new Set();
  return rows.map((row,index)=>{
    const a=attrs(row);requireValue(a.class==='trSB'&&Object.keys(a).length===2,'SCORE_LAYOUT');
    const location=row.sourceCodeLocation;requireValue(location?.startOffset!==undefined,'SCORE_LAYOUT');
    const raw=html.slice(location.startOffset,location.endOffset);
    requireValue(raw.startsWith(opening),'SCORE_LAYOUT');
    const cells=row.childNodes.filter(n=>n.tagName);
    requireValue(cells.length>=4&&cells.every(n=>n.tagName==='td'),'SCORE_LAYOUT');
    const start=cells[0].sourceCodeLocation?.startOffset;
    const match=new RegExp('^'+prefix,'s').exec(html.slice(start,location.endOffset));
    requireValue(match,'SCORE_LAYOUT');
    const fields=examFields({...match.groups},role),key=examKey(fields);
    requireValue(!seen.has(key),'DUPLICATE_EXAM');seen.add(key);
    return {index,fields};
  });
}
export function joinSources(registration,scores){
  requireValue(registration.length===1,'REGISTRATION_COUNT');
  const key=examKey(registration[0].fields),matches=scores.filter(row=>examKey(row.fields)===key);
  requireValue(matches.length===1,'EXAM_JOIN');
  return {registration:registration[0],score:matches[0],listComplete:false,highestScoreAssessed:false,paymentAllowed:false};
}
