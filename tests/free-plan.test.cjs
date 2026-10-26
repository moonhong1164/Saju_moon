const test=require('node:test'),assert=require('node:assert/strict');
const {createStore}=require('../server/store.cjs');
const {openStore}=require('../server/storage.cjs');
const {configuration}=require('../server/app.cjs');
test('free production hosting refuses ephemeral storage when DATABASE_URL is missing',async()=>{
 await assert.rejects(openStore({NODE_ENV:'production',FREE_TRIAL_MODE:'true'}),/DATABASE_URL/);
});
test('free mode forces basic interpretation and requires encrypted storage and an owner account',()=>{
 const env={FREE_TRIAL_MODE:'true',ORDER_DATA_KEY:Buffer.alloc(32,1).toString('base64'),STORAGE_ENCRYPTED:'true',ADMIN_ACCOUNT_READY:'true',REPORT_ENGINE:'ai',SALES_ENABLED:'true'};
 assert.equal(configuration(env).enabled,true);assert.equal(configuration(env).reportEngine,'rules');assert.equal(configuration(env).trial,true);
 assert.equal(configuration({...env,STORAGE_ENCRYPTED:'false'}).enabled,false);assert.equal(configuration({...env,ADMIN_ACCOUNT_READY:'false'}).enabled,false);
});
test('free SQLite development quotas reject extra orders without partial records',()=>{
 const store=createStore(':memory:');try{for(let i=0;i<10;i++)store.create({name:'test',date:'2000-01-07',calendar:'solar',time:''},'test@example.com','trial',{amount:0});assert.throws(()=>store.create({},'test@example.com','trial',{amount:0}),{code:'SAJU_TRIAL_LIMIT'});assert.equal(store.summary('trial').totals.orders,10);assert.equal(store.summary('trial').totals.gross,0);}finally{store.close();}
});
