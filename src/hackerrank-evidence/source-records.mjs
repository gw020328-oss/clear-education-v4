import {check,isSourceId} from './values.mjs';

export const NESTED_RECORD_SHAPE='data-id-attributes-certificate.1';
const NUMBER=Symbol('unused-source-number');
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const string=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max;

// Only for a source record captured in signed extractedParameters. This does
// not establish where that capture occurred: a separately reviewed recipe must
// bind it to the HTTP body/data array. Never feed an unsigned browser snapshot.
// All JSON syntax/keys are checked, but unused numbers are not interpreted.
// Signed request/parameters/context continue to use the existing strictJson.
function sourceJson(text){
 check(typeof text==='string'&&Buffer.byteLength(text)<=65536,'SOURCE_JSON_LIMIT');
 // A masked fragment cannot stand in for a complete source record. This also
 // conservatively rejects literal asterisks; no mask stripping is performed.
 check(!text.includes('*'),'SOURCE_RECORD_REDACTED');
 let i=0,nodes=0;
 const ws=()=>{while(/[ \r\n\t]/.test(text[i]??'x'))i++;};
 function quoted(){
  check(text[i]==='"','SOURCE_JSON');const start=i++;
  while(i<text.length){
   if(text[i]==='\\'){i+=2;continue;}
   if(text[i++]==='"'){
    try{return JSON.parse(text.slice(start,i));}catch{check(false,'SOURCE_JSON');}
   }
  }
  check(false,'SOURCE_JSON');
 }
 function value(depth){
  check(depth<=24&&++nodes<=4096,'SOURCE_JSON_LIMIT');ws();
  if(text[i]==='"')return quoted();
  if(text[i]==='{'||text[i]==='['){
   const isObject=text[i++]==='{',end=isObject?'}':']',out=isObject?Object.create(null):[],seen=new Set();
   ws();if(text[i]===end){i++;return out;}
   for(;;){
    let key;
    if(isObject){key=quoted();check(!seen.has(key)&&!['__proto__','constructor','prototype'].includes(key),'SOURCE_JSON_KEY');seen.add(key);ws();check(text[i++]===':','SOURCE_JSON');}
    const child=value(depth+1);if(isObject)out[key]=child;else out.push(child);
    ws();if(text[i]===end){i++;return out;}check(text[i++]==',','SOURCE_JSON');ws();
   }
  }
  for(const [token,result] of [['true',true],['false',false],['null',null]])if(text.startsWith(token,i)){i+=token.length;return result;}
  const number=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(i));
  check(number,'SOURCE_JSON');i+=number[0].length;return NUMBER;
 }
 const result=value(0);ws();check(i===text.length,'SOURCE_JSON');return result;
}

// Fixed issuer mapping from the official Community reducer/title/catalog.
// No recursive search, cross-row metadata merge, or certificates[] fallback.
export function readNestedCertificateRecords(text){
 const rows=sourceJson(text);check(Array.isArray(rows)&&rows.length<=32,'CERTIFICATE_RECORDS');
 return rows.map(row=>{
  check(object(row)&&isSourceId(row.id)&&object(row.attributes),'CERTIFICATE_RECORD_SHAPE');
  const a=row.attributes,c=a.certificate;
  check(!Object.hasOwn(a,'certificateId'),'CERTIFICATE_SHADOW_ID');
  check(isSourceId(a.username)&&string(a.status,32)&&isSourceId(a.test_unique_id),'CERTIFICATE_FIELDS');
  check(object(c)&&string(c.label,100)&&string(c.level,50)&&isSourceId(c.track_slug),'CERTIFICATE_METADATA');
  const target=c.label==='Python'&&c.level==='Basic'&&c.track_slug==='python_basic';
  check(target||!(c.label==='Python'&&c.level==='Basic'||c.track_slug==='python_basic'),'CERTIFICATE_METADATA_CONFLICT');
  // certificate.unique_id is not established as a test ID by the issuer
  // contract. The metadata is joined by being inside this signed row itself.
  return {username:a.username,certificate_id:row.id,certificate_name:target?'Python (Basic)':'OTHER',status:a.status};
 });
}
