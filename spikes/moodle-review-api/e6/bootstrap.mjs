import {mkdir,writeFile,stat,chmod} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),dir=root+'var/moodle-e6/';
const exists=p=>stat(p).then(()=>true,()=>false);
if(await exists(dir+'local-instance.json')||await exists(dir+'moodle/config.php'))throw Error('NO_EXISTING_LAB_REUSE');
for(const [kind,args] of [['CONTAINER',['ps','-a']],['VOLUME',['volume','ls']]]){
 if(execFileSync('docker',[...args,'--filter','label=com.docker.compose.project=clear-moodle-e6-20261018','--format',kind==='VOLUME'?'{{.Name}}':'{{.ID}}'],{encoding:'utf8'}).trim())throw Error('EXISTING_'+kind);
}
await mkdir(dir,{recursive:true,mode:0o700});await chmod(dir,0o700);
const pw=()=>'Aa1!'+randomBytes(24).toString('hex'),s={dbPassword:pw(),adminPassword:pw(),learnerPassword:pw()};
await writeFile(dir+'secrets.json',JSON.stringify(s),{mode:0o600});
await writeFile(dir+'db.env',`POSTGRES_DB=moodle\nPOSTGRES_USER=moodle\nPOSTGRES_PASSWORD=${s.dbPassword}\n`,{mode:0o600});
await writeFile(dir+'local-instance.json',JSON.stringify({project:'clear-moodle-e6-20261018',port:18768}),{mode:0o600});
await writeFile(dir+'moodle/config.php',`<?php
unset($CFG);global $CFG;$CFG=new stdClass();
$CFG->dbtype='pgsql';$CFG->dblibrary='native';$CFG->dbhost='db';$CFG->dbname='moodle';$CFG->dbuser='moodle';
$CFG->dbpass=trim(file_get_contents('/var/moodledata/lab-db-secret'));$CFG->prefix='mdl_';
$CFG->dboptions=['dbpersist'=>false,'dbport'=>5432,'dbsocket'=>'','dbcollation'=>''];
$CFG->wwwroot='http://127.0.0.1:18768';$CFG->dataroot='/var/moodledata';$CFG->admin='admin';$CFG->directorypermissions=02770;
$CFG->debug=0;$CFG->debugdisplay=0;require_once(__DIR__.'/lib/setup.php');\n`);
function run(args){try{return execFileSync('docker',['compose','-f',root+'spikes/moodle-review-api/e6/compose.yml',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024});}catch{throw Error('BC_LAB_BOOTSTRAP_FAILED_NO_RAW_LOG');}}
run(['up','-d']);console.log('BC_LAB_CONTAINERS_STARTED');
run(['exec','-T','web','php','/lab-scripts/install.php']);
run(['exec','-T','web','php','/lab-scripts/setup.php']);console.log('BC_LAB_LAB_READY');
