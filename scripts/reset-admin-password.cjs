const path=require('node:path');
const fs=require('node:fs');
const {createStore}=require('../server/store.cjs');
const {passwordHash}=require('../server/admin-auth.cjs');
async function main(){
 const password=process.env.ADMIN_RESET_PASSWORD;
 if(!password||password.length<12||password.length>128)throw new Error('Set ADMIN_RESET_PASSWORD securely to a 12-128 character password in the server terminal environment.');
 const file=path.join(process.env.DATA_DIR||path.join(__dirname,'../.data'),'orders.sqlite');
 if(!fs.existsSync(file))throw new Error('Order database was not found; check DATA_DIR before resetting.');
 const store=createStore(file,{encryptionKey:process.env.ORDER_DATA_KEY});
 try{if(!store.adminAccount())throw new Error('No administrator exists; use the first-account setup page.');store.changeAdminPassword(await passwordHash(password));console.log('Administrator password reset. All previous sessions were revoked.');}finally{store.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
