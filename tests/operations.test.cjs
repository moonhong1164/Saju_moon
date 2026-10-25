const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {createStore}=require('../server/store.cjs');
const {createApp}=require('../server/app.cjs');
const {sections,createPdf}=require('../server/report.cjs');
const {generateAiReport,PAGES}=require('../server/ai-report.cjs');
const {cancelToss}=require('../server/providers.cjs');
const buyer={name:'운영 테스트',email:'owner@example.com',date:'2005-12-23',calendar:'solar',time:'08:37',agreeTerms:true,agreePrivacy:true,agreeProduction:true};
async function fixture(t,options={}){
 const store=createStore(':memory:');const service=createApp({store,env:{DEMO_MODE:'1'},...options});const server=service.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;t.after(async()=>{await new Promise(r=>server.close(r));store.close();});
 async function req(url,body,token){const response=await fetch(base+url,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {response,data:await response.json()};}
 return {store,...service,req,base};
}
async function purchase(f,fields={}){const {data:o}=await f.req('/api/orders',{...buyer,...fields});assert.ok(o.id);await f.req('/api/orders/'+o.id+'/confirm',{amount:19000,paymentKey:'local-demo'},o.token);await f.processOne();return o;}
test('report is locked before payment, same prepared content opens after payment and closes on refund',async t=>{
 const f=await fixture(t),{data:o}=await f.req('/api/orders',buyer),url='/api/orders/'+o.id;
 const locked=await f.req(url+'/report',null,o.token);assert.equal(locked.response.status,402);assert.equal(locked.data.toc.length,15);assert.equal(locked.data.chapters,undefined);
 assert.equal((await fetch(f.base+url+'/pdf',{headers:{Authorization:'Bearer '+o.token}})).status,404);
 await f.req(url+'/confirm',{amount:19000,paymentKey:'local-demo'},o.token);await f.processOne();
 const report=await f.req(url+'/report',null,o.token);assert.equal(report.data.chapters.length,15);assert.equal(report.data.kind,'rules');assert.ok(report.data.chapters[2].paragraphs[0].includes('신사'));
 await f.req('/api/admin/orders/'+o.id+'/refund',{reason:'고객의 환불 요청 확인'});
 assert.equal((await f.req(url+'/report',null,o.token)).response.status,402);
 assert.equal((await f.req(url,null,o.token)).data.downloadReady,false);
 assert.equal((await f.req('/api/admin/summary')).data.totals.net,0);
});
test('non-demo admin is locked and token auth is required for every administrative mutation',async t=>{
 const key=crypto.randomBytes(32).toString('hex'),f=await fixture(t,{env:{ADMIN_ACCESS_TOKEN:key}});
 assert.equal((await f.req('/api/admin/summary')).response.status,401);
 assert.equal((await f.req('/api/admin/summary',null,'wrong')).response.status,401);
 assert.equal((await f.req('/api/admin/summary',null,key)).response.status,200);
 assert.equal((await f.req('/api/admin/costs',{monthly:0,ads:0,feePercent:0,perReport:0})).response.status,401);
});
test('support request and operator reply are isolated to the correct order',async t=>{
 const f=await fixture(t),a=await purchase(f),b=await purchase(f,{email:'other@example.com'});
 const ticket=await f.req('/api/orders/'+a.id+'/tickets',{message:'이메일 수신을 확인하고 싶어요.'},a.token);assert.equal(ticket.response.status,201);
 assert.equal((await f.req('/api/orders/'+a.id+'/tickets',null,b.token)).response.status,404);
 assert.equal((await f.req('/api/admin/orders/'+b.id+'/reply',{ticketId:ticket.data.id,message:'잘못된 주문 답변'})).response.status,400);
 await f.req('/api/admin/orders/'+a.id+'/reply',{ticketId:ticket.data.id,message:'스팸함을 확인해 주세요. PDF도 내려받을 수 있습니다.'});
 assert.match((await f.req('/api/orders/'+a.id+'/tickets',null,a.token)).data.tickets[0].reply,/스팸함/);
});
test('refund request pauses queued generation, decline resumes, explicit resend creates a new epoch',async t=>{
 const f=await fixture(t),{data:o}=await f.req('/api/orders',buyer),url='/api/orders/'+o.id;
 await f.req(url+'/confirm',{amount:19000,paymentKey:'local-demo'},o.token);
 await f.req(url+'/refund-request',{reason:'제작 전에 입력 정보를 검토하고 싶어요.'},o.token);
 assert.equal(await f.processOne(),false);
 await f.req('/api/admin/orders/'+o.id+'/decline-refund',{message:'고객과 협의해 원래 주문 제작을 진행합니다.'});
 assert.equal(await f.processOne(),true);
 await f.req('/api/admin/orders/'+o.id+'/resend',{});assert.equal(f.store.get(o.id).mail_epoch,1);assert.equal(await f.processOne(),true);
});
test('anonymous traffic, paid conversion, refunds and cost estimates agree',async t=>{
 const f=await fixture(t);
 await f.req('/api/events',{page:'landing',source:'instagram',campaign:'spring'});
 await f.req('/api/events',{page:'checkout',source:'instagram',campaign:'spring'});
 await purchase(f,{source:'instagram',campaign:'spring'});
 await f.req('/api/admin/costs',{monthly:1000,ads:2000,feePercent:3,perReport:500});
 const s=(await f.req('/api/admin/summary')).data;
 assert.equal(s.totals.landingViews,1);assert.equal(s.totals.checkoutViews,1);assert.equal(s.totals.net,19000);assert.equal(s.estimatedProfit,14930);
 assert.equal(s.orders[0].source,'instagram');assert.equal(s.orders[0].hasPdf,true);
 assert.equal((await f.req('/api/admin/costs',{monthly:-1,ads:0,feePercent:3,perReport:0})).response.status,400);
 assert.equal((await f.req('/api/events',{page:'private-name'})).response.status,400);
});
test('at-rest migration encrypts email, birth data, PDF, web report and tickets and survives restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'saju-crypt-')),file=path.join(dir,'db.sqlite'),key=crypto.randomBytes(32).toString('base64');
 try{
  let s=createStore(file);const o=s.create(buyer,buyer.email,'demo');s.pdf(o.id,Buffer.from('%PDF-private'));s.report(o.id,{test:'private report'},'rules');s.ticket(o.id,'support','비공개 문의 내용');s.close();
  s=createStore(file,{encryptionKey:key});assert.equal(s.get(o.id).email,buyer.email);assert.equal(s.get(o.id).pdf.toString(),'%PDF-private');assert.equal(s.tickets(o.id)[0].message,'비공개 문의 내용');s.close();
  const raw=new DatabaseSync(file);const row=raw.prepare('SELECT email,input,pdf,report_json FROM orders').get();assert.ok(row.email.startsWith('enc1:'));assert.ok(row.input.startsWith('enc1:'));assert.ok(row.report_json.startsWith('enc1:'));assert.ok(Buffer.from(row.pdf).toString().startsWith('enc1:'));assert.ok(raw.prepare('SELECT message FROM tickets').get().message.startsWith('enc1:'));raw.close();
  s=createStore(file,{encryptionKey:key});assert.equal(s.auth(o.id,o.token).input.date,buyer.date);s.close();
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('legacy schema migrates without losing existing token or order',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'saju-legacy-')),file=path.join(dir,'db.sqlite');
 try{const old=new DatabaseSync(file);old.exec('CREATE TABLE orders(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL,email TEXT NOT NULL,input TEXT NOT NULL,status TEXT,payment_key TEXT,created INTEGER,paid_at INTEGER,next_attempt INTEGER DEFAULT 0,attempts INTEGER DEFAULT 0,lease_until INTEGER DEFAULT 0,mail_id TEXT,pdf BLOB,consent_version TEXT,mode TEXT);');const token='a'.repeat(64);old.prepare('INSERT INTO orders(id,token_hash,email,input,status,created,consent_version,mode) VALUES(?,?,?,?,?,?,?,?)').run('legacy',crypto.createHash('sha256').update(token).digest('hex'),buyer.email,JSON.stringify(buyer),'pending_payment',Date.now(),'v1','demo');old.close();const store=createStore(file);assert.equal(store.auth('legacy',token).email,buyer.email);assert.equal(store.summary('demo').totals.orders,1);store.close();}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
function aiResponse(){return {status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({chapters:PAGES.map(page=>({page,paragraphs:Array.from({length:3},(_,i)=>`이 문단은 ${page}쪽의 ${i+1}번째 해설입니다. 계산된 명식의 상징을 실제 경험과 비교하고, 자신에게 맞는 작은 실천을 찾아보세요.`)}))})}]}]};}
test('AI adapter sends only computed chart, validates full structured report and keeps exact calculations',async()=>{
 let sent;
 const report=await generateAiReport(buyer,{key:'fake',model:'configured-model',fetcher:async(_u,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>aiResponse()};}});
 assert.equal(sent.store,false);assert.ok(!sent.input.includes(buyer.name));assert.ok(!sent.input.includes(buyer.email));assert.ok(!sent.input.includes(buyer.date));
 assert.equal(report.rows.length,15);assert.equal(report.kind,'ai');assert.deepEqual(report.result.pillars,sections(buyer).result.pillars);
 assert.ok(report.rows[1][2][2].includes('AI'));await createPdf(buyer,report);
 await assert.rejects(generateAiReport(buyer,{key:'x',model:'x',fetcher:async()=>({ok:true,json:async()=>({status:'completed',output:[]})})}));
});
test('AI mode requires separate consent, is snapshotted per order and never silently falls back',async t=>{
 const f=await fixture(t,{env:{DEMO_MODE:'1',REPORT_ENGINE:'ai',AI_PROVIDER_KEY:'fake',AI_MODEL:'fake'},makeAi:async()=>{throw new Error('unavailable');}});
 assert.equal((await f.req('/api/orders',buyer)).response.status,400);
 const {data:o}=await f.req('/api/orders',{...buyer,agreeAi:true});assert.equal(f.store.get(o.id).report_kind,'ai');
 await f.req('/api/orders/'+o.id+'/confirm',{amount:19000,paymentKey:'local-demo'},o.token);assert.equal(await f.processOne(),false);assert.equal(f.store.get(o.id).report,null);assert.equal(f.store.get(o.id).pdf,null);
});
test('provider cancellation requires verified full cancellation, reconciles ambiguous retries',async()=>{
 let calls=0;
 const data={orderId:'order',paymentKey:'key',status:'CANCELED',totalAmount:19000,balanceAmount:0};
 const value=await cancelToss({order:{id:'order',payment_key:'key'},reason:'환불 요청 확인',secret:'fake',fetcher:async()=>{calls++;return calls===1?{ok:false}:{ok:true,json:async()=>data};}});assert.equal(value.status,'CANCELED');assert.equal(calls,2);
 await assert.rejects(cancelToss({order:{id:'order',payment_key:'key'},reason:'refund',secret:'fake',fetcher:async()=>({ok:true,json:async()=>({...data,balanceAmount:1000})})}));
});

test('personal-data cleanup removes report and support data while retaining transaction ledger',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'saju-retention-')),file=path.join(dir,'db.sqlite');
 try{let s=createStore(file);const o=s.create(buyer,buyer.email,'demo');s.paid(o.id,'paid-key');s.ticket(o.id,'support','삭제해야 하는 문의 내용');s.close();const raw=new DatabaseSync(file);raw.prepare('UPDATE orders SET created=?').run(Date.now()-31*86400000);raw.close();s=createStore(file);assert.equal(s.auth(o.id,o.token),null);s.cleanup();assert.equal(s.get(o.id),null);assert.deepEqual(s.tickets(o.id),[]);assert.equal(s.summary('demo').ledger.length,1);s.close();}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
