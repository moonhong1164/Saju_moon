const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createStore}=require('../server/store.cjs');
const {createApp}=require('../server/app.cjs');
const {passwordHash,passwordMatches}=require('../server/admin-auth.cjs');
const username='owner_admin',password='Test-only-long-password-2026';
async function server(t,env={DEMO_MODE:'1'}){
 const store=createStore(':memory:');const {app}=createApp({store,env});const listener=app.listen(0,'127.0.0.1');await new Promise(r=>listener.once('listening',r));const base='http://127.0.0.1:'+listener.address().port;t.after(async()=>{await new Promise(r=>listener.close(r));store.close();});
 async function call(path,body,{cookie,csrf,origin,custom=true}={}){const response=await fetch(base+'/api/admin/'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(body&&custom?{'X-Admin-Request':'1'}:{}),...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(origin?{Origin:origin}:{})},body:body?JSON.stringify(body):undefined});const data=await response.json();return {response,data,cookie:response.headers.get('set-cookie')?.split(';')[0]};}
 return {store,call,base};
}
test('salted scrypt hashes verify without storing the password',async()=>{
 const a=await passwordHash(password),b=await passwordHash(password);assert.notEqual(a,b);assert.ok(!a.includes(password));assert.equal(await passwordMatches(password,a),true);assert.equal(await passwordMatches('wrong',a),false);
});
test('setup -> login session -> authenticated actions -> logout revokes cookie',async t=>{
 const f=await server(t);assert.equal((await f.call('summary')).response.status,401);
 const state=await f.call('auth/session');assert.equal(state.data.setupRequired,true);
 const created=await f.call('auth/setup',{username,password});assert.equal(created.response.status,201);assert.ok(created.response.headers.get('set-cookie').includes('HttpOnly'));assert.ok(created.response.headers.get('set-cookie').includes('SameSite=Strict'));
 assert.equal(f.store.adminAccount().username,username);assert.ok(!f.store.adminAccount().password_hash.includes(password));
 assert.equal((await f.call('summary',null,{cookie:created.cookie})).response.status,200);
 assert.equal((await f.call('costs',{monthly:0,ads:0,feePercent:0,perReport:0},{cookie:created.cookie})).response.status,403);
 assert.equal((await f.call('costs',{monthly:0,ads:0,feePercent:0,perReport:0},{cookie:created.cookie,csrf:created.data.csrf})).response.status,200);
 assert.equal((await f.call('auth/setup',{username:'attacker',password})).response.status,409);
 await f.call('auth/logout',{},{cookie:created.cookie,csrf:created.data.csrf});assert.equal((await f.call('summary',null,{cookie:created.cookie})).response.status,401);
 const login=await f.call('auth/login',{username,password});assert.equal(login.response.status,200);assert.notEqual(login.cookie,created.cookie);assert.equal((await f.call('auth/session',null,{cookie:login.cookie})).data.authenticated,true);
});
test('production setup needs owner key, and cross-origin or form login is rejected',async t=>{
 const setupToken=crypto.randomBytes(32).toString('hex'),f=await server(t,{ADMIN_SETUP_TOKEN:setupToken});
 assert.equal((await f.call('auth/setup',{username,password})).response.status,403);
 assert.equal((await f.call('auth/setup',{username,password,setupToken},{origin:'https://attacker.example'})).response.status,403);
 assert.equal((await f.call('auth/setup',{username,password,setupToken},{custom:false})).response.status,403);
 assert.equal((await f.call('auth/setup',{username,password,setupToken})).response.status,201);
 assert.equal((await f.call('auth/login',{username,password:'wrong'})).response.status,401);
});
test('password change revokes other sessions and old password no longer works',async t=>{
 const f=await server(t),first=await f.call('auth/setup',{username,password}),second=await f.call('auth/login',{username,password});
 const changed=await f.call('auth/password',{currentPassword:password,newPassword:'New-test-only-password-2026'},{cookie:first.cookie,csrf:first.data.csrf});assert.equal(changed.response.status,200);
 assert.equal((await f.call('summary',null,{cookie:second.cookie})).response.status,401);assert.equal((await f.call('summary',null,{cookie:changed.cookie})).response.status,200);
 assert.equal((await f.call('auth/login',{username,password})).response.status,401);
});
test('expired and fabricated sessions never grant administrator access',async t=>{
 const f=await server(t);const value=crypto.randomBytes(32).toString('hex');f.store.saveAdminSession(crypto.createHash('sha256').update(value).digest('hex'),username,'csrf',Date.now()-1);
 assert.equal((await f.call('summary',null,{cookie:'sajumoon_admin='+value})).response.status,401);
 assert.equal((await f.call('summary',null,{cookie:'sajumoon_admin='+'a'.repeat(64)})).response.status,401);
});

test('production session cookies are Secure and cross-origin mutations are rejected',async t=>{
 const setupToken=crypto.randomBytes(32).toString('hex'),origin='https://admin.example',f=await server(t,{NODE_ENV:'production',PUBLIC_BASE_URL:origin,ADMIN_SETUP_TOKEN:setupToken});
 const created=await f.call('auth/setup',{username,password,setupToken},{origin});assert.equal(created.response.status,201);assert.ok(created.response.headers.get('set-cookie').includes('Secure'));
 assert.equal((await f.call('costs',{monthly:0,ads:0,feePercent:0,perReport:0},{cookie:created.cookie,csrf:created.data.csrf,origin:'https://attacker.example'})).response.status,403);
});

test('administrator account and unexpired login survive a database restart',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'saju-session-')),file=path.join(dir,'db.sqlite');
 try{let store=createStore(file);store.createAdmin(username,await passwordHash(password));const token=crypto.randomBytes(32).toString('hex'),hash=crypto.createHash('sha256').update(token).digest('hex');store.saveAdminSession(hash,username,'csrf',Date.now()+3600000);store.close();store=createStore(file);assert.equal(store.adminAccount().username,username);assert.equal(store.adminSession(hash).username,username);store.close();}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
