const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createStore}=require('../server/store.cjs');
const {createApp}=require('../server/app.cjs');
const {passwordHash}=require('../server/admin-auth.cjs');
const EMAIL=require('../server/email-delivery.cjs');
const {sendReport}=require('../server/providers.cjs');
const buyer={name:'메일 테스트',email:'owner@example.com',date:'2005-12-23',calendar:'solar',time:'08:37',agreeTerms:true,agreePrivacy:true,agreeProduction:true};
async function fixture(t,{mode='owner_test',mail,store:existing}={}){
 const store=existing||createStore(':memory:',{encryptionKey:Buffer.alloc(32,1).toString('base64')});
 if(!store.adminAccount())store.createAdmin('mail_owner',await passwordHash('Only-for-mail-unit-tests-2026'));
 const env={NODE_ENV:'test',FREE_TRIAL_MODE:'true',ORDER_DATA_KEY:Buffer.alloc(32,1).toString('base64'),EMAIL_DELIVERY_MODE:mode,RESEND_API_KEY:'fake-sending-key',TEST_EMAIL_TO:buyer.email};
 const requests=[];const service=createApp({store,env,mail:mail|| (async payload=>{requests.push(payload);return 'fake-mail-'+requests.length;})});
 const server=service.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await new Promise(r=>server.close(r));if(!existing)store.close();});
 let cookie='',csrf='';
 async function call(path,body,token){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json','X-Admin-Request':'1'}:{}),...(path.startsWith('/api/admin/')&&cookie?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {response,data:await response.json()};}
 async function login(){const r=await fetch(base+'/api/admin/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Request':'1'},body:JSON.stringify({username:'mail_owner',password:'Only-for-mail-unit-tests-2026'})});cookie=r.headers.get('set-cookie').split(';')[0];csrf=(await r.json()).csrf;}
 async function create(fields={}){return (await call('/api/orders',{...buyer,...fields})).data;}
 async function confirm(order){await call('/api/orders/'+order.id+'/confirm',{amount:0,paymentKey:'trial-no-charge'},order.token);const deadline=Date.now()+3000;while(Date.now()<deadline){const state=store.get(order.id);if(['sent','delivery_failed'].includes(state.status))return state;await new Promise(r=>setTimeout(r,15));}throw new Error('worker did not finish');}
 return {...service,store,call,login,create,confirm,requests,base};
}
test('owner-only sender defaults, recipient restriction, public masking and customer domain rule',()=>{
 const c=EMAIL.configuration({EMAIL_DELIVERY_MODE:'owner_test',RESEND_API_KEY:'fake',TEST_EMAIL_TO:buyer.email},{trial:true});
 assert.equal(c.ready,true);assert.equal(c.from,'사주문 <onboarding@resend.dev>');assert.equal(EMAIL.checkRecipient(c,'OWNER@example.com'),true);assert.equal(EMAIL.checkRecipient(c,'other@example.com'),false);
 assert.notEqual(EMAIL.publicConfiguration(c).testRecipientHint,buyer.email);
 assert.equal(EMAIL.configuration({EMAIL_DELIVERY_MODE:'customer',RESEND_API_KEY:'fake',MAIL_FROM:'onboarding@resend.dev'},{trial:true}).ready,false);
 assert.equal(EMAIL.configuration({EMAIL_DELIVERY_MODE:'owner_test',TEST_EMAIL_TO:buyer.email},{trial:true}).ready,false);
});
test('only configured owner can create email test order; completed PDF is attached once',async t=>{
 const f=await fixture(t);const other=await f.call('/api/orders',{...buyer,email:'other@example.com'});assert.equal(other.response.status,400);
 const o=await f.create();assert.equal(o.amount,0);const row=await f.confirm(o);assert.equal(row.status,'sent');assert.equal(f.requests.length,1);assert.equal(f.requests[0].order.email,buyer.email);assert.ok(f.requests[0].pdf.subarray(0,4).equals(Buffer.from('%PDF')));
 const status=(await f.call('/api/orders/'+o.id,null,o.token)).data;assert.equal(status.emailAccepted,true);assert.equal(status.emailRequested,true);
 await f.call('/api/orders/'+o.id+'/confirm',{amount:0,paymentKey:'trial-no-charge'},o.token);assert.equal(f.requests.length,1);
});
test('configuration failures stop retries but PDF remains downloadable',async t=>{
 const f=await fixture(t,{mail:async()=>{const e=new Error('invalid key');e.code='email_credentials';e.retryable=false;throw e;}});const o=await f.create();const row=await f.confirm(o);
 assert.equal(row.status,'delivery_failed');assert.equal(row.last_error,'email_credentials');assert.ok(row.pdf);assert.equal(await f.processOne(),false);
 const status=(await f.call('/api/orders/'+o.id,null,o.token)).data;assert.equal(status.emailAccepted,false);assert.equal(status.downloadReady,true);
});
test('enabling email does not send legacy download orders until explicit authenticated request',async t=>{
 const f=await fixture(t,{mode:'off'});const o=await f.create();await f.confirm(o);assert.equal(f.requests.length,0);
 const connected=await fixture(t,{store:f.store});assert.equal(await connected.processOne(),false);assert.equal(connected.requests.length,0);
 assert.equal((await connected.call('/api/admin/orders/'+o.id+'/email',{})).response.status,401);
 await connected.login();assert.equal((await connected.call('/api/admin/orders/'+o.id+'/email',{})).response.status,202);
 assert.equal((await connected.call('/api/admin/orders/'+o.id+'/email',{})).response.status,409);
 await connected.processOne();assert.equal(connected.requests.length,1);assert.equal(connected.requests[0].order.mail_epoch,1);
 assert.equal(f.store.get(o.id).input.emailDelivery,'owner_test');
});
test('mail cannot be queued to other test recipients or refunded orders',async t=>{
 const f=await fixture(t,{mode:'off'});const other=await f.create({email:'other@example.com'});await f.confirm(other);
 const connected=await fixture(t,{store:f.store});await connected.login();assert.equal((await connected.call('/api/admin/orders/'+other.id+'/email',{})).response.status,400);
 const own=await f.create();await f.confirm(own);f.store.refunded(own.id);assert.equal((await connected.call('/api/admin/orders/'+own.id+'/email',{})).response.status,409);assert.equal(connected.requests.length,0);
});
test('Resend errors are classified without persisting credentials or response bodies',async()=>{
 for(const [status,code,retryable] of [[401,'email_credentials',false],[403,'email_verification',false],[429,'email_quota',true],[503,'email_provider',true]]){
  await assert.rejects(sendReport({order:{id:'test',email:buyer.email},pdf:Buffer.from('pdf'),key:'fake',from:'onboarding@resend.dev',fetcher:async()=>({ok:false,status})}),e=>e.code===code&&e.retryable===retryable);
 }
});
