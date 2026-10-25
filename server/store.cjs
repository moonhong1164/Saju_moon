const {DatabaseSync}=require('node:sqlite');
const crypto=require('node:crypto');
function createStore(filename){
 const db=new DatabaseSync(filename);db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
 db.exec(`CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, email TEXT NOT NULL, input TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending_payment', payment_key TEXT, created INTEGER NOT NULL, paid_at INTEGER, next_attempt INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, lease_until INTEGER DEFAULT 0, mail_id TEXT, pdf BLOB, consent_version TEXT NOT NULL, mode TEXT NOT NULL); CREATE UNIQUE INDEX IF NOT EXISTS unique_payment ON orders(payment_key) WHERE payment_key IS NOT NULL;`);
 const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
 return {
  create(input,email,mode='live'){const id='sm_'+crypto.randomUUID().replaceAll('-',''),token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO orders(id,token_hash,email,input,created,consent_version,mode) VALUES(?,?,?,?,?,?,?)').run(id,hash(token),email,JSON.stringify(input),Date.now(),'2026-10-26-v1',mode);return {id,token};},
  get(id){const r=db.prepare('SELECT * FROM orders WHERE id=?').get(id);return r?{...r,input:JSON.parse(r.input)}:null;},
  auth(id,token){if(typeof token!=='string'||!/^\w{64}$/.test(token))return null;const o=this.get(id);return o&&crypto.timingSafeEqual(Buffer.from(o.token_hash),Buffer.from(hash(token)))?o:null;},
  paid(id,key){db.prepare("UPDATE orders SET status='paid',payment_key=?,paid_at=?,next_attempt=0 WHERE id=? AND status='pending_payment'").run(key,Date.now(),id);},
  claim(mode='live'){const now=Date.now();db.prepare("UPDATE orders SET status='delivery_failed' WHERE status='processing' AND lease_until<? AND attempts>=5").run(now);const row=db.prepare("UPDATE orders SET status='processing',lease_until=?,attempts=attempts+1 WHERE id=(SELECT id FROM orders WHERE mode=? AND (status='paid' OR (status='processing' AND lease_until<?)) AND next_attempt<=? AND attempts<5 ORDER BY paid_at LIMIT 1) RETURNING *").get(now+120000,mode,now,now);return row?{...row,input:JSON.parse(row.input)}:null;},
  pdf(id,pdf){db.prepare('UPDATE orders SET pdf=? WHERE id=?').run(pdf,id);},
  sent(id,mailId){db.prepare("UPDATE orders SET status='sent',mail_id=?,lease_until=0 WHERE id=?").run(mailId,id);},
  failed(id,attempts){db.prepare("UPDATE orders SET status=?,next_attempt=?,lease_until=0 WHERE id=?").run(attempts>=5?'delivery_failed':'paid',Date.now()+Math.min(60000*2**attempts,1800000),id);},
  cleanup(){// Personal report input/PDF is retained 30 days. Business transaction retention is configured separately.
   db.prepare('DELETE FROM orders WHERE created < ?').run(Date.now()-30*86400000);
  },
  close(){db.close();}
 };
}
module.exports={createStore};
