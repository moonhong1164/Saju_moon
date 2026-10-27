const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const {createStore}=require('../server/store.cjs');
const {createApp,configuration}=require('../server/app.cjs');
const {createPdf,sections,tenGod}=require('../server/report.cjs');
const {confirmToss,sendReport}=require('../server/providers.cjs');
const PRODUCT=require('../server/product.cjs');
const buyer={name:'테스트',email:'buyer@example.com',date:'2005-12-23',calendar:'solar',time:'08:37',agreeTerms:true,agreePrivacy:true,agreeProduction:true};
async function fixture(t,opts={}){
 const store=createStore(':memory:');
 const service=createApp({store,env:{DEMO_MODE:'1'},...opts});
 const listener=service.app.listen(0,'127.0.0.1');await new Promise(r=>listener.once('listening',r));
 const base=`http://127.0.0.1:${listener.address().port}`;
 t.after(async()=>{await new Promise(r=>listener.close(r));store.close();});
 async function request(url,body,token){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {response:r,data:await r.json()};}
 return {...service,store,base,request};
}
test('product is fixed at KRW 19,000 and 15 pages',()=>{assert.equal(PRODUCT.amount,19000);assert.equal(PRODUCT.pages,15);});
test('sales default closed, incomplete credentials and production demo cannot enable sales',()=>{
 assert.equal(configuration({}).enabled,false);assert.equal(configuration({DEMO_MODE:'1',NODE_ENV:'production'}).enabled,false);
 assert.equal(configuration({SALES_ENABLED:'true',POLICIES_APPROVED:'true'}).enabled,false);
});
test('consent, date and email validation; missing credential routes do not create orders',async t=>{
 const f=await fixture(t);
 for(const bad of [{...buyer,agreePrivacy:false},{...buyer,date:'2023-02-29'},{...buyer,email:'a\r\nb@example.com'},{...buyer,name:'<script>'}])assert.equal((await f.request('/api/orders',bad)).response.status,400);
 const closed=await fixture(t,{env:{}});assert.equal((await closed.request('/api/orders',buyer)).response.status,503);
});
test('local demo: paid -> 15-page generation -> no real email -> authorized PDF only',async t=>{
 const f=await fixture(t);
 const {data:o}=await f.request('/api/orders',buyer);
 assert.equal(o.amount,19000);assert.ok(o.token);
 assert.equal((await f.request(`/api/orders/${o.id}`)).response.status,404);
 assert.equal((await f.request(`/api/orders/${o.id}/confirm`,{amount:1,paymentKey:'local-demo'},o.token)).response.status,400);
 assert.equal((await f.request(`/api/orders/${o.id}/confirm`,{amount:19000,paymentKey:'fake-live'},o.token)).response.status,400);
 assert.equal((await f.request(`/api/orders/${o.id}/confirm`,{amount:19000,paymentKey:'local-demo'},o.token)).data.status,'paid');
 assert.equal(await f.processOne(),true);
 assert.equal(await f.processOne(),false);
 const status=(await f.request(`/api/orders/${o.id}`,null,o.token)).data;
 assert.equal(status.status,'sent');assert.equal(status.demo,true);
 const pdf=await fetch(f.base+`/api/orders/${o.id}/pdf`,{headers:{Authorization:'Bearer '+o.token}});
 assert.equal(pdf.status,200);assert.equal(pdf.headers.get('content-type'),'application/pdf');
 assert.ok(pdf.headers.get('content-disposition').includes("filename*=UTF-8''"+encodeURIComponent(buyer.name)+'.pdf'));
 assert.ok(Buffer.from(await pdf.arrayBuffer()).subarray(0,4).equals(Buffer.from('%PDF')));
 assert.equal((await f.request(`/api/orders/${o.id}/confirm`,{amount:19000,paymentKey:'local-demo'},o.token)).data.status,'sent');
});
test('mail failure is persisted for retry; duplicate worker cannot claim active lease',async t=>{
 const env={SALES_ENABLED:'test',TOSS_CLIENT_KEY:'test_ck_example',TOSS_SECRET_KEY:'test_sk_example',RESEND_API_KEY:'test',MAIL_FROM:'test@example.com',PUBLIC_BASE_URL:'https://example.com',SELLER_NAME:'test',SELLER_BUSINESS_ID:'test',SELLER_CONTACT:'test',SELLER_ADDRESS:'test'};
 let calls=0;
 const f=await fixture(t,{env,pay:async()=>({}),mail:async()=>{calls++;throw new Error('temporary outage');}});
 const {data:o}=await f.request('/api/orders',buyer);
 await f.request(`/api/orders/${o.id}/confirm`,{amount:19000,paymentKey:'provider-key'},o.token);
 assert.equal(await f.processOne(),false);
 const row=f.store.get(o.id);assert.equal(row.status,'paid');assert.equal(row.attempts,1);assert.ok(row.pdf);assert.equal(calls,1);
 assert.equal(await f.processOne(),false);assert.equal(calls,1);
});
test('provider approval verifies amount/order/currency/status and sets idempotency key',async()=>{
 let request;
 const fake=async(url,options)=>{request=options;return {ok:true,json:async()=>({paymentKey:'key',orderId:'order',totalAmount:19000,currency:'KRW',status:'DONE'})};};
 await confirmToss({paymentKey:'key',orderId:'order',secret:'test-key',fetcher:fake});
 assert.equal(JSON.parse(request.body).amount,19000);assert.equal(request.headers['Idempotency-Key'],'confirm-order');
 await assert.rejects(confirmToss({paymentKey:'key',orderId:'other',secret:'x',fetcher:fake}));
 await assert.rejects(confirmToss({paymentKey:'key',orderId:'order',secret:'x',fetcher:async()=>({ok:true,json:async()=>({paymentKey:'key',orderId:'order',totalAmount:1,currency:'KRW',status:'DONE'})})}));
});
test('email provider gets only purchased PDF and uses stable idempotency',async()=>{
 let request;
 const id=await sendReport({order:{id:'order',email:'buyer@example.com',input:{name:'달빛'}},pdf:Buffer.from('test-pdf'),key:'test-key',from:'test@example.com',fetcher:async(_u,o)=>{request=o;return{ok:true,json:async()=>({id:'mail-id'})};}});
 assert.equal(id,'mail-id');assert.equal(request.headers['Idempotency-Key'],'saju-report-order');
 assert.equal(JSON.parse(request.body).attachments[0].content,Buffer.from('test-pdf').toString('base64'));
 assert.equal(JSON.parse(request.body).attachments[0].filename,'달빛.pdf');
});
test('PDF filenames preserve nicknames and safely handle empty or unsafe file names',()=>{
 const {reportFilename,disposition}=require('../server/report-filename.cjs');
 assert.equal(reportFilename('달빛 산책'),'달빛 산책.pdf');
 assert.equal(reportFilename(''),'sajumoon-report.pdf');
 assert.equal(reportFilename('../달빛\r\n/별'),'_달빛___별.pdf');
 assert.equal(reportFilename('CON'),'_CON.pdf');
 assert.ok(!disposition('달빛\r\n별').includes('\r'));
});
test('report chapters and heavenly-stem relations reflect computed chart',async()=>{
 const s=sections(buyer);assert.equal(s.rows.length,15);assert.equal(tenGod('辛','乙'),'편재');assert.equal(tenGod('辛','戊'),'정인');
 assert.ok(s.rows[2][2][0].includes('신사'));assert.ok(s.rows[7][2][0].includes('편재'));
 assert.ok(s.rows[7][2].at(-1).includes('여러 자원과 기회를 연결하는 역할'));
 assert.ok(s.rows[8][2].at(-1).includes('사실·감정·요청'));
 const unknown=sections({...buyer,time:''});
 assert.ok(!unknown.rows[7][2].at(-1).includes('시간의'));
 const different=sections({...buyer,date:'2005-12-24'});
 assert.notEqual(s.rows[3][2].at(-1),different.rows[3][2].at(-1));
 const pdf=await createPdf(buyer);assert.equal(pdf.subarray(0,4).toString(),'%PDF');
 fs.writeFileSync('/tmp/saju-commerce-test.pdf',pdf);
});
test('private source, database and environment paths are never served',async t=>{
 const f=await fixture(t);
 for(const route of ['/server/start.cjs','/src/saju.cjs','/.data/orders.sqlite','/.env','/package.json'])assert.equal((await fetch(f.base+route)).status,404);
});

test('order queue and access tokens survive a server restart; active lease cannot be duplicated',t=>{
 const os=require('node:os'),path=require('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'saju-store-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'orders.sqlite');
 let store=createStore(file);
 const o=store.create({name:'테스트',date:'2005-12-23',calendar:'solar',time:''},'buyer@example.com','demo');
 store.paid(o.id,'demo-key');store.close();
 store=createStore(file);
 assert.equal(store.auth(o.id,o.token).status,'paid');
 assert.equal(store.claim('live'),null);
 assert.equal(store.claim('demo').id,o.id);
 assert.equal(store.claim('demo'),null);
 store.close();
});
test('unknown time and all ten day masters generate full 15-page reports without overflow',async()=>{
 for(let day=7;day<=16;day++){
  const pdf=await createPdf({name:'테스트',date:`2000-01-${day.toString().padStart(2,'0')}`,calendar:'solar',time:''});
  assert.ok(pdf.length>50000);
 }
 await createPdf({name:'테스트',date:'2024-02-04',calendar:'solar',time:''});
});
