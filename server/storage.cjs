const fs=require('node:fs');
const path=require('node:path');
const {createStore}=require('./store.cjs');
const {createPostgresStore}=require('./postgres-store.cjs');
const {resolveDataKey}=require('./data-key.cjs');
async function openStore(env=process.env){
 const encryptionKey=resolveDataKey(env);
 if(env.DATABASE_URL)return createPostgresStore({connectionString:env.DATABASE_URL,encryptionKey});
 if(env.FREE_TRIAL_MODE==='true'&&env.NODE_ENV==='production')throw new Error('Free hosting requires DATABASE_URL; refusing temporary local storage.');
 const dir=env.DATA_DIR||path.join(__dirname,'../.data');fs.mkdirSync(dir,{recursive:true,mode:0o700});return createStore(path.join(dir,'orders.sqlite'),{encryptionKey});
}
module.exports={openStore};
