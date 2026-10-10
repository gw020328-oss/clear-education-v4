// Frozen arm A: structure only. No language interpretation, ground-truth access or model calls.
export function validateSchema(value, schema, path='$') {
  const errors=[];
  const type=v=>v===null?'null':Array.isArray(v)?'array':typeof v;
  const fail=rule=>errors.push({path,rule});
  if(schema.type && ![].concat(schema.type).includes(type(value))) { fail('type'); return errors; }
  if(schema.enum && !schema.enum.some(v=>JSON.stringify(v)===JSON.stringify(value)))fail('enum');
  if(typeof value==='string') {
    if(schema.pattern && !(new RegExp(schema.pattern)).test(value))fail('pattern');
    if(schema.minLength!==undefined && value.length<schema.minLength)fail('minLength');
  }
  if(typeof value==='number') {
    if(!Number.isFinite(value))fail('finite');
    if(schema.minimum!==undefined && value<schema.minimum)fail('minimum');
    if(schema.maximum!==undefined && value>schema.maximum)fail('maximum');
  }
  if(Array.isArray(value)) {
    if(schema.uniqueItems && new Set(value.map(v=>JSON.stringify(v))).size!==value.length)fail('uniqueItems');
    if(schema.items)value.forEach((v,i)=>errors.push(...validateSchema(v,schema.items,`${path}[${i}]`)));
  } else if(value && typeof value==='object') {
    for(const k of schema.required??[])if(!Object.hasOwn(value,k))errors.push({path:path+'.'+k,rule:'required'});
    for(const [k,v] of Object.entries(value)) {
      if(schema.properties?.[k])errors.push(...validateSchema(v,schema.properties[k],path+'.'+k));
      else if(schema.additionalProperties===false)errors.push({path:path+'.'+k,rule:'additionalProperties'});
    }
  }
  return errors;
}
