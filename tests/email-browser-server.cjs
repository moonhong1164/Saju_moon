// Isolated local UI fixture. No real mail provider or deployment credentials.
const {createStore}=require('../server/store.cjs');
const {createApp}=require('../server/app.cjs');
const {passwordHash}=require('../server/admin-auth.cjs');
const {createPdf,sections}=require('../server/report.cjs');
(async()=>{
 const store=createStore(':memory:',{encryptionKey:Buffer.alloc(32,1).toString('base64')});
 store.createAdmin('browser_mail_owner',await passwordHash('Only-for-email-browser-tests-2026'));
 const input={name:'테스트',date:'2005-12-23',calendar:'solar',time:'08:37',trial:true,emailDelivery:'off'};
 const legacy=store.create(input,'owner@example.com','trial',{amount:0});store.paid(legacy.id,'trial-'+legacy.id);store.report(legacy.id,sections(input),'rules');store.pdf(legacy.id,await createPdf(input));store.sent(legacy.id,'free-trial-no-email');
 let count=0;
 const {app,processOne}=createApp({store,env:{NODE_ENV:'test',FREE_TRIAL_MODE:'true',ORDER_DATA_KEY:Buffer.alloc(32,1).toString('base64'),EMAIL_DELIVERY_MODE:'owner_test',RESEND_API_KEY:'fake-key-never-used',TEST_EMAIL_TO:'owner@example.com'},mail:async({pdf})=>{if(pdf.subarray(0,4).toString()!=='%PDF')throw new Error('Invalid PDF');count++;return 'fake-mail-'+count;}});
 app.get('/test/mail-count',(_req,res)=>res.json({count}));
 const server=app.listen(3150,'127.0.0.1',()=>console.log('Local email UI fixture ready; no actual email sending.'));
 const timer=setInterval(()=>processOne().catch(()=>{}),100);timer.unref();
 process.on('SIGTERM',()=>{clearInterval(timer);server.close(()=>{store.close();process.exit(0);});});
})().catch(()=>{process.exitCode=1;});
