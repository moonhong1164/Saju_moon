const {openStore}=require('./storage.cjs');
const {resolveDataKey}=require('./data-key.cjs');
const {createApp}=require('./app.cjs');
async function main(){
 const env={...process.env,ORDER_DATA_KEY:resolveDataKey(process.env)};
 const store=await openStore(env);await store.cleanup();
 const {app,processOne,config}=createApp({store,env});
 const host=config.demo||config.test&&!config.trial?'127.0.0.1':'0.0.0.0',port=Number(env.PORT||3000);
 const server=app.listen(port,host,()=>{console.log(`Sajumoon server started on port ${port}; storage=${store.backend||'sqlite'}; ${config.trial?'FREE TRIAL (no charge, AI or email)':config.demo?'LOCAL DEMO (no charge or email)':config.enabled?'payment provider enabled':'sales disabled'}`);processOne().catch(()=>{});});
 const timer=setInterval(()=>{processOne().catch(()=>{});},10000);timer.unref();
 const cleanup=setInterval(()=>{Promise.resolve().then(()=>store.cleanup()).catch(()=>{});},3600000);cleanup.unref();
 async function stop(){clearInterval(timer);clearInterval(cleanup);server.close(async()=>{await store.close();process.exit(0);});}
 process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
main().catch(()=>{console.error('Startup failed. Check database connection, original encryption secret, and storage settings. Credentials were not logged.');process.exitCode=1;});
