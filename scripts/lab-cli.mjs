import {existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DATA=path.join(ROOT,'data');
const COOKIE_FILE=path.join(DATA,'.cli-session');
const BASE='http://127.0.0.1:3000';
const [command,...args]=process.argv.slice(2);

function help(){
  console.log(`Faultline CLI — одинаковые команды для Windows PowerShell и Linux Bash

node scripts/lab-cli.mjs health
node scripts/lab-cli.mjs get /api/products
node scripts/lab-cli.mjs post /api/login '{"email":"alice@lab.test","password":"alice123"}'
node scripts/lab-cli.mjs raw POST /api/register 'email=text@lab.test&password=x&role=admin' Content-Type=text/plain
node scripts/lab-cli.mjs get /api/internal/stats X-Forwarded-For=127.0.0.1
node scripts/lab-cli.mjs cookie
node scripts/lab-cli.mjs logout

Формат raw: raw METHOD /path [body] [Header=Value ...]
Инструмент всегда обращается только к ${BASE}.`);
}
function savedCookie(){return existsSync(COOKIE_FILE)?readFileSync(COOKIE_FILE,'utf8').trim():'';}
function parseHeaders(values){const headers={};for(const item of values){const i=item.indexOf('=');if(i<1)throw Error(`Заголовок должен выглядеть Name=Value: ${item}`);headers[item.slice(0,i)]=item.slice(i+1);}return headers;}
async function request(method,route,requestBody='',extraHeaders={}){
  if(!route.startsWith('/')||route.startsWith('//'))throw Error('Маршрут должен начинаться с одного /');
  const url=new URL(route,BASE);if(url.origin!==BASE)throw Error('Разрешён только локальный стенд');
  const headers={...extraHeaders};const cookie=savedCookie();if(cookie)headers.Cookie=cookie;
  const options={method,headers,redirect:'manual'};if(requestBody!==''&&!['GET','HEAD'].includes(method))options.body=requestBody;
  console.log(`\n>>> ${method} ${url.pathname}${url.search}`);console.log('>>> HEADERS',headers);if(requestBody!=='')console.log('>>> BODY',requestBody);
  const response=await fetch(url,options);const text=await response.text();
  const setCookie=response.headers.get('set-cookie');if(setCookie){mkdirSync(DATA,{recursive:true});const token=setCookie.split(';')[0];if(token.endsWith('=')){if(existsSync(COOKIE_FILE))unlinkSync(COOKIE_FILE);}else writeFileSync(COOKIE_FILE,token);}
  console.log(`<<< STATUS ${response.status}`);for(const [name,value] of response.headers)console.log(`<<< ${name}: ${value}`);console.log('<<< BODY',text||'(empty)');
  return {status:response.status,text,headers:response.headers};
}

try{
  if(!command||command==='help'){help();}
  else if(command==='health')await request('GET','/api/health');
  else if(command==='get')await request('GET',args[0],'',parseHeaders(args.slice(1)));
  else if(command==='post')await request('POST',args[0],args[1]||'{}',{'Content-Type':'application/json',...parseHeaders(args.slice(2))});
  else if(command==='raw')await request(String(args[0]||'GET').toUpperCase(),args[1],args[2]||'',parseHeaders(args.slice(3)));
  else if(command==='login')await request('POST','/api/login',JSON.stringify({email:args[0],password:args[1]}),{'Content-Type':'application/json'});
  else if(command==='logout')await request('GET','/api/logout');
  else if(command==='cookie')console.log(savedCookie()||'(CLI cookie не сохранена)');
  else if(command==='reset-cookie'){if(existsSync(COOKIE_FILE))unlinkSync(COOKIE_FILE);console.log('CLI cookie удалена');}
  else {help();process.exitCode=2;}
}catch(error){console.error('ОШИБКА:',error.message);process.exitCode=1;}
