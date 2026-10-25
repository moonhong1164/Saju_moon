const $=selector=>document.querySelector(selector);
const error=$('#purchase-error'),payButton=$('#pay-button');
let config=null,active=null,confirmation=null,pollTimer=null;
const statusText={pending_payment:'아직 결제 승인이 완료되지 않았습니다.',paid:'결제가 확인되었습니다. 보고서 제작을 기다리고 있습니다.',processing:'15쪽 PDF를 제작하고 이메일 발송을 요청하고 있습니다.',sent:'메일 서비스에 PDF 발송이 접수되었습니다. 수신함과 스팸함을 확인해 주세요. 아래에서 PDF를 바로 내려받을 수도 있습니다.',delivery_failed:'자동 제작·메일 발송을 완료하지 못했습니다. PDF가 준비되었다면 내려받을 수 있습니다. 주문번호와 함께 판매자에게 문의해 주세요.'};
async function api(url,body,token){
 const response=await fetch(url,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'요청을 완료하지 못했습니다.');return data;
}
function persist(value){sessionStorage.setItem('sajumoon-order',JSON.stringify(value));active=value;}
function showOrder(){
 $('#purchase-panel').hidden=true;$('#order-panel').hidden=false;
 $('#order-number').textContent='주문번호: '+active.id;
 $('#order-title').textContent=config?.demo?'모의 주문 · 실제 결제 및 메일 발송 없음':'나의 상세 풀이 주문';
}
async function refresh(){
 if(!active)return;
 try{
  const data=await api('/api/orders/'+active.id,null,active.token);
  $('#order-error').textContent='';
  $('#order-status').textContent=data.demo&&data.status==='sent'?'모의 주문으로 PDF를 생성했습니다. 실제 결제나 이메일 발송은 하지 않았습니다.':statusText[data.status]||'주문 상태를 확인해 주세요.';
  $('#download-report').hidden=!data.downloadReady;
  clearTimeout(pollTimer);
  if(['paid','processing'].includes(data.status))pollTimer=setTimeout(refresh,4000);
 }catch(e){$('#order-error').textContent=e.message;}
}
async function confirm(){
 if(!active||!confirmation)return;
 $('#retry-payment').hidden=true;
 try{
  await api('/api/orders/'+active.id+'/confirm',confirmation,active.token);
  confirmation=null;sessionStorage.removeItem('sajumoon-confirmation');
  await refresh();
 }catch(e){$('#order-error').textContent=e.message;$('#retry-payment').hidden=false;}
}
$('#retry-payment').addEventListener('click',confirm);
$('#check-order').addEventListener('click',refresh);
$('#download-report').addEventListener('click',async()=>{
 try{
  const response=await fetch('/api/orders/'+active.id+'/pdf',{headers:{Authorization:'Bearer '+active.token}});
  if(!response.ok)throw new Error('PDF를 내려받지 못했습니다. 잠시 후 다시 시도해 주세요.');
  const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download='sajumoon-report.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }catch(e){$('#order-error').textContent=e.message;}
});
$('#buyer-unknown').addEventListener('change',event=>{$('#buyer-time').disabled=event.target.checked;$('#buyer-time').required=!event.target.checked;});
$('#buyer-date').addEventListener('input',event=>{const v=event.target.value;if(/^\d{8}$/.test(v))event.target.value=`${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`;});
$('#purchase-form').addEventListener('submit',async event=>{
 event.preventDefault();if(!config?.enabled)return;
 error.textContent='';payButton.disabled=true;
 try{
 const form=new FormData(event.currentTarget);
 const input=Object.fromEntries(['name','email','date','calendar'].map(k=>[k,String(form.get(k)||'').trim()]));
 input.time=$('#buyer-unknown').checked?'':form.get('time');
 for(const key of ['agreeTerms','agreePrivacy','agreeProduction'])input[key]=form.has(key);
 const order=await api('/api/orders',input);
 persist({id:order.id,token:order.token});
 if(config.demo){
  confirmation={paymentKey:'local-demo',amount:order.amount};showOrder();await confirm();return;
 }
 const sdk=window.TossPayments(config.clientKey);
 await sdk.payment({customerKey:order.id}).requestPayment({method:'CARD',amount:{currency:'KRW',value:order.amount},orderId:order.id,orderName:order.orderName,customerEmail:input.email,successUrl:location.origin+'/checkout.html?result=success',failUrl:location.origin+'/checkout.html?result=fail'});
 }catch(e){error.textContent=e.message||'결제창을 열지 못했습니다.';}finally{payButton.disabled=false;}
});
async function init(){
 try{
 const prefill=JSON.parse(sessionStorage.getItem('sajumoon-prefill')||'null');sessionStorage.removeItem('sajumoon-prefill');
 if(prefill){for(const key of ['name','date','calendar'])$('#purchase-form').elements[key].value=prefill[key]||'';if(prefill.time){$('#buyer-unknown').checked=false;$('#buyer-time').disabled=false;$('#buyer-time').required=true;$('#buyer-time').value=prefill.time;}}
 }catch{}
 const params=new URLSearchParams(location.search);
 // Remove payment keys from the address before any optional SDK request.
 if(location.search)history.replaceState(null,'',location.pathname);
 try{
  config=await api('/api/config');
  $('#service-status').textContent=config.demo?'로컬 체험 모드입니다. 실제로 돈을 받거나 이메일을 보내지 않습니다.':config.enabled?(config.test?'결제사 테스트 모드입니다. 실제 청구되지 않는 테스트 결제입니다. 테스트 주문의 보고서 이메일은 발송될 수 있습니다.':'결제 승인 후 PDF 제작과 이메일 발송을 시작합니다.'):'판매 준비 중입니다. 샘플 PDF를 먼저 확인해 주세요. 실제 결제는 아직 열리지 않았습니다.';
  if(config.seller.name)$('#seller-info').textContent=`판매자: ${config.seller.name} / 사업자번호: ${config.seller.businessId}\n주소: ${config.seller.address}\n문의: ${config.seller.contact}`;
  if(config.enabled&&!config.demo){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://js.tosspayments.com/v2/standard';script.onload=resolve;script.onerror=()=>reject(new Error('결제 모듈을 불러오지 못했습니다.'));document.head.append(script);});}
  payButton.disabled=!config.enabled;
  if(config.demo)payButton.textContent='모의 주문으로 PDF 만들기 · 결제 없음';
  else if(config.test)payButton.textContent='19,000원 테스트 결제 · 실제 청구 없음';
 }catch{$('#service-status').textContent='결제 서버 준비 중입니다. 지금은 결제할 수 없으며, 샘플 PDF는 내려받을 수 있습니다.';}
 try{active=JSON.parse(sessionStorage.getItem('sajumoon-order')||'null');confirmation=JSON.parse(sessionStorage.getItem('sajumoon-confirmation')||'null');}catch{}
 if(params.get('result')==='success'){
  if(!active||params.get('orderId')!==active.id){$('#purchase-error').textContent='구매한 브라우저의 주문 정보가 없습니다. 결제를 다시 하지 말고 판매자에게 문의해 주세요.';return;}
  confirmation={paymentKey:params.get('paymentKey'),amount:Number(params.get('amount'))};sessionStorage.setItem('sajumoon-confirmation',JSON.stringify(confirmation));showOrder();await confirm();
 }else if(params.get('result')==='fail'){
  $('#purchase-error').textContent='결제가 취소되었거나 완료되지 않았습니다. 결제 내역을 확인한 뒤 다시 시도해 주세요.';
 }else if(active){showOrder();if(confirmation)await confirm();else await refresh();}
}
init();
