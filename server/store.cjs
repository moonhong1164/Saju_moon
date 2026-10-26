const {DatabaseSync}=require('node:sqlite');
const crypto=require('node:crypto');
const PRODUCT=require('./product.cjs');
const {todayKst}=require('../src/saju.cjs');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const sourceValue=v=>typeof v==='string'&&/^[a-z0-9_-]{1,40}$/.test(v)?v:'direct';
function createStore(filename,{encryptionKey}={}){
 let key;
 if(encryptionKey){key=Buffer.from(encryptionKey,'base64');if(key.length!==32)throw new Error('ORDER_DATA_KEY must be a base64-encoded 32-byte key.');}
 function encode(value){if(!key)return value;const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return 'enc1:'+Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64');}
 function decode(value){if(!value?.startsWith('enc1:'))return value;if(!key)throw new Error('Encrypted order data requires ORDER_DATA_KEY.');const b=Buffer.from(value.slice(5),'base64'),d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8');}
 const db=new DatabaseSync(filename);db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;');
 db.exec(`CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, email TEXT NOT NULL, input TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending_payment', payment_key TEXT, created INTEGER NOT NULL, paid_at INTEGER, next_attempt INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, lease_until INTEGER DEFAULT 0, mail_id TEXT, pdf BLOB, consent_version TEXT NOT NULL, mode TEXT NOT NULL); CREATE UNIQUE INDEX IF NOT EXISTS unique_payment ON orders(payment_key) WHERE payment_key IS NOT NULL;`);
 const columns=new Set(db.prepare('PRAGMA table_info(orders)').all().map(x=>x.name));
 for(const [name,type] of Object.entries({last_error:'TEXT',report_json:'TEXT',report_kind:"TEXT DEFAULT 'rules'",source:"TEXT DEFAULT 'direct'",campaign:"TEXT DEFAULT 'direct'",refund_state:'TEXT',refund_reason:'TEXT',mail_epoch:'INTEGER DEFAULT 0',delivery_started:'INTEGER DEFAULT 0'}))if(!columns.has(name))db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${type}`);
 db.exec(`CREATE TABLE IF NOT EXISTS traffic(day TEXT, mode TEXT, page TEXT, source TEXT, campaign TEXT, views INTEGER DEFAULT 0, PRIMARY KEY(day,mode,page,source,campaign));
 CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY, mode TEXT, amount INTEGER, created INTEGER, paid_at INTEGER, refunded_at INTEGER, source TEXT, campaign TEXT);
 CREATE TABLE IF NOT EXISTS tickets(id TEXT PRIMARY KEY,order_id TEXT,created INTEGER,kind TEXT,message TEXT,status TEXT DEFAULT 'open',reply TEXT);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,order_id TEXT,action TEXT,created INTEGER);
 CREATE TABLE IF NOT EXISTS settings(mode TEXT PRIMARY KEY,costs TEXT);
 CREATE TABLE IF NOT EXISTS admin_account(id INTEGER PRIMARY KEY CHECK(id=1),username TEXT NOT NULL,password_hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS admin_sessions(token_hash TEXT PRIMARY KEY,username TEXT NOT NULL,csrf TEXT NOT NULL,expires INTEGER NOT NULL);`);
 db.exec(`INSERT OR IGNORE INTO ledger(id,mode,amount,created,paid_at,source,campaign) SELECT id,mode,19000,created,paid_at,source,campaign FROM orders;`);
 if(!key&&db.prepare("SELECT id FROM orders WHERE email LIKE 'enc1:%' LIMIT 1").get())throw new Error('ORDER_DATA_KEY is required for this existing encrypted database.');
 if(key){db.exec('BEGIN');try{for(const row of db.prepare('SELECT id,email,input,report_json,pdf,refund_reason FROM orders').all()){
  if(row.email.startsWith('enc1:'))decode(row.email);
  const encryptedPdf=row.pdf&&!Buffer.from(row.pdf).subarray(0,5).equals(Buffer.from('enc1:'))?Buffer.from(encode(Buffer.from(row.pdf).toString('base64'))):row.pdf;
  db.prepare('UPDATE orders SET email=?,input=?,report_json=?,pdf=?,refund_reason=? WHERE id=?').run(row.email.startsWith('enc1:')?row.email:encode(row.email),row.input.startsWith('enc1:')?row.input:encode(row.input),row.report_json&&!row.report_json.startsWith('enc1:')?encode(row.report_json):row.report_json,encryptedPdf,row.refund_reason&&!row.refund_reason.startsWith('enc1:')?encode(row.refund_reason):row.refund_reason,row.id);
 }for(const row of db.prepare('SELECT id,message,reply FROM tickets').all())db.prepare('UPDATE tickets SET message=?,reply=? WHERE id=?').run(row.message.startsWith('enc1:')?row.message:encode(row.message),row.reply&&!row.reply.startsWith('enc1:')?encode(row.reply):row.reply,row.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
 function unpack(row){if(!row)return null;const pdf=row.pdf?Buffer.from(row.pdf):null;return {...row,email:decode(row.email),input:JSON.parse(decode(row.input)),report:row.report_json?JSON.parse(decode(row.report_json)):null,pdf:pdf?.subarray(0,5).equals(Buffer.from('enc1:'))?Buffer.from(decode(pdf.toString()),'base64'):pdf};}
 function audit(id,action){db.prepare('INSERT INTO audit(order_id,action,created) VALUES(?,?,?)').run(id,action,Date.now());}
 const store={
  encrypted:!!key,
  adminAccount(){return db.prepare('SELECT username,password_hash FROM admin_account WHERE id=1').get()||null;},
  createAdmin(username,hash){return db.prepare('INSERT OR IGNORE INTO admin_account(id,username,password_hash) VALUES(1,?,?)').run(username,hash).changes===1;},
  saveAdminSession(token,username,csrf,expires){db.prepare('DELETE FROM admin_sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO admin_sessions(token_hash,username,csrf,expires) VALUES(?,?,?,?)').run(token,username,csrf,expires);},
  adminSession(token){return db.prepare('SELECT * FROM admin_sessions WHERE token_hash=? AND expires>?').get(token,Date.now())||null;},
  deleteAdminSession(token){db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(token);},
  changeAdminPassword(hash){db.exec('BEGIN');try{db.prepare('UPDATE admin_account SET password_hash=? WHERE id=1').run(hash);db.exec('DELETE FROM admin_sessions');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},
  create(input,email,mode='live',attribution={}){
   const id='sm_'+crypto.randomUUID().replaceAll('-',''),token=crypto.randomBytes(32).toString('hex'),now=Date.now(),source=sourceValue(attribution.source),campaign=sourceValue(attribution.campaign);
   db.exec('BEGIN');try{db.prepare('INSERT INTO orders(id,token_hash,email,input,created,consent_version,mode,source,campaign,report_kind) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,hash(token),encode(email),encode(JSON.stringify(input)),now,'2026-10-26-v2',mode,source,campaign,attribution.reportEngine==='ai'?'ai':'rules');
   db.prepare('INSERT INTO ledger(id,mode,amount,created,source,campaign) VALUES(?,?,?,?,?,?)').run(id,mode,PRODUCT.amount,now,source,campaign);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return {id,token};
  },
  get(id){return unpack(db.prepare('SELECT * FROM orders WHERE id=?').get(id));},
  auth(id,token){if(typeof token!=='string'||!/^\w{64}$/.test(token))return null;const row=db.prepare('SELECT token_hash,created FROM orders WHERE id=?').get(id);if(!row||row.created<Date.now()-30*86400000||!crypto.timingSafeEqual(Buffer.from(row.token_hash),Buffer.from(hash(token))))return null;return this.get(id);},
  paid(id,paymentKey){const now=Date.now();db.exec('BEGIN');try{db.prepare("UPDATE orders SET last_error=NULL,status='paid',payment_key=?,paid_at=?,delivery_started=?,next_attempt=0 WHERE id=? AND status='pending_payment'").run(paymentKey,now,now,id);db.prepare('UPDATE ledger SET paid_at=COALESCE(paid_at,?) WHERE id=?').run(now,id);audit(id,'payment_confirmed');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},
  claim(mode='live'){const now=Date.now();db.prepare("UPDATE orders SET status='delivery_failed' WHERE status='processing' AND lease_until<? AND attempts>=5").run(now);return unpack(db.prepare("UPDATE orders SET status='processing',lease_until=?,attempts=attempts+1 WHERE id=(SELECT id FROM orders WHERE mode=? AND (refund_state IS NULL OR refund_state='declined') AND (status='paid' OR (status='processing' AND lease_until<?)) AND next_attempt<=? AND attempts<5 ORDER BY paid_at LIMIT 1) RETURNING *").get(now+180000,mode,now,now));},
  report(id,report,kind){db.prepare('UPDATE orders SET report_json=?,report_kind=? WHERE id=?').run(encode(JSON.stringify(report)),kind,id);},
  pdf(id,pdf){db.prepare('UPDATE orders SET pdf=? WHERE id=?').run(key?Buffer.from(encode(pdf.toString('base64'))):pdf,id);},
  sent(id,mailId){db.prepare("UPDATE orders SET last_error=NULL,status='sent',mail_id=?,lease_until=0 WHERE id=?").run(mailId,id);audit(id,'mail_accepted');},
  failed(id,attempts,code='delivery_failed'){db.prepare("UPDATE orders SET status=?,next_attempt=?,lease_until=0,last_error=? WHERE id=?").run(attempts>=5?'delivery_failed':'paid',Date.now()+Math.min(60000*2**attempts,1800000),code,id);},
  error(id,code){db.prepare('UPDATE orders SET last_error=? WHERE id=?').run(code,id);},
  retry(id){const o=this.get(id);if(!o||!['sent','delivery_failed'].includes(o.status)||o.refund_state&&!['declined'].includes(o.refund_state))return false;db.prepare("UPDATE orders SET status='paid',attempts=0,next_attempt=0,lease_until=0,mail_epoch=mail_epoch+1,delivery_started=? WHERE id=?").run(Date.now(),id);audit(id,'resend_requested');return true;},
  ticket(id,kind,message){const ticketId=crypto.randomUUID();db.prepare('INSERT INTO tickets(id,order_id,created,kind,message) VALUES(?,?,?,?,?)').run(ticketId,id,Date.now(),kind,encode(message));return ticketId;},
  tickets(id){return db.prepare('SELECT * FROM tickets WHERE order_id=? ORDER BY created DESC').all(id).map(t=>({...t,message:decode(t.message),reply:t.reply?decode(t.reply):null}));},
  reply(ticketId,message){db.prepare("UPDATE tickets SET reply=?,status='answered' WHERE id=?").run(encode(message),ticketId);},
  requestRefund(id,reason){const o=this.get(id);if(!o||!o.paid_at||o.status==='refunded'||['requested','processing'].includes(o.refund_state))return false;db.prepare("UPDATE orders SET refund_state='requested',refund_reason=? WHERE id=?").run(encode(reason),id);this.ticket(id,'refund',reason);audit(id,'refund_requested');return true;},
  reserveRefund(id){const o=this.get(id);if(!o||!o.paid_at||o.status==='refunded'||o.status==='processing'&&o.lease_until>Date.now())return false;db.prepare("UPDATE orders SET refund_state='processing' WHERE id=?").run(id);audit(id,'refund_started');return true;},
  refunded(id){const now=Date.now();db.exec('BEGIN');try{db.prepare("UPDATE orders SET last_error=NULL,status='refunded',refund_state='refunded',pdf=NULL,report_json=NULL,lease_until=0 WHERE id=?").run(id);db.prepare('UPDATE ledger SET refunded_at=? WHERE id=?').run(now,id);db.prepare("UPDATE tickets SET status='answered',reply=? WHERE order_id=? AND kind='refund' AND status='open'").run(encode('전액 환불이 확인되었습니다. 카드사 반영에는 추가 시간이 걸릴 수 있습니다.'),id);audit(id,'refund_confirmed');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},
  declineRefund(id,message){db.prepare("UPDATE orders SET refund_state='declined' WHERE id=? AND refund_state='requested'").run(id);db.prepare("UPDATE tickets SET status='answered',reply=? WHERE order_id=? AND kind='refund' AND status='open'").run(encode(message),id);audit(id,'refund_declined');},
  visit(mode,page,source,campaign){db.prepare('INSERT INTO traffic(day,mode,page,source,campaign,views) VALUES(?,?,?,?,?,1) ON CONFLICT(day,mode,page,source,campaign) DO UPDATE SET views=views+1').run(todayKst(),mode,page,sourceValue(source),sourceValue(campaign));},
  summary(mode){
   const since=Date.now()-30*86400000;
   const ledger=db.prepare('SELECT * FROM ledger WHERE mode=? AND created>=? ORDER BY created DESC').all(mode,since);
   const traffic=db.prepare('SELECT * FROM traffic WHERE mode=? AND day>=? ORDER BY day DESC').all(mode,todayKst(new Date(since)));
   const orders=db.prepare('SELECT id,email,input,status,refund_state,source,campaign,report_kind,attempts,created,CASE WHEN pdf IS NOT NULL THEN 1 ELSE 0 END AS has_pdf FROM orders WHERE mode=? ORDER BY created DESC LIMIT 300').all(mode).map(unpack);
   const customers=new Set(orders.map(o=>o.email));
   const paid=ledger.filter(o=>o.paid_at),refunded=paid.filter(o=>o.refunded_at);
   const gross=paid.reduce((s,o)=>s+o.amount,0),refunds=refunded.reduce((s,o)=>s+o.amount,0);
   const saved=db.prepare('SELECT costs FROM settings WHERE mode=?').get(mode);
   const costs=saved?JSON.parse(saved.costs):null;
   const net=gross-refunds,estimated=costs?net-net*costs.feePercent/100-paid.length*costs.perReport-costs.monthly-costs.ads:null;
   return {periodDays:30,mode,totals:{orders:ledger.length,paid:paid.length,refunded:refunded.length,gross,refunds,net,customers:customers.size,landingViews:traffic.filter(t=>t.page==='landing').reduce((s,t)=>s+t.views,0),checkoutViews:traffic.filter(t=>t.page==='checkout').reduce((s,t)=>s+t.views,0),openTickets:db.prepare("SELECT COUNT(*) AS n FROM tickets t JOIN orders o ON t.order_id=o.id WHERE o.mode=? AND t.status='open'").get(mode).n},costs,estimatedProfit:estimated===null?null:Math.round(estimated),traffic,ledger,orders:orders.map(o=>({id:o.id,name:o.input.name,email:o.email,created:o.created,status:o.status,refundState:o.refund_state,source:o.source,campaign:o.campaign,reportKind:o.report_kind,attempts:o.attempts,hasPdf:!!o.has_pdf}))};
  },
  costs(mode,value){db.prepare('INSERT INTO settings(mode,costs) VALUES(?,?) ON CONFLICT(mode) DO UPDATE SET costs=excluded.costs').run(mode,JSON.stringify(value));},
  audit(id){return db.prepare('SELECT action,created FROM audit WHERE order_id=? ORDER BY created DESC').all(id);},
  cleanup(){db.prepare('DELETE FROM admin_sessions WHERE expires<?').run(Date.now());const cutoff=Date.now()-30*86400000;db.prepare('DELETE FROM tickets WHERE order_id IN (SELECT id FROM orders WHERE created<?)').run(cutoff);db.prepare('DELETE FROM orders WHERE created<?').run(cutoff);db.prepare('DELETE FROM traffic WHERE day<?').run(todayKst(new Date(cutoff)));db.prepare('DELETE FROM audit WHERE created<?').run(Date.now()-5*365*86400000);db.prepare('DELETE FROM ledger WHERE created<?').run(Date.now()-5*365*86400000);},
  close(){db.close();}
 };
 return store;
}
module.exports={createStore,sourceValue};
