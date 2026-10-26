const crypto=require('node:crypto');
const {promisify}=require('node:util');
const {rateLimit}=require('express-rate-limit');
const scrypt=promisify(crypto.scrypt);
const COOKIE='sajumoon_admin';
const HOURS=8;
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&crypto.timingSafeEqual(Buffer.from(digest(a),'hex'),Buffer.from(digest(b),'hex'));
async function passwordHash(password){const salt=crypto.randomBytes(16).toString('hex');const key=await scrypt(password,salt,64);return `scrypt$${salt}$${key.toString('hex')}`;}
async function passwordMatches(password,encoded){
 const match=/^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded||'');
 const salt=match?.[1]||'0'.repeat(32),expected=match?.[2]||'0'.repeat(128);
 const actual=await scrypt(password,salt,64);
 return !!match&&crypto.timingSafeEqual(actual,Buffer.from(expected,'hex'));
}
function registerAdminAuth(app,{store,config,env}){
 let configurationIssue=null;
 try{if(env.PUBLIC_BASE_URL){const u=new URL(env.PUBLIC_BASE_URL);if(!['http:','https:'].includes(u.protocol)||env.NODE_ENV==='production'&&u.protocol!=='https:')configurationIssue='PUBLIC_BASE_URL을 실제 HTTPS 서버 주소로 설정해 주세요.';}else if(env.NODE_ENV==='production')configurationIssue='운영 서버의 PUBLIC_BASE_URL을 실제 HTTPS 주소로 설정해 주세요.';}catch{configurationIssue='서버의 PUBLIC_BASE_URL 주소 형식을 확인해 주세요.';}
 const secure=env.NODE_ENV==='production'||config.base.startsWith('https:');
 const options={httpOnly:true,secure,sameSite:'strict',path:'/api/admin',maxAge:HOURS*3600000};
 function cookie(req){const value=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);return /^[a-f0-9]{64}$/.test(value||'')?value:null;}
 async function read(req){const value=cookie(req);return value?await store.adminSession(digest(value)):null;}
 function sameOrigin(req,res,next){
  let expected;try{expected=new URL(env.PUBLIC_BASE_URL||`${req.protocol}://${req.get('host')}`).origin;}catch{return res.status(403).json({error:'서비스 주소 설정을 확인해 주세요.'});}
  if(req.get('Origin')&&req.get('Origin')!==expected||req.get('X-Admin-Request')!=='1')return res.status(403).json({error:'관리자 화면에서 다시 요청해 주세요.'});
  next();
 }
 async function authenticated(req,res,next){
  const session=await read(req);if(!session)return res.status(401).json({error:'관리자 로그인이 필요합니다.'});
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!equal(req.get('X-CSRF-Token'),session.csrf))return res.status(403).json({error:'로그인 상태를 새로 확인한 뒤 다시 시도해 주세요.'});
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('Origin')){
   let expected;try{expected=new URL(env.PUBLIC_BASE_URL||`${req.protocol}://${req.get('host')}`).origin;}catch{return res.status(403).json({error:'서비스 주소 설정을 확인해 주세요.'});}
   if(req.get('Origin')!==expected)return res.status(403).json({error:'관리자 화면에서 다시 요청해 주세요.'});
  }
  req.adminSession=session;next();
 }
 const loginLimit=rateLimit({windowMs:15*60000,limit:10,skipSuccessfulRequests:true,standardHeaders:true,legacyHeaders:false,message:{error:'로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.'}});
 async function establish(res,username){const token=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(24).toString('hex'),expires=Date.now()+HOURS*3600000;await store.saveAdminSession(digest(token),username,csrf,expires);res.cookie(COOKIE,token,options);return {authenticated:true,username,csrf,expires};}
 app.get('/api/admin/auth/session',async(req,res)=>{const session=await read(req);res.json(session?{authenticated:true,username:session.username,csrf:session.csrf,expires:session.expires}:{authenticated:false,configurationIssue,serviceOrigin:env.PUBLIC_BASE_URL?config.base:null,setupRequired:!await store.adminAccount(),localSetup:config.demo&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)});});
 app.post('/api/admin/auth/setup',loginLimit,sameOrigin,async(req,res)=>{
  if(await store.adminAccount())return res.status(409).json({error:'관리자 계정이 이미 있습니다. 로그인해 주세요.'});
  const local=config.demo&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  if(!local&&(!env.ADMIN_SETUP_TOKEN||env.ADMIN_SETUP_TOKEN.length<32||!equal(req.body?.setupToken,env.ADMIN_SETUP_TOKEN)))return res.status(403).json({error:'서버 소유자의 초기 설정 키가 필요합니다.'});
  const {username,password}=req.body||{};
  if(typeof username!=='string'||!/^[A-Za-z0-9_.-]{3,40}$/.test(username)||typeof password!=='string'||password.length<12||password.length>128)return res.status(400).json({error:'아이디는 영문·숫자 3~40자, 비밀번호는 12~128자로 입력해 주세요.'});
  const hash=await passwordHash(password);
  if(!await store.createAdmin(username,hash))return res.status(409).json({error:'관리자 계정이 이미 있습니다.'});
  res.status(201).json(await establish(res,username));
 });
 app.post('/api/admin/auth/login',loginLimit,sameOrigin,async(req,res)=>{
  const {username,password}=req.body||{};
  if(typeof username!=='string'||typeof password!=='string'||username.length>40||password.length>128)return res.status(401).json({error:'아이디 또는 비밀번호를 확인해 주세요.'});
  const account=await store.adminAccount();const matches=await passwordMatches(password,account?.password_hash);
  if(!account||!equal(username,account.username)||!matches)return res.status(401).json({error:'아이디 또는 비밀번호를 확인해 주세요.'});
  const previous=cookie(req);if(previous)await store.deleteAdminSession(digest(previous));
  res.json(await establish(res,account.username));
 });
 app.post('/api/admin/auth/logout',authenticated,async(req,res)=>{await store.deleteAdminSession(req.adminSession.token_hash);res.clearCookie(COOKIE,{httpOnly:true,secure,sameSite:'strict',path:'/api/admin'});res.json({authenticated:false});});
 app.post('/api/admin/auth/password',authenticated,async(req,res)=>{
  const {currentPassword,newPassword}=req.body||{};
  if(typeof currentPassword!=='string'||currentPassword.length>128||typeof newPassword!=='string'||newPassword.length<12||newPassword.length>128)return res.status(400).json({error:'새 비밀번호를 12~128자로 입력해 주세요.'});
  const account=await store.adminAccount();if(!await passwordMatches(currentPassword,account?.password_hash))return res.status(401).json({error:'현재 비밀번호를 확인해 주세요.'});
  await store.changeAdminPassword(await passwordHash(newPassword));res.json(await establish(res,account.username));
 });
 return authenticated;
}
module.exports={registerAdminAuth,passwordHash,passwordMatches};
