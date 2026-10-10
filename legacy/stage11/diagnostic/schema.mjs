// Deliberately bounded JSON Schema subset used by the frozen diagnostic only.
export function validate(value,schema,path='$') {
 const errors=[],type=value===null?'null':Array.isArray(value)?'array':typeof value;
 const add=rule=>errors.push({path,rule});
 if(schema.type&&!([].concat(schema.type)).includes(type)){add('type');return errors;}
 if(schema.enum&&!schema.enum.some(x=>JSON.stringify(x)===JSON.stringify(value)))add('enum');
 if(type==='number'&&!Number.isFinite(value))add('finite');
 if(type==='string'&&schema.minLength!==undefined&&value.length<schema.minLength)add('minLength');
 if(type==='array'){
  if(schema.maxItems!==undefined&&value.length>schema.maxItems)add('maxItems');
  if(schema.uniqueItems&&new Set(value.map(JSON.stringify)).size!==value.length)add('uniqueItems');
  value.forEach((v,i)=>errors.push(...validate(v,schema.items,`${path}[${i}]`)));
 }else if(type==='object'){
  for(const k of schema.required??[])if(!Object.hasOwn(value,k))errors.push({path:path+'.'+k,rule:'required'});
  for(const [k,v]of Object.entries(value))if(schema.properties?.[k])errors.push(...validate(v,schema.properties[k],path+'.'+k));else if(schema.additionalProperties===false)errors.push({path:path+'.'+k,rule:'additionalProperties'});
 }
 return errors;
}
