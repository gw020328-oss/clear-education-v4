import {parse} from 'parse5';
import {requireValue,digest} from './values.mjs';
import {endpoints,MAX_HTML_BYTES,extractSource} from './source-policy.mjs';
export const historyParams=()=>({url:endpoints.score,method:'GET',headers:{'Accept-Encoding':'identity','User-Agent':'reclaim/0.0.1'},writeRedactionMode:'zk',responseMatches:[{type:'regex',value:'^HTTP/1\\.1 200[ \t][\\s\\S]*?\\r\\n\\r\\n[\\s\\S]*?(?<history_html><table\\b[^*>]*>[^*]*?</table>)[\\s*]*$'}],responseRedactions:[{xPath:'//table[.//tr[@name="TOE"]]'}]});
export const historyPolicyHash=digest(historyParams());
const walk=n=>[n,...(n.childNodes??[]).flatMap(walk)];
const attrs=n=>Object.fromEntries((n.attrs??[]).map(a=>[a.name,a.value]));
const text=n=>n.nodeName==='#text'?n.value:(n.childNodes??[]).map(text).join('');
export function inspectHistory(html,now=Date.now()){
 requireValue(typeof html==='string'&&html.length>0&&Buffer.byteLength(html)<=MAX_HTML_BYTES,'HISTORY_SIZE');
 const documentStartPresent=/<html\b/i.test(html),documentEndPresent=/<\/html>/i.test(html);
 const trailingMarkup=documentEndPresent&&!/<\/html>\s*$/i.test(html);
 const tree=parse(html,{sourceCodeLocationInfo:true}),nodes=walk(tree);
 const rows=nodes.filter(n=>n.tagName==='tr'&&attrs(n).name==='TOE');
 const tables=new Set(rows.map(r=>{let p=r;while(p&&p.tagName!=='table')p=p.parentNode;return p;}));
 let hiddenTableBytes=false;
 for(const table of tables){const p=table?.sourceCodeLocation;if(p&&html.slice(p.startOffset,p.endOffset).includes('***'))hiddenTableBytes=true;}
 // Reuse strict per-row parsing without the old single-exam 16-row ceiling.
 // A bounded 256-row history fails closed on size or unfamiliar structure.
 let parsed=[],layoutSupported=true;
 try{requireValue(rows.length>0&&rows.length<=256,'HISTORY_ROWS');parsed=rows.map(row=>{const p=row.sourceCodeLocation;requireValue(p,'HISTORY_ROW_LOCATION');return extractSource('score',Buffer.from('<html><body><table>'+html.slice(p.startOffset,p.endOffset)+'</table></body></html>'))[0];});}catch{layoutSupported=false;parsed=[];}
 const tableFacts=[...tables].map(table=>{
 const tableNodes=walk(table),tr=tableNodes.filter(n=>n.tagName==='tr');
 const p=table?.sourceCodeLocation,raw=p?html.slice(p.startOffset,p.endOffset):'';
 const names=new Set(tr.map(n=>attrs(n).name).filter(Boolean));
 return {sourceBytes:Buffer.byteLength(raw),tableHasId:Boolean(attrs(table).id),allRowCount:tr.length,headerRows:tr.filter(n=>walk(n).some(c=>c.tagName==='th')).length,
 toeicRows:tr.filter(n=>attrs(n).name==='TOE').length,otherDataRows:tr.filter(n=>walk(n).some(c=>c.tagName==='td')&&attrs(n).name!=='TOE').length,
 anyAsterisk:raw.includes('*'),redactionRun:raw.includes('***'),unknownExamName:[...names].some(n=>!['TOE','TSC','JPT','SJPT','TSW','TOEICSW','TOS','TOW','TOEIC'].includes(n)),
 headerLabels:['시험','시험일','수험번호','성적','발급','신청','유효'].filter(label=>tableNodes.filter(n=>n.tagName==='th').some(n=>text(n).includes(label)))};
 });
 const bodyText=text(nodes.find(n=>n.tagName==='body')??tree);
 const periodNoticeKinds={recentTwoYears:/최근\s*2\s*년/.test(bodyText),testDateTwoYears:/시험\s*(?:시행)?일(?:로)?부터[^。.!?\n]{0,60}2\s*년/.test(bodyText),validityTwoYears:/유효\s*기간[^。.!?\n]{0,60}2\s*년/.test(bodyText),expiredUnqueryable:/유효\s*기간[^。.!?\n]{0,80}(?:지나|경과|만료)[^。.!?\n]{0,80}(?:불가|없|안)/.test(bodyText),allScoresLabel:/전체\s*성적|성적\s*전체|보유\s*성적/.test(bodyText)};
 const twoYearNotice=/2\s*년|2\s*year/i.test(bodyText);
 const pagination=nodes.some(n=>{const a=attrs(n);return /(^|[\s_-])(paging|pagination|paginate|page_num|pageList)([\s_-]|$)/i.test((a.class??'')+' '+(a.id??''))||(['a','button','input'].includes(n.tagName)&&/다음\s*페이지|더\s*보기|next\s*page/i.test(text(n)));});
 const scripts=nodes.filter(n=>n.tagName==='script').map(text).join('\n');
 const possibleHistoryAjax=/(?:ajax|fetch|xmlhttprequest)[\s\S]{0,250}(?:scoreList|scoreHistory|resultList)|(?:scoreList|scoreHistory|resultList)[\s\S]{0,250}(?:ajax|fetch|xmlhttprequest)/i.test(scripts);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const cutoff=String(Number(today.slice(0,4))-2)+today.slice(4);
 const inWindow=parsed.filter(r=>r.fields.exam_date>=cutoff&&r.fields.exam_date<=today).length;
 return {duplicateRows:new Set(parsed.map(r=>r.fields.exam_date+':'+r.fields.registration_number)).size!==parsed.length,tableCount:nodes.filter(n=>n.tagName==='table').length,periodNoticeKinds,sourceTableFacts:tableFacts,bodyHasAsterisk:html.includes('*'),bodyRedactionRun:html.includes('***'),documentStartPresent,documentEndPresent,trailingMarkup,rowCount:rows.length,parsedRowCount:parsed.length,layoutSupported,twoYearNotice,paginationIndicator:pagination,possibleHistoryAjax,redactionInScoreTable:hiddenTableBytes,recordsInRollingTwoYears:inWindow,
  fullHistoryProven:false,accountIdentityBound:false,sourceCoverageConfirmed:false,paymentAllowed:false};
}
