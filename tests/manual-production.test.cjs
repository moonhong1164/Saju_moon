const test=require('node:test'),assert=require('node:assert/strict');
const {createStore}=require('../server/store.cjs');
const {createApp}=require('../server/app.cjs');
const {passwordHash}=require('../server/admin-auth.cjs');
const {sections}=require('../server/report.cjs');
const input={name:'달빛',email:'customer@example.com',date:'2005-12-23',calendar:'solar',time:'',agreeTerms:true,agreePrivacy:true,agreeProduction:true};
test('manual and public quotas are separate and reserved attribution cannot bypass public quota',()=>{
 const store=createStore(':memory:');try{
 for(let i=0;i<10;i++)store.create(input,input.email,'trial',{amount:0,source:'admin_manual'});
 assert.throws(()=>store.create(input,input.email,'trial'),{code:'SAJU_TRIAL_LIMIT'});
 for(let i=0;i<100;i++)store.create({...input,manualProduction:true},input.email,'trial',{amount:0});
 assert.throws(()=>store.create({...input,manualProduction:true},input.email,'trial'),{code:'SAJU_TRIAL_LIMIT'});
 assert.equal(store.summary('trial').totals.orders,110);
 }finally{store.close();}
});
test('manual production requires session and CSRF, uses no provider, and preserves nickname download',async t=>{
 const key=Buffer.alloc(32,1).toString('base64'),store=createStore(':memory:',{encryptionKey:key});
 store.createAdmin('manual_owner',await passwordHash('Only-for-manual-tests-2026'));
 let calls=0;const service=createApp({store,env:{FREE_TRIAL_MODE:'true',ORDER_DATA_KEY:key,EMAIL_DELIVERY_MODE:'owner_test',RESEND_API_KEY:'fake',TEST_EMAIL_TO:'owner@example.com'},mail:async()=>{calls++;throw Error('Never send');}});
 const server=service.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await new Promise(r=>server.close(r));store.close();});
 const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Request':'1',...headers},body:JSON.stringify(body)});
 assert.equal((await post('/api/admin/reports',input)).status,401);
 const login=await post('/api/admin/auth/login',{username:'manual_owner',password:'Only-for-manual-tests-2026'}),cookie=login.headers.get('set-cookie').split(';')[0],{csrf}=await login.json();
 assert.equal((await post('/api/admin/reports',input,{Cookie:cookie})).status,403);
 const created=await post('/api/admin/reports',input,{Cookie:cookie,'X-CSRF-Token':csrf});assert.equal(created.status,201);const order=await created.json();
 const until=Date.now()+3000;while(Date.now()<until&&(store.get(order.id)).status!=='sent')await new Promise(r=>setTimeout(r,15));
 const row=store.get(order.id);assert.equal(row.status,'sent');assert.equal(row.input.manualProduction,true);assert.equal(row.input.trial,undefined);assert.equal(row.source,'admin_manual');assert.equal(calls,0);
 assert.ok(!sections(row.input).rows[0][2].join('').includes('무료 테스트'));
 const pdf=await fetch(base+'/api/admin/orders/'+order.id+'/pdf',{headers:{Cookie:cookie}});assert.equal(pdf.status,200);assert.ok(pdf.headers.get('content-disposition').includes(encodeURIComponent(input.name)+'.pdf'));
 const publicAttempt=await post('/api/orders',{...input,email:'owner@example.com',manualProduction:true,source:'admin_manual'});assert.equal(publicAttempt.status,201);const pub=store.get((await publicAttempt.json()).id);assert.equal(pub.input.manualProduction,undefined);assert.equal(pub.source,'direct');
});
