const {openStore}=require('../server/storage.cjs');
const {passwordHash}=require('../server/admin-auth.cjs');
async function main(){
 const password=process.env.ADMIN_RESET_PASSWORD;
 if(!password||password.length<12||password.length>128)throw new Error('Set ADMIN_RESET_PASSWORD securely to a 12-128 character password in the server environment.');
 const store=await openStore(process.env);
 try{if(!await store.adminAccount())throw new Error('No administrator exists; use the first-account setup page.');await store.changeAdminPassword(await passwordHash(password));console.log('Administrator password reset. All previous sessions were revoked.');}finally{await store.close();}
}
main().catch(()=>{console.error('Password reset failed. Check secure settings, database and password requirements.');process.exitCode=1;});
