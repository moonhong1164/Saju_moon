const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Pool}=require('pg');
const {createPostgresStore,poolOptions}=require('../server/postgres-store.cjs');
const {resolveDataKey}=require('../server/data-key.cjs');
const {createApp}=require('../server/app.cjs');
const url=process.env.SAJU_TEST_DATABASE_URL;
test('PostgreSQL: free checkout, encrypted persistence, login restart, refund, concurrency', {skip:!url},async t=>{
 const parsed=new URL(url);assert.ok(['localhost','127.0.0.1','[::1]'].includes(parsed.hostname),'Use only a disposable loopback PostgreSQL server for this test.');
 const name='saju_test_'+crypto.randomBytes(6).toString('hex'),root=new Pool(poolOptions(url));await root.query(`CREATE DATABASE "${name}"`);parsed.pathname='/'+name;const connectionString=parsed.toString();
 const secret=crypto.randomBytes(32).toString('hex'),key=resolveDataKey({ORDER_DATA_SECRET:secret});let store=await createPostgresStore({connectionString,encryptionKey:key}),listener;
 const env={NODE_ENV:'test',FREE_TRIAL_MODE:'true',ORDER_DATA_SECRET:secret,ADMIN_SETUP_TOKEN:crypto.randomBytes(32).toString('hex'),SALES_ENABLED:'true',REPORT_ENGINE:'ai',TOSS_CLIENT_KEY:'live_ck_should_not_be_used',TOSS_SECRET_KEY:'live_sk_should_not_be_used',RESEND_API_KEY:'should-not-be-used',AI_PROVIDER_KEY:'should-not-be-used',AI_MODEL:'should-not-be-used'};
 let calls=0,cookie='',csrf='',base='';
 async function start(){const app=createApp({store,env,pay:async()=>{calls++;throw new Error('Unexpected payment');},mail:async()=>{calls++;throw new Error('Unexpected mail');},cancel:async()=>{calls++;throw new Error('Unexpected refund');},makeAi:async()=>{calls++;throw new Error('Unexpected AI');}}).app;listener=app.listen(0,'127.0.0.1');await new Promise(r=>listener.once('listening',r));base='http://127.0.0.1:'+listener.address().port;}
 async function call(path,body,token){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json','X-Admin-Request':'1'}:{}),...(path.startsWith('/api/admin/')&&cookie?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();return {r,data};}
 t.after(async()=>{if(listener)await new Promise(r=>listener.close(r));await store.close();await root.query(`DROP DATABASE "${name}" WITH (FORCE)`);await root.end();});
 await start();let order;
 await t.test('owner account is mandatory; free mode suppresses all paid services',async()=>{
  let config=(await call('/api/config')).data;assert.equal(config.trial,true);assert.equal(config.enabled,false);assert.equal(config.reportEngine,'rules');assert.equal(config.clientKey,undefined);
  const response=await fetch(base+'/api/admin/auth/setup',{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Request':'1'},body:JSON.stringify({username:'free_owner',password:'Only-for-Postgres-tests-2026',setupToken:env.ADMIN_SETUP_TOKEN})});assert.equal(response.status,201);cookie=response.headers.get('set-cookie').split(';')[0];csrf=(await response.json()).csrf;
  config=(await call('/api/config')).data;assert.equal(config.enabled,true);
  const created=await call('/api/orders',{name:'무료 테스트',email:'free@example.com',date:'2005-12-23',calendar:'solar',time:'08:37',amount:19000,agreeTerms:true,agreePrivacy:true,agreeProduction:true});assert.equal(created.r.status,201);order=created.data;assert.equal(order.amount,0);
  assert.equal((await call('/api/orders/'+order.id+'/report',null,order.token)).r.status,402);
  assert.equal((await call('/api/orders/'+order.id+'/confirm',{amount:19000,paymentKey:'trial-no-charge'},order.token)).r.status,400);
  assert.equal((await call('/api/orders/'+order.id+'/confirm',{amount:0,paymentKey:'trial-no-charge'},order.token)).r.status,200);
  const deadline=Date.now()+8000;while(Date.now()<deadline){if((await store.get(order.id)).status==='sent')break;await new Promise(r=>setTimeout(r,30));}
  const row=await store.get(order.id);assert.equal(row.status,'sent');assert.ok(row.pdf.subarray(0,4).equals(Buffer.from('%PDF')));assert.equal(row.report_kind,'rules');assert.equal(row.input.trial,true);assert.equal(row.mail_id,'free-trial-no-email');assert.equal(calls,0);
  assert.equal((await call('/api/orders/'+order.id+'/report',null,order.token)).data.chapters.length,15);
  const summary=(await call('/api/admin/summary')).data;assert.equal(summary.mode,'trial');assert.equal(summary.totals.gross,0);assert.equal(summary.ledger[0].amount,0);
 });
 await t.test('database stores encrypted data; records and login survive app restart',async()=>{
  await store.ticket(order.id,'support','저장 여부를 확인하고 싶습니다.');await store.visit('trial','landing','instagram','free');await store.costs('trial',{monthly:0,ads:0,feePercent:0,perReport:0});
  const inspect=new Pool(poolOptions(connectionString));const raw=(await inspect.query('SELECT email,input,pdf,report_json FROM sajumoon.orders WHERE id=$1',[order.id])).rows[0];await inspect.end();
  for(const field of ['email','input','report_json'])assert.ok(raw[field].startsWith('enc1:'));assert.ok(raw.pdf.toString().startsWith('enc1:'));
  await new Promise(r=>listener.close(r));listener=null;await store.close();store=await createPostgresStore({connectionString,encryptionKey:key});await start();
  assert.equal((await call('/api/admin/auth/session')).data.authenticated,true);assert.equal((await store.get(order.id)).email,'free@example.com');assert.equal((await store.tickets(order.id)).length,1);assert.equal((await store.summary('trial')).totals.landingViews,1);
  await assert.rejects(createPostgresStore({connectionString,encryptionKey:crypto.randomBytes(32).toString('base64')}));
 });
 await t.test('refund and customer support remain authorized without financial calls',async()=>{
  const ticket=(await store.tickets(order.id))[0];assert.equal((await call('/api/admin/orders/'+order.id+'/reply',{ticketId:ticket.id,message:'정상적으로 저장되었습니다.'})).r.status,200);
  assert.equal((await call('/api/orders/'+order.id+'/tickets',null,order.token)).data.tickets[0].reply,'정상적으로 저장되었습니다.');
  await call('/api/orders/'+order.id+'/refund-request',{reason:'무료 테스트 취소 요청입니다.'},order.token);
  const result=await call('/api/admin/orders/'+order.id+'/refund',{reason:'무료 테스트 주문 종료'});assert.equal(result.data.status,'refunded');assert.equal(result.data.amount,0);assert.equal(calls,0);
  assert.equal((await call('/api/orders/'+order.id+'/report',null,order.token)).r.status,402);assert.equal((await store.summary('trial')).totals.net,0);
 });
 await t.test('concurrent workers claim each PostgreSQL job only once',async()=>{
  const jobs=await Promise.all(Array.from({length:4},()=>store.create({name:'테스트',date:'2000-01-07',calendar:'solar',time:'',trial:true},'test@example.com','trial',{amount:0})));
  await Promise.all(jobs.map(o=>store.paid(o.id,'trial-'+o.id)));
  const claims=await Promise.all(Array.from({length:6},()=>store.claim('trial'))),nonempty=claims.filter(Boolean);assert.equal(nonempty.length,4);assert.equal(new Set(nonempty.map(o=>o.id)).size,4);
 });
 await t.test('explicit mail requests persist delivery intent and reject duplicate or refunded jobs',async()=>{
  const message=await store.create({name:'메일 테스트',date:'2000-01-07',calendar:'solar',time:'',emailDelivery:'off'},'owner@example.com','email_test',{amount:0});
  await store.paid(message.id,'mail-test-'+message.id);await store.pdf(message.id,Buffer.from('%PDF-test'));await store.sent(message.id,'free-trial-no-email');
  assert.equal(await store.queueEmail(message.id,'owner_test'),true);assert.equal(await store.queueEmail(message.id,'owner_test'),false);
  const row=await store.get(message.id);assert.equal(row.input.emailDelivery,'owner_test');assert.equal(row.mail_epoch,1);
  await store.refunded(message.id);assert.equal(await store.queueEmail(message.id,'owner_test'),false);
 });
 await t.test('free quota stays atomic under concurrent requests',async()=>{
  const results=await Promise.allSettled(Array.from({length:7},()=>store.create({name:'quota',date:'2000-01-07',calendar:'solar',time:''},'quota@example.com','trial',{amount:0})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,5);
  assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.reason.code==='SAJU_TRIAL_LIMIT'));
  assert.equal((await store.summary('trial')).totals.orders,10);
 });
 await t.test('manual quota is independent, atomic, and cannot be selected by public attribution',async()=>{
  const publicFake=await Promise.allSettled([store.create({name:'fake'},'fake@example.com','trial',{source:'admin_manual',amount:0})]);
  assert.equal(publicFake[0].status,'rejected');
  const results=await Promise.allSettled(Array.from({length:105},()=>store.create({name:'관리자',manualProduction:true,emailDelivery:'off'},'owner@example.com','trial',{amount:0})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,100);
  assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.reason.code==='SAJU_TRIAL_LIMIT'));
  const row=await store.get(results.find(r=>r.status==='fulfilled').value.id);assert.equal(row.input.manualProduction,true);assert.equal(row.source,'admin_manual');
 });

});
test('remote PostgreSQL certificate verification cannot be disabled by URL parameters',()=>{
 const config=poolOptions('postgres://user:password@example.neon.tech/db?sslmode=no-verify');assert.equal(config.ssl.rejectUnauthorized,true);assert.equal(new URL(config.connectionString).searchParams.has('sslmode'),false);
});
test('generated encryption secret is stable across restarts and rejects a short secret',()=>{
 const env={ORDER_DATA_SECRET:'test-only-long-encryption-secret-2026'};assert.equal(resolveDataKey(env),resolveDataKey(env));assert.equal(Buffer.from(resolveDataKey(env),'base64').length,32);assert.throws(()=>resolveDataKey({ORDER_DATA_SECRET:'short'}));
});
