import {existsSync,renameSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
try{const r=await fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(700)});if(r.ok){console.error('Stop the server before resetting.');process.exit(1);}}catch{}
const data=path.join(root,'data');
if(existsSync(data)){const backup=path.join(root,`data-backup-${Date.now()}`);renameSync(data,backup);console.log('Saved previous lab data to '+backup);}
console.log('Run npm start to create fresh demo data.');
