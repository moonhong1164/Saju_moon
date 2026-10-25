const PRODUCT=require('./product.cjs');
class ProviderError extends Error{constructor(message){super(message);this.name='ProviderError';}}
async function confirmToss({paymentKey,orderId,secret,fetcher=fetch}){
 const response=await fetcher('https://api.tosspayments.com/v1/payments/confirm',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(secret+':').toString('base64')}`,'Content-Type':'application/json','Idempotency-Key':`confirm-${orderId}`},body:JSON.stringify({paymentKey,orderId,amount:PRODUCT.amount}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new ProviderError('결제 승인 확인을 완료하지 못했습니다. 같은 주문으로 다시 확인해 주세요.');
 const data=await response.json();
 if(data.orderId!==orderId||data.totalAmount!==PRODUCT.amount||data.currency!=='KRW'||data.status!=='DONE'||data.paymentKey!==paymentKey)throw new ProviderError('결제 승인 내용이 주문과 일치하지 않습니다.');
 return data;
}
async function sendReport({order,pdf,key,from,fetcher=fetch}){
 const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`saju-report-${order.id}${order.mail_epoch?'-'+order.mail_epoch:''}`},body:JSON.stringify({from,to:[order.email],subject:'[사주문] 15쪽 상세 풀이 PDF를 보내드립니다',text:'주문하신 사주문 상세 풀이 보고서를 첨부했습니다. 본 PDF는 전통 상징에 따른 참고용 해설입니다.\n주문번호: '+order.id,attachments:[{filename:'sajumoon-report.pdf',content:pdf.toString('base64')}]}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new ProviderError('메일 서비스에서 발송 요청을 접수하지 못했습니다.');
 const data=await response.json();if(!data.id)throw new ProviderError('메일 발송 접수번호가 없습니다.');return data.id;
}
async function cancelToss({order,reason,secret,fetcher=fetch}){
 const headers={Authorization:`Basic ${Buffer.from(secret+':').toString('base64')}`,'Content-Type':'application/json','Idempotency-Key':`refund-${order.id}`};
 const url='https://api.tosspayments.com/v1/payments/'+encodeURIComponent(order.payment_key);
 let response=await fetcher(url+'/cancel',{method:'POST',headers,body:JSON.stringify({cancelReason:reason,cancelAmount:PRODUCT.amount}),signal:AbortSignal.timeout(15000)});
 // A previous timeout may have completed the cancellation. Reconcile read-only.
 if(!response.ok)response=await fetcher(url,{headers:{Authorization:headers.Authorization},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new ProviderError('환불 상태를 확인하지 못했습니다.');
 const data=await response.json();
 if(data.orderId!==order.id||data.paymentKey!==order.payment_key||data.status!=='CANCELED'||data.totalAmount!==PRODUCT.amount||data.balanceAmount!==0)throw new ProviderError('전액 환불 완료를 확인하지 못했습니다.');
 return data;
}
module.exports={confirmToss,sendReport,cancelToss,ProviderError};
