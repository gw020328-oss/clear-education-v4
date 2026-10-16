// Private in-memory reference parser. No HTML repair, logging or serialization.
// Equivalent circuit constraints must also run before this can authorize a ZK result.
import {examFields,examKey} from '../../../src/ybm-collector/values.mjs';
export const LIMITS=Object.freeze({bytes:8192,rows:16,cells:12,depth:16,tagBytes:512,cellBytes:256});
const fail=code=>{throw Error(code);};
const containers=new Set(['table','thead','tbody','tfoot','tr','td','th','colgroup','col','a','span','strong','b','br','input','button','div']);
const voids=new Set(['col','br','input']);
const spaces=/^[\t\r\n ]*$/;
const asciiName=/^[a-z][a-z0-9]*$/;
function tag(raw){
  const m=/^<(\/?)([a-z][a-z0-9]*)([\s\S]*?)>$/.exec(raw);if(!m)fail('HTML_TAG');
  const [,slash,name,attrs]=m;if(!containers.has(name))fail('HTML_UNSUPPORTED_TAG');
  if(slash){if(!spaces.test(attrs))fail('HTML_CLOSE');return {name,close:true};}
  // Attribute names/values are not source facts. Parse quotes to forbid repair,
  // duplicate attributes and tag/control delimiters hidden in attribute syntax.
  let s=attrs;const seen=new Set();
  while(s.length){if(spaces.test(s))break;
    const a=/^[\t\r\n ]+([a-zA-Z_:][a-zA-Z0-9_:.-]*)(?:[\t\r\n ]*=[\t\r\n ]*(?:"([^"<>]*)"|'([^'<>]*)'|([^\s"'=<>`]+)))?/.exec(s);
    if(!a)fail('HTML_ATTRIBUTE');const key=a[1].toLowerCase();if(seen.has(key))fail('HTML_DUPLICATE_ATTRIBUTE');seen.add(key);s=s.slice(a[0].length);
  }
  return {name,close:false};
}
export function parsePrivateTable(bytes){
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>LIMITS.bytes)fail('HTML_SIZE');
  let html;try{html=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('HTML_ENCODING');}
  if(/[\x00-\x08\x0b\x0c\x0e-\x1f*]/.test(html))fail('HTML_REDACTION_OR_CONTROL');
  const stack=[],rows=[];let i=0,tableCount=0,ended=false,current,cell,fieldStart;
  while(i<html.length){
    if(html.startsWith('<!--',i)){
      const end=html.indexOf('-->',i+4);if(end<0||html.slice(i+4,end).includes('--'))fail('HTML_COMMENT');
      if(cell&&current.cells.length<4&&!current.header)fail('HTML_NESTED_FACT');i=end+3;continue;
    }
    if(html[i]!=='<'){
      const end=html.indexOf('<',i),to=end<0?html.length:end,part=html.slice(i,to);
      if(!cell&&!spaces.test(part))fail('HTML_OUTSIDE_CELL');
      if(ended&&!spaces.test(part))fail('HTML_TRAILING');i=to;continue;
    }
    let quote='',end=i+1;for(;end<html.length;end++){
      const ch=html[end];if(quote){if(ch===quote)quote='';}else if(ch==='"'||ch==="'")quote=ch;else if(ch==='>')break;
    }
    if(end===html.length||Buffer.byteLength(html.slice(i,end+1))>LIMITS.tagBytes)fail('HTML_TAG_SIZE');
    const t=tag(html.slice(i,end+1));if(!asciiName.test(t.name))fail('HTML_TAG');
    const parent=stack.at(-1);
    if(t.close){
      if(parent!==t.name)fail('HTML_UNBALANCED');
      if(t.name==='td'||t.name==='th'){
        if(!cell||cell!==t.name)fail('HTML_CELL');
        const raw=html.slice(fieldStart,i);if(Buffer.byteLength(raw)>LIMITS.cellBytes)fail('HTML_CELL_SIZE');
        current.cells.push(raw);cell=undefined;
      }
      if(t.name==='tr'){if(!current||!current.cells.length)fail('HTML_ROW');rows.push(current);current=undefined;}
      if(t.name==='table')ended=true;stack.pop();
    }else{
      if(ended)fail('HTML_TRAILING');
      if(t.name==='table'){if(stack.length||tableCount++)fail('HTML_TABLE');}
      else if(['thead','tbody','tfoot','colgroup'].includes(t.name)){if(parent!=='table')fail('HTML_SECTION');}
      else if(t.name==='col'){if(parent!=='colgroup')fail('HTML_COLUMN');}
      else if(t.name==='tr'){
        if(!['table','thead','tbody','tfoot'].includes(parent)||current||rows.length>=LIMITS.rows)fail('HTML_ROW');
        current={physicalIndex:rows.length,header:false,cells:[]};
      }else if(t.name==='td'||t.name==='th'){
        if(parent!=='tr'||!current||cell||current.cells.length>=LIMITS.cells)fail('HTML_CELL');
        if(current.cells.length&&current.header!==(t.name==='th'))fail('HTML_MIXED_ROW');
        current.header=t.name==='th';cell=t.name;fieldStart=end+1;
      }else if(!cell||(!current.header&&current.cells.length<4))fail('HTML_NESTED_FACT');
      if(!voids.has(t.name)){stack.push(t.name);if(stack.length>LIMITS.depth)fail('HTML_DEPTH');}
    }
    i=end+1;
  }
  if(stack.length||!ended||tableCount!==1||!rows.length)fail('HTML_INCOMPLETE');
  const results=[],seen=new Set();
  for(const r of rows){
    if(r.header)continue;if(r.cells.length<4)fail('HTML_FACT_COLUMNS');
    const c=r.cells.slice(0,4).map(x=>x.trim());if(c.some(x=>/[<>&]/.test(x)))fail('HTML_FACT_ENCODING');
    if(c[0]!=='TOEIC')fail('HTML_UNSUPPORTED_EXAM');
    const date=/^(\d{4}([.-])\d{2}\2\d{2})\((월|화|수|목|금|토|일)\)$/.exec(c[1]);
    const score=/^Total ([1-9]\d{1,2}) \(/.exec(c[3]);if(!date||!score)fail('HTML_FACT_FORMAT');
    const fields=examFields({exam_type:'TOEIC',exam_date:date[1],registration_number:c[2],total_score:score[1]},'score');
    const key=examKey(fields);if(seen.has(key))fail('HTML_DUPLICATE_EXAM');seen.add(key);
    results.push({physicalIndex:r.physicalIndex,fields});
  }
  if(!results.length)fail('HTML_NO_EXAM');return results;
}
export function selectPrivateExam(bytes,index){const rows=parsePrivateTable(bytes);if(!Number.isSafeInteger(index)||index<0||index>=rows.length)fail('HTML_INDEX');return rows[index];}
