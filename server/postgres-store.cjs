const {Pool}=require('pg');
const crypto=require('node:crypto');
const PRODUCT=require('./product.cjs');
const LIMITS=require('./free-plan.cjs');
const {todayKst}=require('../src/saju.cjs');
const {sourceValue}=require('./store.cjs');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function poolOptions(connectionString){
 const url=new URL(connectionString);
 if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('DATABASE_URL must be a PostgreSQL connection string.');
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 // pg URL sslmode can override the explicit SSL options. Enforce certificate
 // and hostname verification for all non-loopback databases, including Neon.
 for(const name of ['sslmode','sslcert','sslkey','sslrootcert','channel_binding'])url.searchParams.delete(name);
 return {connectionString:url.toString(),ssl:local?false:{rejectUnauthorized:true},enableChannelBinding:!local,max:3,connectionTimeoutMillis:15000,idleTimeoutMillis:10000,allowExitOnIdle:true};
}
async function createPostgresStore({connectionString,encryptionKey,pool:providedPool}={}){
 const pool=providedPool||new Pool(poolOptions(connectionString));
 if(!providedPool)pool.on('error',()=>{});
 let key;if(encryptionKey){key=Buffer.from(encryptionKey,'base64');if(key.length!==32)throw new Error('ORDER_DATA_KEY must encode 32 bytes.');}
 const q=(sql,args=[])=>pool.query(sql,args);
 async function tx(fn){const c=await pool.connect();try{await c.query('BEGIN');const result=await fn((sql,args=[])=>c.query(sql,args));await c.query('COMMIT');return result;}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}}
 function encode(value){if(!key)return value;const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const b=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return 'enc1:'+Buffer.concat([iv,cipher.getAuthTag(),b]).toString('base64');}
 function decode(value){if(!value?.startsWith('enc1:'))return value;if(!key)throw new Error('Encrypted database requires the original encryption key.');const b=Buffer.from(value.slice(5),'base64'),d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8');}
 function unpack(row){if(!row)return null;const pdf=row.pdf?Buffer.from(row.pdf):null;return {...row,email:decode(row.email),input:JSON.parse(decode(row.input)),report:row.report_json?JSON.parse(decode(row.report_json)):null,pdf:pdf?.subarray(0,5).equals(Buffer.from('enc1:'))?Buffer.from(decode(pdf.toString()),'base64'):pdf};}
 try{await q(`CREATE SCHEMA IF NOT EXISTS sajumoon;
 CREATE TABLE IF NOT EXISTS sajumoon.orders(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL,email TEXT NOT NULL,input TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending_payment',payment_key TEXT UNIQUE,created DOUBLE PRECISION NOT NULL,paid_at DOUBLE PRECISION,next_attempt DOUBLE PRECISION DEFAULT 0,attempts INTEGER DEFAULT 0,lease_until DOUBLE PRECISION DEFAULT 0,mail_id TEXT,pdf BYTEA,consent_version TEXT NOT NULL,mode TEXT NOT NULL,last_error TEXT,report_json TEXT,report_kind TEXT DEFAULT 'rules',source TEXT DEFAULT 'direct',campaign TEXT DEFAULT 'direct',refund_state TEXT,refund_reason TEXT,mail_epoch INTEGER DEFAULT 0,delivery_started DOUBLE PRECISION DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sajumoon.traffic(day TEXT,mode TEXT,page TEXT,source TEXT,campaign TEXT,views INTEGER DEFAULT 0,PRIMARY KEY(day,mode,page,source,campaign));
 CREATE TABLE IF NOT EXISTS sajumoon.ledger(id TEXT PRIMARY KEY,mode TEXT,amount INTEGER,created DOUBLE PRECISION,paid_at DOUBLE PRECISION,refunded_at DOUBLE PRECISION,source TEXT,campaign TEXT);
 CREATE TABLE IF NOT EXISTS sajumoon.tickets(id TEXT PRIMARY KEY,order_id TEXT,created DOUBLE PRECISION,kind TEXT,message TEXT,status TEXT DEFAULT 'open',reply TEXT);
 CREATE TABLE IF NOT EXISTS sajumoon.audit(id BIGSERIAL PRIMARY KEY,order_id TEXT,action TEXT,created DOUBLE PRECISION);
 CREATE TABLE IF NOT EXISTS sajumoon.settings(mode TEXT PRIMARY KEY,costs TEXT);
 CREATE TABLE IF NOT EXISTS sajumoon.admin_account(id INTEGER PRIMARY KEY CHECK(id=1),username TEXT NOT NULL,password_hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sajumoon.admin_sessions(token_hash TEXT PRIMARY KEY,username TEXT NOT NULL,csrf TEXT NOT NULL,expires DOUBLE PRECISION NOT NULL);`);
 // Fail at startup on a lost/changed key, before advertising readiness.
 const existing=(await q('SELECT email FROM sajumoon.orders LIMIT 1')).rows[0];if(existing)decode(existing.email);
 }catch(error){if(!providedPool)await pool.end();throw error;}
 const audit=(run,id,action)=>run('INSERT INTO sajumoon.audit(order_id,action,created) VALUES($1,$2,$3)',[id,action,Date.now()]);
 const store={
  encrypted:!!key,backend:'postgres',
  async health(){await q('SELECT 1');return true;},
  async adminAccount(){return (await q('SELECT username,password_hash FROM sajumoon.admin_account WHERE id=1')).rows[0]||null;},
  async createAdmin(username,hashed){return (await q('INSERT INTO sajumoon.admin_account(id,username,password_hash) VALUES(1,$1,$2) ON CONFLICT DO NOTHING',[username,hashed])).rowCount===1;},
  async saveAdminSession(token,username,csrf,expires){await q('DELETE FROM sajumoon.admin_sessions WHERE expires<$1',[Date.now()]);await q('INSERT INTO sajumoon.admin_sessions(token_hash,username,csrf,expires) VALUES($1,$2,$3,$4)',[token,username,csrf,expires]);},
  async adminSession(token){return (await q('SELECT * FROM sajumoon.admin_sessions WHERE token_hash=$1 AND expires>$2',[token,Date.now()])).rows[0]||null;},
  async deleteAdminSession(token){await q('DELETE FROM sajumoon.admin_sessions WHERE token_hash=$1',[token]);},
  async changeAdminPassword(hashed){await tx(async run=>{await run('UPDATE sajumoon.admin_account SET password_hash=$1 WHERE id=1',[hashed]);await run('DELETE FROM sajumoon.admin_sessions');});},
  async create(input,email,mode='live',attribution={}){
   const id='sm_'+crypto.randomUUID().replaceAll('-',''),token=crypto.randomBytes(32).toString('hex'),now=Date.now(),source=sourceValue(attribution.source),campaign=sourceValue(attribution.campaign);
   await tx(async run=>{if(mode==='trial'){await run("SELECT pg_advisory_xact_lock(hashtext('sajumoon-free-test-quota'))");const count=await run("SELECT (SELECT COUNT(*)::int FROM sajumoon.ledger WHERE mode='trial' AND created >= $1) AS daily,(SELECT COUNT(*)::int FROM sajumoon.orders WHERE mode='trial') AS retained",[Date.parse(todayKst()+'T00:00:00+09:00')]);if(count.rows[0].daily>=LIMITS.dailyOrders||count.rows[0].retained>=LIMITS.retainedOrders){const error=new Error('Free test quota reached.');error.code='SAJU_TRIAL_LIMIT';throw error;}}await run('INSERT INTO sajumoon.orders(id,token_hash,email,input,created,consent_version,mode,source,campaign,report_kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,hash(token),encode(email),encode(JSON.stringify(input)),now,'2026-10-26-v3',mode,source,campaign,attribution.reportEngine==='ai'?'ai':'rules']);await run('INSERT INTO sajumoon.ledger(id,mode,amount,created,source,campaign) VALUES($1,$2,$3,$4,$5,$6)',[id,mode,attribution.amount===0?0:PRODUCT.amount,now,source,campaign]);});return {id,token};
  },
  async get(id){return unpack((await q('SELECT * FROM sajumoon.orders WHERE id=$1',[id])).rows[0]);},
  async auth(id,token){if(typeof token!=='string'||!/^\w{64}$/.test(token))return null;const row=(await q('SELECT token_hash,created FROM sajumoon.orders WHERE id=$1',[id])).rows[0];if(!row||row.created<Date.now()-30*86400000||!crypto.timingSafeEqual(Buffer.from(row.token_hash),Buffer.from(hash(token))))return null;return this.get(id);},
  async paid(id,paymentKey){const now=Date.now();await tx(async run=>{const changed=await run("UPDATE sajumoon.orders SET last_error=NULL,status='paid',payment_key=$1,paid_at=$2,delivery_started=$2,next_attempt=0 WHERE id=$3 AND status='pending_payment' RETURNING id",[paymentKey,now,id]);if(changed.rowCount){await run('UPDATE sajumoon.ledger SET paid_at=COALESCE(paid_at,$1) WHERE id=$2',[now,id]);await audit(run,id,'payment_confirmed');}});},
  async claim(mode='live'){
   const now=Date.now();await q("UPDATE sajumoon.orders SET status='delivery_failed' WHERE status='processing' AND lease_until<$1 AND attempts>=5",[now]);
   const r=await q("WITH candidate AS (SELECT id FROM sajumoon.orders WHERE mode=$1 AND (refund_state IS NULL OR refund_state='declined') AND (status='paid' OR (status='processing' AND lease_until<$2)) AND next_attempt<=$2 AND attempts<5 ORDER BY paid_at LIMIT 1 FOR UPDATE SKIP LOCKED) UPDATE sajumoon.orders o SET status='processing',lease_until=$3,attempts=o.attempts+1 FROM candidate c WHERE o.id=c.id RETURNING o.*",[mode,now,now+180000]);return unpack(r.rows[0]);
  },
  async report(id,report,kind){await q('UPDATE sajumoon.orders SET report_json=$1,report_kind=$2 WHERE id=$3',[encode(JSON.stringify(report)),kind,id]);},
  async pdf(id,pdf){await q('UPDATE sajumoon.orders SET pdf=$1 WHERE id=$2',[key?Buffer.from(encode(pdf.toString('base64'))):pdf,id]);},
  async sent(id,mailId){await tx(async run=>{await run("UPDATE sajumoon.orders SET last_error=NULL,status='sent',mail_id=$1,lease_until=0 WHERE id=$2",[mailId,id]);await audit(run,id,'mail_accepted');});},
  async failed(id,attempts,code='delivery_failed'){await q('UPDATE sajumoon.orders SET status=$1,next_attempt=$2,lease_until=0,last_error=$3 WHERE id=$4',[attempts>=5?'delivery_failed':'paid',Date.now()+Math.min(60000*2**attempts,1800000),code,id]);},
  async error(id,code){await q('UPDATE sajumoon.orders SET last_error=$1 WHERE id=$2',[code,id]);},
  async retry(id){const changed=await q("UPDATE sajumoon.orders SET status='paid',attempts=0,next_attempt=0,lease_until=0,mail_epoch=mail_epoch+1,delivery_started=$1 WHERE id=$2 AND status IN ('sent','delivery_failed') AND (refund_state IS NULL OR refund_state='declined')",[Date.now(),id]);if(changed.rowCount)await audit(q,id,'resend_requested');return changed.rowCount===1;},
  async queueEmail(id,mode){return tx(async run=>{const o=unpack((await run('SELECT * FROM sajumoon.orders WHERE id=$1 FOR UPDATE',[id])).rows[0]);if(!o||!o.paid_at||!o.pdf||!['sent','delivery_failed'].includes(o.status)||o.refund_state&&o.refund_state!=='declined')return false;o.input.emailDelivery=mode;await run("UPDATE sajumoon.orders SET input=$1,status='paid',attempts=0,next_attempt=0,lease_until=0,mail_epoch=mail_epoch+1,delivery_started=$2 WHERE id=$3",[encode(JSON.stringify(o.input)),Date.now(),id]);await audit(run,id,'email_requested');return true;});},
  async ticket(id,kind,message){const ticketId=crypto.randomUUID();await q('INSERT INTO sajumoon.tickets(id,order_id,created,kind,message) VALUES($1,$2,$3,$4,$5)',[ticketId,id,Date.now(),kind,encode(message)]);return ticketId;},
  async tickets(id){return (await q('SELECT * FROM sajumoon.tickets WHERE order_id=$1 ORDER BY created DESC',[id])).rows.map(t=>({...t,message:decode(t.message),reply:t.reply?decode(t.reply):null}));},
  async reply(id,message){await q("UPDATE sajumoon.tickets SET reply=$1,status='answered' WHERE id=$2",[encode(message),id]);},
  async requestRefund(id,reason){return tx(async run=>{const changed=await run("UPDATE sajumoon.orders SET refund_state='requested',refund_reason=$1 WHERE id=$2 AND paid_at IS NOT NULL AND status<>'refunded' AND (refund_state IS NULL OR refund_state='declined')",[encode(reason),id]);if(!changed.rowCount)return false;await run('INSERT INTO sajumoon.tickets(id,order_id,created,kind,message) VALUES($1,$2,$3,$4,$5)',[crypto.randomUUID(),id,Date.now(),'refund',encode(reason)]);await audit(run,id,'refund_requested');return true;});},
  async reserveRefund(id){return (await q("UPDATE sajumoon.orders SET refund_state='processing' WHERE id=$1 AND paid_at IS NOT NULL AND status<>'refunded' AND NOT(status='processing' AND lease_until>$2) RETURNING id",[id,Date.now()])).rowCount===1;},
  async refunded(id){await tx(async run=>{await run("UPDATE sajumoon.orders SET last_error=NULL,status='refunded',refund_state='refunded',pdf=NULL,report_json=NULL,lease_until=0 WHERE id=$1",[id]);await run('UPDATE sajumoon.ledger SET refunded_at=$1 WHERE id=$2',[Date.now(),id]);await run("UPDATE sajumoon.tickets SET status='answered',reply=$1 WHERE order_id=$2 AND kind='refund' AND status='open'",[encode('전액 환불이 확인되었습니다. 카드사 반영에는 추가 시간이 걸릴 수 있습니다.'),id]);await audit(run,id,'refund_confirmed');});},
  async declineRefund(id,message){await tx(async run=>{await run("UPDATE sajumoon.orders SET refund_state='declined' WHERE id=$1 AND refund_state='requested'",[id]);await run("UPDATE sajumoon.tickets SET status='answered',reply=$1 WHERE order_id=$2 AND kind='refund' AND status='open'",[encode(message),id]);await audit(run,id,'refund_declined');});},
  async visit(mode,page,source,campaign){await q('INSERT INTO sajumoon.traffic(day,mode,page,source,campaign,views) VALUES($1,$2,$3,$4,$5,1) ON CONFLICT(day,mode,page,source,campaign) DO UPDATE SET views=sajumoon.traffic.views+1',[todayKst(),mode,page,sourceValue(source),sourceValue(campaign)]);},
  async summary(mode){
   const since=Date.now()-30*86400000;
   const [l,t,o,s,open]=await Promise.all([q('SELECT * FROM sajumoon.ledger WHERE mode=$1 AND created>=$2 ORDER BY created DESC',[mode,since]),q('SELECT * FROM sajumoon.traffic WHERE mode=$1 AND day>=$2 ORDER BY day DESC',[mode,todayKst(new Date(since))]),q('SELECT id,email,input,status,refund_state,source,campaign,report_kind,attempts,created,(pdf IS NOT NULL) AS has_pdf FROM sajumoon.orders WHERE mode=$1 ORDER BY created DESC LIMIT 300',[mode]),q('SELECT costs FROM sajumoon.settings WHERE mode=$1',[mode]),q("SELECT COUNT(*)::integer AS n FROM sajumoon.tickets t JOIN sajumoon.orders o ON t.order_id=o.id WHERE o.mode=$1 AND t.status='open'",[mode])]);
   const ledger=l.rows,traffic=t.rows,orders=o.rows.map(unpack),paid=ledger.filter(x=>x.paid_at),refunded=paid.filter(x=>x.refunded_at),gross=paid.reduce((sum,x)=>sum+x.amount,0),refunds=refunded.reduce((sum,x)=>sum+x.amount,0),net=gross-refunds,costs=s.rows[0]?JSON.parse(s.rows[0].costs):null;
   return {periodDays:30,mode,totals:{orders:ledger.length,paid:paid.length,refunded:refunded.length,gross,refunds,net,customers:new Set(orders.map(x=>x.email)).size,landingViews:traffic.filter(x=>x.page==='landing').reduce((sum,x)=>sum+x.views,0),checkoutViews:traffic.filter(x=>x.page==='checkout').reduce((sum,x)=>sum+x.views,0),openTickets:open.rows[0].n},costs,estimatedProfit:costs?Math.round(net-net*costs.feePercent/100-paid.length*costs.perReport-costs.monthly-costs.ads):null,traffic,ledger,orders:orders.map(x=>({id:x.id,name:x.input.name,email:x.email,created:x.created,status:x.status,refundState:x.refund_state,source:x.source,campaign:x.campaign,reportKind:x.report_kind,attempts:x.attempts,hasPdf:!!x.has_pdf}))};
  },
  async costs(mode,value){await q('INSERT INTO sajumoon.settings(mode,costs) VALUES($1,$2) ON CONFLICT(mode) DO UPDATE SET costs=EXCLUDED.costs',[mode,JSON.stringify(value)]);},
  async audit(id){return (await q('SELECT action,created FROM sajumoon.audit WHERE order_id=$1 ORDER BY created DESC',[id])).rows;},
  async cleanup(){await tx(async run=>{const cutoff=Date.now()-30*86400000;await run('DELETE FROM sajumoon.admin_sessions WHERE expires<$1',[Date.now()]);await run('DELETE FROM sajumoon.tickets WHERE order_id IN (SELECT id FROM sajumoon.orders WHERE created<$1)',[cutoff]);await run('DELETE FROM sajumoon.orders WHERE created<$1',[cutoff]);await run('DELETE FROM sajumoon.traffic WHERE day<$1',[todayKst(new Date(cutoff))]);await run('DELETE FROM sajumoon.audit WHERE created<$1',[Date.now()-5*365*86400000]);await run('DELETE FROM sajumoon.ledger WHERE created<$1',[Date.now()-5*365*86400000]);});},
  async close(){await pool.end();}
 };
 return store;
}
module.exports={createPostgresStore,poolOptions};
