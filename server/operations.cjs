const PRODUCT=require('./product.cjs');
const {sections}=require('./report.cjs');
const {registerAdminAuth}=require('./admin-auth.cjs');
const paid=o=>!!o.paid_at&&o.status!=='refunded'&&(!o.refund_state||o.refund_state==='declined');
function registerOperations(app,{store,config,mode,env,auth,cancel}){
 function text(value,min=1,max=1500){return typeof value==='string'&&value.trim().length>=min&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);}
 const admin=registerAdminAuth(app,{store,config,env});
 async function ownMode(req,res,next){const o=await store.get(req.params.id);if(!o||o.mode!==mode)return res.status(404).json({error:'주문을 찾을 수 없습니다.'});req.managed=o;next();}
 app.post('/api/events',async(req,res)=>{
  if(!['landing','checkout'].includes(req.body?.page))return res.status(400).json({error:'잘못된 집계 요청입니다.'});
  await store.visit(mode,req.body.page,req.body.source,req.body.campaign);res.status(202).json({ok:true});
 });
 app.get('/api/orders/:id/report',auth,async(req,res)=>{
  const toc=sections(req.order.input).rows.map(([title],i)=>({page:i+1,title}));
  if(!paid(req.order))return res.status(402).json({locked:true,toc,error:req.order.status==='refunded'?'환불된 주문입니다.':'결제 확인 후 상세 리포트가 열립니다.'});
  if(!req.order.report)return res.status(202).json({locked:false,ready:false,toc});
  res.json({locked:false,ready:true,kind:req.order.report_kind,chapters:req.order.report.rows.map(([title,subtitle,paragraphs],i)=>({page:i+1,title,subtitle,paragraphs}))});
 });
 app.get('/api/orders/:id/tickets',auth,async(req,res)=>res.json({tickets:await store.tickets(req.order.id)}));
 app.post('/api/orders/:id/tickets',auth,async(req,res)=>{
  if(!text(req.body?.message,5))return res.status(400).json({error:'문의 내용을 5~1,500자로 입력해 주세요.'});
  const id=await store.ticket(req.order.id,'support',req.body.message.trim());res.status(201).json({id});
 });
 app.post('/api/orders/:id/refund-request',auth,async(req,res)=>{
  if(!text(req.body?.reason,5,500))return res.status(400).json({error:'환불 사유를 5~500자로 입력해 주세요.'});
  if(!await store.requestRefund(req.order.id,req.body.reason.trim()))return res.status(409).json({error:'이미 요청했거나 환불 요청이 가능한 결제 주문이 아닙니다.'});
  res.status(202).json({status:'refund_requested'});
 });
 app.get('/api/admin/summary',admin,async(_req,res)=>res.json({...(await store.summary(mode)),demo:config.demo,trial:config.trial,encrypted:store.encrypted,reportEngine:config.reportEngine,salesEnabled:config.enabled}));
 app.get('/api/admin/orders/:id',admin,ownMode,async(req,res)=>{const o=req.managed;res.json({id:o.id,input:o.input,email:o.email,status:o.status,refundState:o.refund_state,hasPdf:!!o.pdf,reportKind:o.report_kind,created:o.created,paidAt:o.paid_at,errorCode:o.last_error,tickets:await store.tickets(o.id),audit:await store.audit(o.id)});});
 app.get('/api/admin/orders/:id/pdf',admin,ownMode,async(req,res)=>{if(!req.managed.pdf)return res.status(404).json({error:'PDF가 없습니다.'});res.type('application/pdf').set('Content-Disposition','attachment; filename="sajumoon-report.pdf"').send(req.managed.pdf);});
 app.post('/api/admin/orders/:id/resend',admin,ownMode,async(req,res)=>{
  if(!await store.retry(req.managed.id))return res.status(409).json({error:'발송 완료·최종 실패 주문만 재발송할 수 있습니다. 환불 진행 중에는 재발송하지 않습니다.'});
  res.status(202).json({status:'queued'});
 });
 app.post('/api/admin/orders/:id/reply',admin,ownMode,async(req,res)=>{
  if(!text(req.body?.message,1)||!(await store.tickets(req.managed.id)).some(t=>t.id===req.body.ticketId))return res.status(400).json({error:'문의와 답변 내용을 확인해 주세요.'});
  await store.reply(req.body.ticketId,req.body.message.trim());res.json({status:'answered'});
 });
 app.post('/api/admin/orders/:id/refund',admin,ownMode,async(req,res)=>{
  if(!text(req.body?.reason,5,500))return res.status(400).json({error:'환불 사유를 5~500자로 입력해 주세요.'});
  if(req.managed.status==='refunded')return res.json({status:'refunded'});
  if(!config.demo&&!config.trial&&!env.TOSS_SECRET_KEY)return res.status(503).json({error:'결제사 서버 키가 없어 환불을 실행할 수 없습니다.'});
  if(!await store.reserveRefund(req.managed.id))return res.status(409).json({error:'결제가 없거나 제작·발송 중입니다. 잠시 후 상태를 다시 확인해 주세요.'});
  try{if(!config.demo&&!config.trial)await cancel({order:req.managed,reason:req.body.reason,secret:env.TOSS_SECRET_KEY});await store.refunded(req.managed.id);res.json({status:'refunded',amount:config.trial?0:PRODUCT.amount,demo:config.demo,trial:config.trial});}
  catch{await store.error(req.managed.id,'refund_confirmation');res.status(502).json({error:'결제사의 환불 완료를 확인하지 못했습니다. 환불 처리 상태를 유지합니다. 새 주문을 만들지 말고 같은 주문에서 다시 확인해 주세요.'});}
 });
 app.post('/api/admin/orders/:id/decline-refund',admin,ownMode,async(req,res)=>{
  if(req.managed.refund_state!=='requested'||!text(req.body?.message,5,500))return res.status(409).json({error:'검토 대기 중인 환불 요청과 답변을 확인해 주세요.'});
  await store.declineRefund(req.managed.id,req.body.message.trim());res.json({status:'declined'});
 });
 app.post('/api/admin/costs',admin,async(req,res)=>{
  const value=Object.fromEntries(['monthly','ads','feePercent','perReport'].map(k=>[k,req.body?.[k]]));
  if(Object.entries(value).some(([k,v])=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>(k==='feePercent'?100:100000000)))return res.status(400).json({error:'비용을 0 이상의 숫자로 입력해 주세요. 수수료율은 0~100%입니다.'});
  await store.costs(mode,value);res.json({ok:true});
 });
}
module.exports={registerOperations,paid};
