const express=require('express');
const helmet=require('helmet');
const {rateLimit}=require('express-rate-limit');
const path=require('node:path');
const {calculate}=require('../src/saju.cjs');
const PRODUCT=require('./product.cjs');
const {createPdf,sections}=require('./report.cjs');
const {generateAiReport}=require('./ai-report.cjs');
const {registerOperations,paid}=require('./operations.cjs');
const {confirmToss,sendReport,cancelToss}=require('./providers.cjs');
function configuration(env=process.env){
 const demo=env.DEMO_MODE==='1'&&env.NODE_ENV!=='production';
 const required=['TOSS_CLIENT_KEY','TOSS_SECRET_KEY','RESEND_API_KEY','MAIL_FROM','PUBLIC_BASE_URL','SELLER_NAME','SELLER_BUSINESS_ID','SELLER_CONTACT','SELLER_ADDRESS'];
 let base;try{base=new URL(env.PUBLIC_BASE_URL);}catch{}
 const reportEngine=env.REPORT_ENGINE||'rules';
 const reportReady=reportEngine==='rules'||reportEngine==='ai'&&!!env.AI_PROVIDER_KEY&&!!env.AI_MODEL;
 const protectedStorage=!!env.ORDER_DATA_KEY&&Buffer.from(env.ORDER_DATA_KEY,'base64').length===32;
 const enabled=protectedStorage&&!!env.ADMIN_ACCESS_TOKEN&&env.ADMIN_ACCESS_TOKEN.length>=32&&env.SALES_ENABLED==='true'&&env.POLICIES_APPROVED==='true'&&required.every(k=>env[k])&&base?.protocol==='https:'&&env.TOSS_CLIENT_KEY.startsWith('live_ck_')&&env.TOSS_SECRET_KEY.startsWith('live_sk_');
 const sandbox=env.NODE_ENV!=='production'&&env.SALES_ENABLED==='test'&&required.every(k=>env[k])&&base&&env.TOSS_CLIENT_KEY.startsWith('test_ck_')&&env.TOSS_SECRET_KEY.startsWith('test_sk_');
 return {demo,enabled:!!((demo||enabled||sandbox)&&reportReady),reportEngine,test:!!(demo||sandbox),clientKey:env.TOSS_CLIENT_KEY,base:env.PUBLIC_BASE_URL||'http://127.0.0.1:3000',seller:{name:env.SELLER_NAME||'',businessId:env.SELLER_BUSINESS_ID||'',contact:env.SELLER_CONTACT||'',address:env.SELLER_ADDRESS||''}};
}
function createApp({store,env=process.env,pay=confirmToss,mail=sendReport,cancel=cancelToss,makePdf=createPdf,makeAi=generateAiReport}){
 const app=express(),config=configuration(env),root=path.join(__dirname,'..');
 const mode=config.demo?'demo':config.test?'test':'live';
 app.disable('x-powered-by');
 app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'",'https://js.tosspayments.com'],styleSrc:["'self'","'unsafe-inline'"],connectSrc:["'self'",'https://*.tosspayments.com'],frameSrc:['https://*.tosspayments.com'],formAction:["'self'",'https://*.tosspayments.com'],imgSrc:["'self'",'data:','https://*.tosspayments.com'],upgradeInsecureRequests:env.NODE_ENV==='production'?[]:null}},referrerPolicy:{policy:'no-referrer'},strictTransportSecurity:env.NODE_ENV==='production'?undefined:false}));
 app.use(express.json({limit:'8kb'}));
 app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.use('/api',rateLimit({windowMs:60000,limit:300,standardHeaders:true,legacyHeaders:false,message:{error:'요청이 많습니다. 잠시 후 다시 시도해 주세요.'}}));
 app.get('/api/config',(_req,res)=>res.json({product:PRODUCT,enabled:config.enabled,demo:config.demo,test:config.test,clientKey:config.enabled&&!config.demo?config.clientKey:undefined,seller:config.seller,reportEngine:config.reportEngine}));
 app.get('/health',(_req,res)=>res.json({ok:true}));
 function open(req,res,next){
   if(!config.enabled)return res.status(503).json({error:'결제 서비스 준비 중입니다. 실제 결제는 아직 열리지 않았습니다.'});
   if(config.test&&!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return res.status(403).json({error:'테스트 결제는 로컬에서만 가능합니다.'});
   next();
 }
 app.post('/api/orders',open,(req,res)=>{
  const {email,name='',date,calendar='solar',time='',agreeTerms,agreePrivacy,agreeProduction,agreeAi}=req.body||{};
  if(typeof email!=='string'||email.length>254||!/^[-a-zA-Z0-9.!#$%&'*+/=?^_`{|}~]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)||email.includes('..'))return res.status(400).json({error:'수신 가능한 이메일 주소를 확인해 주세요.'});
  if(typeof name!=='string'||name.length>30||!/^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9 .·_-]*$/.test(name))return res.status(400).json({error:'이름은 한글·영문·숫자로 30자 이내로 입력해 주세요.'});
  if(agreeTerms!==true||agreePrivacy!==true||agreeProduction!==true)return res.status(400).json({error:'약관·개인정보·보고서 제작 동의를 확인해 주세요.'});
  if(typeof date!=='string'||typeof calendar!=='string'||typeof time!=='string')return res.status(400).json({error:'출생 정보를 확인해 주세요.'});
  if(config.reportEngine==='ai'&&agreeAi!==true)return res.status(400).json({error:'AI 해설 작성을 위한 계산 정보 처리 동의가 필요합니다.'});
  const input={name:name.trim(),date,calendar,time};
  try{calculate(input);}catch(e){return res.status(400).json({error:e.message});}
  const order=store.create(input,email.trim(),mode,{source:req.body.source,campaign:req.body.campaign,reportEngine:config.reportEngine});
  res.status(201).json({...order,amount:PRODUCT.amount,currency:PRODUCT.currency,orderName:PRODUCT.name});
 });
 function auth(req,res,next){
  const token=req.get('Authorization')?.replace(/^Bearer /,'');
  const order=store.auth(req.params.id,token);
  if(!order)return res.status(404).json({error:'이 브라우저에서 주문을 확인할 수 없습니다. 구매한 기기에서 다시 열거나 판매자에게 문의해 주세요.'});
  req.order=order;next();
 }
 app.post('/api/orders/:id/confirm',open,auth,async(req,res)=>{
  const o=req.order;
  if(o.mode!==mode)return res.status(409).json({error:'주문을 생성한 결제 모드와 현재 서비스 모드가 다릅니다. 판매자에게 문의해 주세요.'});
  if(o.status==='refunded'||o.refund_state)return res.status(409).json({error:'환불 요청 또는 처리 중인 주문입니다.'});
  if(['paid','processing','sent','delivery_failed'].includes(o.status))return res.json({status:o.status});
  const {amount,paymentKey}=req.body||{};
  if(amount!==PRODUCT.amount)return res.status(400).json({error:'결제 금액이 주문 금액과 다릅니다.'});
  if(typeof paymentKey!=='string'||!paymentKey||paymentKey.length>300)return res.status(400).json({error:'결제 승인 정보를 확인해 주세요.'});
  try{
    if(config.demo){if(paymentKey!=='local-demo')return res.status(400).json({error:'잘못된 모의 결제 요청입니다.'});}
    else await pay({paymentKey,orderId:o.id,secret:env.TOSS_SECRET_KEY});
    store.paid(o.id,config.demo?`demo-${o.id}`:paymentKey);
    res.json({status:store.get(o.id).status});
  }catch{store.error(o.id,'payment_confirmation');return res.status(502).json({error:'결제 승인 확인이 지연되고 있습니다. 중복 결제하지 말고 이 주문에서 다시 확인해 주세요.'});}
 });
 app.get('/api/orders/:id',auth,(req,res)=>res.json({id:req.order.id,status:req.order.refund_state&&req.order.refund_state!=='declined'?(req.order.refund_state==='refunded'?'refunded':'refund_'+req.order.refund_state):req.order.status,amount:PRODUCT.amount,pages:PRODUCT.pages,downloadReady:paid(req.order)&&!!req.order.pdf,reportReady:paid(req.order)&&!!req.order.report,demo:config.demo}));
 app.get('/api/orders/:id/pdf',auth,(req,res)=>{
  if(!req.order.pdf||!paid(req.order))return res.status(404).json({error:'아직 PDF가 준비되지 않았습니다.'});
  res.set({'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="sajumoon-report.pdf"'}).send(Buffer.from(req.order.pdf));
 });
 let busy=false;
 async function processOne(){
  if(busy)return false;busy=true;
  let order,stage='report_generation';
  try{
   if(!config.enabled)return false;
   order=store.claim(mode);if(!order)return false;
   if(Date.now()-(order.delivery_started||order.paid_at)>23*3600000){store.failed(order.id,5);return false;}
   let report=order.report;
   if(!report){
    report=!order.pdf&&order.report_kind==='ai'?await makeAi(order.input,{key:env.AI_PROVIDER_KEY,model:env.AI_MODEL}):sections(order.input);
    store.report(order.id,report,report.kind||'rules');
   }
   stage='pdf_generation';
   const pdf=order.pdf?Buffer.from(order.pdf):await makePdf(order.input,report);
   const current=store.get(order.id);
   if(current.refund_state&&current.refund_state!=='declined'){store.failed(order.id,0);return false;}

   if(!order.pdf)store.pdf(order.id,pdf);
   stage='email_submission';
   const id=config.demo?'local-demo-no-email':await mail({order,pdf,key:env.RESEND_API_KEY,from:env.MAIL_FROM});
   store.sent(order.id,id);return true;
  }catch{if(order)store.failed(order.id,order.attempts,stage);return false;}finally{busy=false;}
 }
 registerOperations(app,{store,config,mode,env,auth,cancel});
 for(const filename of ['admin.html','admin.js','admin.css','traffic.js','policies.html','policies.js','index.html','style.css','app.js','checkout.html','checkout.js','checkout.css','sample-report.pdf','THIRD_PARTY_NOTICES.txt']){
  app.get(filename==='index.html'?['/','/index.html']:`/${filename}`,(_req,res)=>res.sendFile(path.join(root,filename)));
 }
 app.use((error,_req,res,_next)=>res.status(error.type==='entity.too.large'?413:400).json({error:'요청 내용을 확인해 주세요.'}));
 return {app,processOne,config};
}
module.exports={createApp,configuration};
