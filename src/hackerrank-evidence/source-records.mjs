import {check,isSourceId} from './values.mjs';
import {parseSourceJson} from './source-json.mjs';

export const NESTED_RECORD_SHAPE='data-id-attributes-certificate.1';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const string=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max;

// Only for a source record captured in signed extractedParameters. This does
// not establish where that capture occurred: a separately reviewed recipe must
// bind it to the HTTP body/data array. Never feed an unsigned browser snapshot.
// All JSON syntax/keys are checked, but unused numbers are not interpreted.
// Signed request/parameters/context continue to use the existing strictJson.

// Fixed issuer mapping from the official Community reducer/title/catalog.
// No recursive search, cross-row metadata merge, or certificates[] fallback.
export function readNestedCertificateRecords(text){
 return projectNestedCertificateRows(parseSourceJson(text,{rejectRedaction:true}));
}
export function projectNestedCertificateRows(rows){
 check(Array.isArray(rows)&&rows.length<=32,'CERTIFICATE_RECORDS');
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
