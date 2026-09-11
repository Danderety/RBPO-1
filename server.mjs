import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(process.env.LAB_DATA || path.join(ROOT, 'data'));
mkdirSync(path.join(DATA, 'public'), {recursive:true});
mkdirSync(path.join(DATA, 'uploads'), {recursive:true});
writeFileSync(path.join(DATA, 'secret.txt'), 'LAB_ONLY_WAREHOUSE_KEY=demo-warehouse-42');
writeFileSync(path.join(DATA, 'public', 'receipt.txt'), 'Faultline demo receipt');
const db = new DatabaseSync(path.join(DATA, 'shop.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE, password TEXT, role TEXT, name TEXT);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, name TEXT, category TEXT, price INTEGER, glyph TEXT);
CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY, product_id INTEGER, body TEXT);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY, user_id INTEGER, total REAL, address TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER);
CREATE TABLE IF NOT EXISTS lab_logs(id INTEGER PRIMARY KEY, message TEXT);
CREATE TABLE IF NOT EXISTS coupons(code TEXT PRIMARY KEY, discount INTEGER);`);
if(!db.prepare('PRAGMA table_info(orders)').all().some(c=>c.name==='status')) db.exec("ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'new'");
if(!db.prepare('PRAGMA table_info(orders)').all().some(c=>c.name==='items')) db.exec("ALTER TABLE orders ADD COLUMN items TEXT DEFAULT '[]'");
if(!db.prepare('PRAGMA table_info(products)').all().some(c=>c.name==='stock')) db.exec("ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 5");
if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
  db.exec(`INSERT INTO users VALUES(1,'alice@lab.test','alice123','customer','Алиса'),(2,'bob@lab.test','bob123','customer','Борис'),(3,'admin@lab.test','admin123','admin','Администратор');
  INSERT INTO products(id,name,category,price,glyph) VALUES(1,'Механическая клавиатура','Рабочее место',8900,'⌨'),(2,'Студийные наушники','Аудио',12400,'♫'),(3,'Настольный микрофон','Аудио',6700,'◉'),(4,'USB-C концентратор','Аксессуары',3900,'⊞'),(5,'Монитор 27 дюймов','Рабочее место',24900,'▣'),(6,'Портативный SSD','Аксессуары',7400,'▤');
  INSERT INTO orders(id,user_id,total,address) VALUES(1,1,8900,'Учебная улица, 1'),(2,2,12400,'Демо-переулок, 2');
  INSERT INTO reviews(product_id,body) VALUES(1,'Приятный звук клавиш. Для рабочего стола — отлично.');`);
}
db.prepare('INSERT OR IGNORE INTO coupons(code,discount) VALUES(?,?)').run('WELCOME500',500);
const PORT = Number(process.env.PORT || 3000);
const INTERNAL_PORT = Number(process.env.INTERNAL_PORT || 3001);
const origin = `http://127.0.0.1:${PORT}`;
function send(res, status, value, type='application/json; charset=utf-8') {
  // LAB: technology fingerprint and missing security/cache headers.
  res.setHeader('X-Powered-By','Faultline Node Training Server');
  res.writeHead(status, {'Content-Type':type});
  res.end(typeof value === 'string' ? value : JSON.stringify(value));
}
async function body(req) {
  let text=''; for await (const chunk of req) {text+=chunk; if(text.length>100000) throw Error('Body too large');}
  return (req.headers['content-type'] || '').includes('application/json') ? JSON.parse(text || '{}') : Object.fromEntries(new URLSearchParams(text));
}
function user(req) {
  const token = /(?:^|;\s*)session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
  return db.prepare('SELECT users.* FROM users JOIN sessions ON users.id=sessions.user_id WHERE token=?').get(token || '');
}
const internal = http.createServer((req,res)=>send(res,200,{service:'warehouse',key:'LAB_ONLY_INTERNAL_KEY_42'}));
const server = http.createServer(async(req,res)=>{
  try {
    // Containment boundary is independent of intentionally vulnerable routes.
    if(req.headers.host !== `127.0.0.1:${PORT}`) return send(res,403,{error:'Use the exact loopback URL'});
    if(req.headers.origin && req.headers.origin!==origin) return send(res,403,{error:'External origins are blocked; CSRF demo runs inside the lab'});
    const u=new URL(req.url,origin), p=u.pathname;
    const b=['POST','PATCH','PUT'].includes(req.method) ? await body(req) : {};
    if(req.method==='OPTIONS' && p==='/api') {
      // LAB: verbose API discovery discloses hidden routes and a fixture debug key.
      return send(res,200,{methods:['GET','POST','PUT','DELETE'],hidden:['/api/internal/stats','/api/v1/admin/users','/api/orders/delete'],debugKey:'LAB_OPTIONS_KEY'});
    }
    if(p==='/api/health') return send(res,200,{lab:'faultline-local-only',version:1});
    if(p==='/api/internal/stats') {
      // LAB: trusts a client-controlled proxy header as proof of internal origin.
      if(!(req.headers['x-forwarded-for']||'').startsWith('127.0.0.1')) return send(res,403,{error:'Internal clients only'});
      return send(res,200,{orders:db.prepare('SELECT COUNT(*) AS count FROM orders').get().count,warehouseKey:'LAB_XFF_INTERNAL_KEY'});
    }
    if(p==='/api/products') {
      // LAB: SQL-INJECTION — intentionally concatenated search.
      return send(res,200,db.prepare(`SELECT * FROM products WHERE name LIKE '%${u.searchParams.get('q') || ''}%'`).all());
    }
    if(p==='/api/report') {
      // LAB: SQL expression injection. The response is limited to fixture users.
      const field=u.searchParams.get('field') || 'email';
      return send(res,200,db.prepare(`SELECT ${field} AS value FROM users LIMIT 10`).all());
    }
    if(p==='/api/order-search') {
      // LAB: SQL predicate injection in an authenticated order filter.
      const me=user(req); if(!me) return send(res,401,{error:'Войдите в аккаунт'});
      const status=u.searchParams.get('status') || 'new';
      return send(res,200,db.prepare(`SELECT * FROM orders WHERE user_id=${me.id} AND status='${status}'`).all());
    }
    if(p==='/api/login' && req.method==='POST') {
      // LAB: SQL-INJECTION, PLAINTEXT-PASSWORD, NO-RATE-LIMIT, PREDICTABLE-SESSION.
      const account=db.prepare(`SELECT * FROM users WHERE email='${b.email}' AND password='${b.password}'`).get();
      if(!account) return send(res,401,{error:'Неверный логин или пароль'});
      const token=`lab-session-${account.id}`;
      db.prepare('INSERT OR REPLACE INTO sessions VALUES(?,?)').run(token,account.id);
      res.setHeader('Set-Cookie',`session=${token}; Path=/; SameSite=Lax`);
      return send(res,200,account);
    }
    if(p==='/api/register' && req.method==='POST') {
      if(!b.email || !b.password) return send(res,400,{error:'Заполните email и пароль'});
      // LAB: registration accepts a privileged role and a one-character password.
      const result=db.prepare('INSERT INTO users(email,password,role,name) VALUES(?,?,?,?)').run(String(b.email),String(b.password),String(b.role || 'customer'),String(b.name || 'Покупатель'));
      return send(res,201,{id:Number(result.lastInsertRowid)});
    }
    if(p==='/api/logout') {res.setHeader('Set-Cookie','session=; Max-Age=0; Path=/'); return send(res,200,{ok:true});}
    if(p==='/api/me' && req.method==='GET') return send(res,200,user(req) || null);
    if(p==='/api/profile' && req.method==='POST') {
      const me=user(req); if(!me) return send(res,401,{error:'Войдите в аккаунт'});
      // LAB: MASS-ASSIGNMENT.
      db.prepare('UPDATE users SET name=?,role=? WHERE id=?').run(b.name || me.name,b.role || me.role,me.id);
      return send(res,200,user(req));
    }
    if(p==='/api/orders') {const me=user(req); if(!me) return send(res,401,{error:'Войдите в аккаунт'}); return send(res,200,db.prepare('SELECT * FROM orders WHERE user_id=?').all(me.id));}
    if(/^\/api\/orders\/\d+$/.test(p)) {
      if(!user(req)) return send(res,401,{error:'Войдите в аккаунт'});
      // LAB: IDOR — missing ownership check.
      return send(res,200,db.prepare('SELECT * FROM orders WHERE id=?').get(Number(p.split('/').pop())) || null);
    }
    if(p==='/api/orders/delete' && req.method==='POST') {
      // LAB: method override is trusted, and the alternate path skips authorization.
      if(req.headers['x-http-method-override']!=='DELETE') return send(res,405,{error:'Use DELETE'});
      const result=db.prepare('DELETE FROM orders WHERE id=?').run(Number(b.id));return send(res,200,{deleted:Number(result.changes)});
    }
    if(p==='/api/checkout' && req.method==='POST') {
      const me=user(req); if(!me) return send(res,401,{error:'Войдите в аккаунт'});
      // LAB: PRICE-TAMPERING — trusts the client, including negative totals.
      const result=db.prepare('INSERT INTO orders(user_id,total,address,items) VALUES(?,?,?,?)').run(me.id,Number(b.total),String(b.address || 'Демо-адрес'),JSON.stringify(b.items || []));
      return send(res,200,{id:Number(result.lastInsertRowid),total:Number(b.total)});
    }
    if(p==='/api/coupon' && req.method==='POST') {
      const me=user(req); if(!me) return send(res,401,{error:'Войдите в аккаунт'});
      // LAB: coupon has no per-user use counter and trusts the client subtotal.
      const coupon=db.prepare('SELECT * FROM coupons WHERE code=?').get(String(b.code || ''));
      if(!coupon) return send(res,404,{error:'Купон не найден'});
      return send(res,200,{total:Number(b.subtotal)-coupon.discount,discount:coupon.discount});
    }
    if(p==='/api/address') {
      const me=user(req); if(!me) return send(res,401,{error:'Войдите в аккаунт'});
      // LAB: CSRF — state mutation by GET without token; same-origin demonstration.
      db.prepare('UPDATE orders SET address=? WHERE user_id=?').run(u.searchParams.get('value') || '',me.id);
      return send(res,200,{ok:true});
    }
    if(p==='/api/reviews' && req.method==='GET') return send(res,200,db.prepare('SELECT * FROM reviews').all());
    if(p==='/api/reviews' && req.method==='POST') {db.prepare('INSERT INTO reviews(product_id,body) VALUES(?,?)').run(Number(b.product_id || 1),String(b.body)); return send(res,200,{ok:true});}
    if(p==='/api/reviews/delete' && req.method==='POST') {const result=db.prepare('DELETE FROM reviews WHERE id=?').run(Number(b.id));return send(res,200,{deleted:Number(result.changes)});} // LAB: no ownership/admin check.
    if(p==='/api/export/reviews.csv') {
      // LAB: CSV/formula injection — cells are quoted but spreadsheet formulas are not neutralized.
      const rows=db.prepare('SELECT id,body FROM reviews').all();
      const csv='id,body\n'+rows.map(r=>`${r.id},"${String(r.body).replaceAll('"','""')}"`).join('\n');
      return send(res,200,csv,'text/csv; charset=utf-8');
    }
    if(p==='/api/log' && req.method==='POST') {db.prepare('INSERT INTO lab_logs(message) VALUES(?)').run(String(b.message || ''));return send(res,200,{ok:true});} // LAB: CRLF/log forging.
    if(p==='/api/logs') return send(res,200,db.prepare('SELECT * FROM lab_logs ORDER BY id').all());
    if(p==='/search') return send(res,200,`<!doctype html><meta charset="utf-8"><h1>Результаты: ${u.searchParams.get('q') || ''}</h1>`,'text/html; charset=utf-8'); // LAB: REFLECTED-XSS.
    if(p==='/api/download') {
      const file=path.resolve(DATA,'public',u.searchParams.get('file') || 'receipt.txt');
      // LAB: PATH-TRAVERSAL inside fixture directory; real host files stay out of scope.
      if(!file.startsWith(DATA+path.sep)) return send(res,403,{error:'Outside lab fixture'});
      return send(res,200,readFileSync(file,'utf8'),'text/plain; charset=utf-8');
    }
    if(p==='/api/upload' && req.method==='POST') {
      const name=path.basename(String(b.name || 'note.html'));
      if(!/^[a-zA-Z0-9_-]+\.(html|txt)$/.test(name)) return send(res,400,{error:'Lab accepts html/txt filenames only'});
      // LAB: ACTIVE-UPLOAD — HTML served from application origin.
      writeFileSync(path.join(DATA,'uploads',name),String(b.content || ''));
      return send(res,200,{url:`/uploads/${name}`});
    }
    if(p==='/api/uploads') return send(res,200,readdirSync(path.join(DATA,'uploads'))); // LAB: unauthenticated file enumeration.
    if(p.startsWith('/uploads/')) return send(res,200,readFileSync(path.join(DATA,'uploads',path.basename(p)),'utf8'),p.endsWith('.html')?'text/html; charset=utf-8':'text/plain');
    if(p==='/backup/users.json') return send(res,200,db.prepare('SELECT * FROM users').all()); // LAB: public sensitive backup.
    if(p==='/api/import') {
      const target=new URL(u.searchParams.get('url'));
      // LAB: SSRF reaches a mock internal service. No arbitrary network egress.
      if(target.origin!==`http://127.0.0.1:${INTERNAL_PORT}` || target.username || target.password) return send(res,403,{error:'Only the mock warehouse is in scope'});
      const response=await fetch(target,{redirect:'error',signal:AbortSignal.timeout(2000)});
      return send(res,200,await response.text());
    }
    if(p==='/api/admin/users') return send(res,200,db.prepare('SELECT * FROM users').all()); // LAB: MISSING-AUTHORIZATION, EXCESSIVE-DATA.
    if(p==='/api/v1/admin/users') return send(res,200,db.prepare('SELECT id,email,password,role FROM users').all()); // LAB: legacy API version bypasses the intended admin UI.
    if(/^\/api\/users\/\d+$/.test(p)) return send(res,200,db.prepare('SELECT * FROM users WHERE id=?').get(Number(p.split('/').pop())) || null); // LAB: anonymous user object access.
    if(p==='/api/admin/orders' && req.method==='GET') return send(res,200,db.prepare('SELECT orders.*,users.email FROM orders JOIN users ON orders.user_id=users.id ORDER BY orders.id DESC').all());
    if(p==='/api/admin/export-orders') return send(res,200,db.prepare('SELECT orders.*,users.email FROM orders JOIN users ON orders.user_id=users.id').all()); // LAB: separate export lacks authorization.
    if(p==='/api/admin/orders' && req.method==='POST') {
      // LAB: MISSING-AUTHORIZATION and unrestricted status transitions.
      const result=db.prepare('UPDATE orders SET status=? WHERE id=?').run(String(b.status),Number(b.id));
      return send(res,200,{updated:Number(result.changes)});
    }
    if(p==='/api/admin/products' && req.method==='POST') {
      // LAB: missing server-side role check, catalog price tampering.
      db.prepare('UPDATE products SET name=?,price=? WHERE id=?').run(String(b.name),Number(b.price),Number(b.id));
      return send(res,200,{ok:true});
    }
    if(p==='/api/reset-password' && req.method==='POST') {
      // LAB: PASSWORD-RESET — email is treated as sufficient proof of identity.
      db.prepare('UPDATE users SET password=? WHERE email=?').run(String(b.password),String(b.email));
      return send(res,200,{ok:true});
    }
    if(p==='/api/debug') return send(res,200,{db:path.join(DATA,'shop.sqlite'),paymentKey:'LAB_FAKE_PAYMENT_KEY',environment:'training'}); // LAB: SECRET-EXPOSURE.
    if(p==='/api/error') db.prepare('SELECT * FROM missing_table').all(); // LAB: VERBOSE-ERROR.
    if(p==='/redirect') {res.writeHead(302,{Location:u.searchParams.get('next') || '/'});return res.end();} // LAB: open redirect.
    if(p==='/lab/csrf') return send(res,200,'<!doctype html><meta charset="utf-8"><h1>Учебная CSRF-страница</h1><p>Открытие страницы меняет адрес заказов вошедшего пользователя.</p><img src="/api/address?value=CSRF-DEMO" alt="Учебный запрос">','text/html; charset=utf-8');
    if(p==='/' || p==='/app.js' || p==='/style.css') {
      const name=p==='/'?'index.html':p.slice(1);
      return send(res,200,readFileSync(path.join(ROOT,'public',name),'utf8'),name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8');
    }
    send(res,404,{error:'Not found'});
  } catch(error) {send(res,500,{error:error.message,stack:error.stack});} // LAB: VERBOSE-ERROR.
});
internal.on('error',error=>{console.error(error); process.exit(1);});
server.on('error',error=>{console.error(error); internal.close(); process.exit(1);});
internal.listen(INTERNAL_PORT,'127.0.0.1',()=>server.listen(PORT,'127.0.0.1',()=>console.log(`Faultline Shop: ${origin}`)));
function stop(){server.close(); internal.close(); db.close();}
process.on('SIGTERM',()=>{stop();process.exit(0);});
process.on('SIGINT',()=>{stop();process.exit(0);});
