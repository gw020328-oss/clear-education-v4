// Restricted inert grammar, not a browser HTML parser or sanitizer. Unsupported markup fails closed.
import {requireRule as check,freeze} from '../../policy/values.mjs';
import {bytesDigest} from '../../product-workflow/contract.mjs';
import {PLAIN_NORMALIZER,HTML_NORMALIZER,bridgeHash} from './contract.mjs';
const textInput=text=>check(typeof text==='string'&&text.isWellFormed()&&Buffer.byteLength(text)<=131072
 &&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text),'RB_SOURCE_TEXT');
export function normalizePlainReviewText(text){textInput(text);return text.replace(/\r\n?/g,'\n').normalize('NFC');}
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0'};
function decodeText(text){
 let out='',from=0;
 for(let at;(at=text.indexOf('&',from))!==-1;){
  out+=text.slice(from,at);const end=text.indexOf(';',at+1);check(end!==-1&&end-at<=12,'RB_HTML_UNSUPPORTED');const value=text.slice(at+1,end);
  if(Object.hasOwn(entities,value))out+=entities[value];
  else{check(/^#(?:[0-9]{1,7}|x[0-9a-fA-F]{1,6})$/.test(value),'RB_HTML_UNSUPPORTED');
   const code=value[1]==='x'?Number.parseInt(value.slice(2),16):Number(value.slice(1));
   check(code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff),'RB_HTML_UNSUPPORTED');const decoded=String.fromCodePoint(code);textInput(decoded);out+=decoded;}
  from=end+1;
 }
 return out+text.slice(from);
}
export function projectRestrictedReviewHtml(html){
 textInput(html);const root={tag:'root',children:[]},stack=[root];let at=0,nodes=0;
 const add=node=>{check(++nodes<=2048,'RB_HTML_LIMIT');stack.at(-1).children.push(node);};
 while(at<html.length){
  if(html[at]!=='<'){const end=html.indexOf('<',at),until=end===-1?html.length:end;add({tag:'text',text:decodeText(html.slice(at,until))});at=until;continue;}
  const end=html.indexOf('>',at+1);check(end!==-1,'RB_HTML_UNSUPPORTED');const token=html.slice(at+1,end).trim();at=end+1;
  if(/^\/(p|div|span|b|strong|i|em|u)$/.test(token)){check(stack.length>1&&stack.at(-1).tag===token.slice(1),'RB_HTML_UNSUPPORTED');stack.pop();continue;}
  if(/^br\s*\/?$/.test(token)){add({tag:'br'});continue;}
  const tag=token==='div class="text_to_html"'?'div':token;
  check(/^(p|div|span|b|strong|i|em|u)$/.test(tag),'RB_HTML_UNSUPPORTED');check(stack.length<33,'RB_HTML_LIMIT');
  const node={tag,children:[]};add(node);stack.push(node);
 }
 check(stack.length===1,'RB_HTML_UNSUPPORTED');
 const block=node=>node.tag==='p'||node.tag==='div';
 const inline=node=>{
  if(node.tag==='text')return node.text;if(node.tag==='br')return '\n';
  check(!block(node),'RB_HTML_UNSUPPORTED');return node.children.map(inline).join('');
 };
 function render(node){
  if(node.tag==='p')return node.children.map(inline).join('')+'\n';
  const hasBlocks=node.children.some(block);
  if(hasBlocks){check(node.children.every(n=>block(n)||n.tag==='text'&&/^[\t \r\n]*$/.test(n.text)),'RB_HTML_UNSUPPORTED');return node.children.filter(block).map(render).join('');}
  return node.children.map(inline).join('')+(node.tag==='div'?'\n':'');
 }
 let result=render(root);if(root.children.some(block)&&result.endsWith('\n'))result=result.slice(0,-1);
 return normalizePlainReviewText(result);
}
export function normalizeReviewBody(body,messageFormat){
 check([1,2].includes(messageFormat),'RB_NORMALIZATION_UNSUPPORTED');
 const version=messageFormat===1?HTML_NORMALIZER:PLAIN_NORMALIZER,text=messageFormat===1?projectRestrictedReviewHtml(body):normalizePlainReviewText(body);
 return freeze({version,text,rawBodyHash:bytesDigest(Buffer.from(body,'utf8'))});
}
export const normalizedReviewContentHash=({version,title,body})=>bridgeHash('NORMALIZED-CONTENT',{version,title,body});
