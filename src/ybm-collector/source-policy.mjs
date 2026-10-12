import {parse} from 'parse5';
import {digest,requireValue,examFields,examKey} from './values.mjs';

export const MAX_HTML_BYTES=512*1024,MAX_ROWS=16;
export const endpoints=Object.freeze({registration:'https://exam.toeic.co.kr/receipt/confirmDetail.php',score:'https://exam.toeic.co.kr/result/scoreList.php'});
export const methods=Object.freeze({registration:'POST',score:'GET'});
const date='\\d{4}\\.\\d{2}\\.\\d{2}',weekday='(?:월|화|수|목|금|토|일)',number='\\d{6,10}';
const classPattern='class=["\'](?<exam_type>TOEIC)["\']';
const binary=pattern=>Buffer.from(pattern,'utf8').toString('latin1');
const firstText=path=>`(${path}//text()[normalize-space()])[1]`;
function params(role,index=0){
  const base={url:endpoints[role],method:methods[role],headers:{'Accept-Encoding':'identity','User-Agent':'reclaim/0.0.1'},writeRedactionMode:'zk'};
  if(role==='registration')return {...base,headers:{...base.headers,'Content-Type':'application/x-www-form-urlencoded'},body:'encExamData={{encExamData}}&zzxxcc=',
    responseMatches:[classPattern,`(?<exam_date>${date})`,`(?<registration_number>${number})`].map(value=>({type:'regex',value})),
    responseRedactions:[
      {xPath:'/html[@class="TOEIC"]',regex:classPattern},
      ...[['시험일',date],['수험번호',number]].map(([label,regex])=>({xPath:binary(firstText(`//th[normalize-space(.)="${label}"]/following-sibling::td[1]`)),regex:'^\\s*'+regex+(label==='수험번호'?'\\s*$':'')})),
    ]};
  // Restrict each reveal to text nodes. Presentation attributes, comments,
  // hidden inputs, and LC/RC values never enter the revealed ranges.
  const row=`(//tr[@name="TOE" and contains(concat(' ',normalize-space(@class),' '),' trSB ')])[${index+1}]`;
  const patterns=['TOEIC\\s*$',date+'\\('+weekday+'\\)\\s*$',number+'\\s*$','Total \\d{2,3} \\('];
  return {...base,
    responseMatches:[{type:'regex',value:`(?<exam_type>TOEIC)[\\s*]*(?<exam_date>${date})\\(${weekday}\\)[\\s*]*(?<registration_number>${number})[\\s*]*Total (?<total_score>\\d{2,3}) \\(`}],
    responseRedactions:patterns.map((regex,i)=>({xPath:firstText(`${row}/td[${i+1}][not(*) and count(text()[normalize-space()])=1]`),regex:binary('^\\s*'+regex)})),
  };
}
export function sourceBundle(){return {
  revision:'ybm-minimal-candidate.3',status:'AWAITING_CURRENT_YBM_LAYOUT',encoding:'UTF-8',parser:'strict-ybm-dom.2',maxHtmlBytes:MAX_HTML_BYTES,maxRows:MAX_ROWS,listCompleteness:false,
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
function firstCellText(cell,html){
  const node=nodes(cell).find(n=>n.nodeName==='#text'&&n.value.trim());
  requireValue(node?.sourceCodeLocation,'SOURCE_TEXT_LAYOUT');
  const {startOffset,endOffset}=node.sourceCodeLocation;
  // The SDK operates on source bytes; entity-decoded text is not interchangeable.
  requireValue(html.slice(startOffset,endOffset)===node.value,'SOURCE_TEXT_LAYOUT');
  return node.value.trim();
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
      const cells=row.childNodes.filter(n=>n.tagName),position=cells.indexOf(headers[0]);
      const cell=cells[position+1];requireValue(position>=0&&cell?.tagName==='td','REGISTRATION_LAYOUT');
      const raw=text(cell).trim(),first=firstCellText(cell,html);
      const value=key==='exam_date'?raw.match(/^\d{4}\.\d{2}\.\d{2}(?=$|[\s(])/)?.[0]:raw;
      requireValue(value&&(key==='exam_date'?first.startsWith(value):first===value),'REGISTRATION_LAYOUT');values[key]=value;
    }
    return [{index:0,fields:examFields(values,role)}];
  }
  const rows=all.filter(n=>n.tagName==='tr'&&attrs(n).name==='TOE');
  requireValue(rows.length>0&&rows.length<=MAX_ROWS,'SCORE_ROW_COUNT');
  const seen=new Set();
  return rows.map((row,index)=>{
    requireValue((attrs(row).class??'').split(/\s+/).includes('trSB'),'SCORE_LAYOUT');
    const cells=row.childNodes.filter(n=>n.tagName);
    requireValue(cells.length>=4&&cells.every(n=>n.tagName==='td'),'SCORE_LAYOUT');
    requireValue(cells.slice(0,4).every(c=>!c.childNodes.some(n=>n.tagName)&&c.childNodes.filter(n=>n.nodeName==='#text'&&n.value.trim()).length===1),'SCORE_LAYOUT');
    const values=cells.slice(0,4).map(c=>firstCellText(c,html));
    requireValue(cells.slice(0,3).every((c,i)=>text(c).trim()===values[i]),'SCORE_LAYOUT');
    const examDate=new RegExp('^('+date+')\\('+weekday+'\\)$').exec(values[1]);
    const total=/^Total (\d{2,3}) \(/.exec(values[3]);
    requireValue(examDate&&total,'SCORE_LAYOUT');
    const fields=examFields({exam_type:values[0],exam_date:examDate[1],registration_number:values[2],total_score:total[1]},role),key=examKey(fields);
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
