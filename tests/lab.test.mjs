import {test} from 'node:test';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {verify} from '../scripts/verify.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('isolated lab scenarios and containment boundaries',{timeout:30000},async()=>{
  const data=mkdtempSync(path.join(tmpdir(),'faultline-test-'));
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,LAB_DATA:data,PORT:'3100',INTERNAL_PORT:'3101'},stdio:['ignore','pipe','pipe']});
  let errors='';child.stderr.on('data',b=>errors+=b);let ready=false;
  try {
    for(let i=0;i<80;i++){if(child.exitCode!==null)throw Error(errors);try{const r=await fetch('http://127.0.0.1:3100/api/health');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
    if(!ready)throw Error('Server did not start: '+errors);
    await verify('http://127.0.0.1:3100',3101);
  } finally {
    if(child.exitCode===null){const exited=once(child,'exit');child.kill();await exited;}
    if(path.dirname(data)!==tmpdir()||!path.basename(data).startsWith('faultline-test-'))throw Error('Invalid cleanup path');
    rmSync(data,{recursive:true,force:true});
  }
});
