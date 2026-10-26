const EMAIL=/^[-a-zA-Z0-9.!#$%&'*+/=?^_`{|}~]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const normalize=value=>String(value||'').trim().toLowerCase();
function configuration(env,{trial=false,demo=false}={}){
 const mode=demo?'off':env.EMAIL_DELIVERY_MODE||(trial?'off':'customer');
 const from=env.MAIL_FROM||(mode==='owner_test'?'사주문 <onboarding@resend.dev>':'');
 const address=from.match(/<([^<>]+)>$/)?.[1]||from;
 const recipient=normalize(env.TEST_EMAIL_TO),missing=[];
 if(!['off','owner_test','customer'].includes(mode))missing.push('EMAIL_DELIVERY_MODE');
 if(mode!=='off'){
  if(!env.RESEND_API_KEY)missing.push('RESEND_API_KEY');
  if(!EMAIL.test(address)||/[\r\n]/.test(from))missing.push('MAIL_FROM');
  if(mode==='owner_test'&&!EMAIL.test(recipient))missing.push('TEST_EMAIL_TO');
  if(mode==='customer'&&address.toLowerCase().endsWith('@resend.dev'))missing.push('검증된 발신 도메인');
 }
 return {mode,ready:mode!=='off'&&!missing.length,from,recipient,missing};
}
function publicConfiguration(config){
 const [local,domain]=config.recipient.split('@');
 return {mode:config.mode,enabled:config.ready,testRecipientHint:domain?`${local.slice(0,1)}***@${domain}`:null};
}
function orderMode(order){return order.input.emailDelivery||(['trial','demo'].includes(order.mode)?'off':'customer');}
function accepted(order){return !!order.mail_id&&!['free-trial-no-email','local-demo-no-email'].includes(order.mail_id);}
function checkRecipient(config,email){return config.mode!=='owner_test'||normalize(email)===config.recipient;}
function maySend(config,order){return config.ready&&orderMode(order)===config.mode&&checkRecipient(config,order.email);}
module.exports={configuration,publicConfiguration,orderMode,accepted,checkRecipient,maySend};
