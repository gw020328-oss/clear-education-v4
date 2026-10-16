// Downloads only public universal setup data; no proof or witness input accepted.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const CRS=[
  ['bn254_g1.dat','g1.dat',16777280,'8f5cd75519c2e995fa47aa7ecd7b213b9ae13824bc4b0f15025a63acd8c139eb'],
  ['bn254_g2.dat','g2.dat',128,'01797bfc4de5a96f0e516a9ea4537d18786dc30cb991aca4274c95822b69c32f'],
];
export async function checkCrs(){for(const [name,,length,hash] of CRS){const bytes=await readFile(new URL('./artifacts/crs/'+name,import.meta.url));if(bytes.length!==length||createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('CRS_HASH');}}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  await mkdir(new URL('./artifacts/crs/',import.meta.url),{recursive:true});
  for(const [name,path,length,hash] of CRS){
    const response=await fetch('https://aztec-ignition.s3.amazonaws.com/MAIN%20IGNITION/flat/'+path,{method:'GET',headers:{Range:`bytes=0-${length-1}`},credentials:'omit',redirect:'error',signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw Error('CRS_DOWNLOAD');const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length!==length||createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('CRS_HASH');
    await writeFile(new URL('./artifacts/crs/'+name,import.meta.url),bytes);
  }await checkCrs();console.log('PUBLIC_CRS_PINNED');
}
