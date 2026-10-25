const fs=require('node:fs');const path=require('node:path');
const {createStore}=require('./store.cjs');const {createApp}=require('./app.cjs');
const dir=process.env.DATA_DIR||path.join(__dirname,'../.data');
fs.mkdirSync(dir,{recursive:true,mode:0o700});
const store=createStore(path.join(dir,'orders.sqlite'),{encryptionKey:process.env.ORDER_DATA_KEY});
store.cleanup();
const {app,processOne,config}=createApp({store});
const host=config.test?'127.0.0.1':'0.0.0.0',port=Number(process.env.PORT||3000);
const server=app.listen(port,host,()=>console.log(`Sajumoon server started on port ${port}; ${config.demo?'LOCAL DEMO (no charge or email)':config.enabled?'payment provider enabled':'sales disabled'}`));
const timer=setInterval(()=>{processOne();},10000);timer.unref();
const cleanup=setInterval(()=>store.cleanup(),3600000);cleanup.unref();
function stop(){clearInterval(timer);clearInterval(cleanup);server.close(()=>{store.close();process.exit(0);});}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
