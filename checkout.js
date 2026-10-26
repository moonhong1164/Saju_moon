const $=selector=>document.querySelector(selector);
const error=$('#purchase-error'),payButton=$('#pay-button');
let config=null,active=null,confirmation=null,pollTimer=null;
const statusText={refund_requested:'환불 검토를 요청했습니다. 운영자의 답변을 기다려 주세요.',refund_processing:'결제사 환불 상태를 확인 중입니다.',refunded:'19,000원 전액 환불 처리가 확인되었습니다. 상세 리포트 접근은 종료됩니다.',pending_payment:'아직 결제 승인이 완료되지 않았습니다.',paid:'결제가 확인되었습니다. 보고서 제작을 기다리고 있습니다.',processing:'15쪽 PDF를 제작하고 이메일 발송을 요청하고 있습니다.',sent:'메일 서비스에 PDF 발송이 접수되었습니다. 수신함과 스팸함을 확인해 주세요. 아래에서 PDF를 바로 내려받을 수도 있습니다.',delivery_failed:'자동 제작·메일 발송을 완료하지 못했습니다. PDF가 준비되었다면 내려받을 수 있습니다. 주문번호와 함께 판매자에게 문의해 주세요.'};
async function api(url,body,token){
 const response=await fetch(url,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'요청을 완료하지 못했습니다.');return data;
}
function persist(value){sessionStorage.setItem('sajumoon-order',JSON.stringify(value));active=value;}
function showOrder(){
 $('#purchase-panel').hidden=true;$('#order-panel').hidden=false;
 $('#order-number').textContent='주문번호: '+active.id;
 $('#order-title').textContent=config?.trial?(config.email?.enabled?'무료 테스트 주문 · 이메일 발송 연결':'무료 테스트 주문 · 실제 결제 및 메일 발송 없음'):config?.demo?'모의 주문 · 실제 결제 및 메일 발송 없음':'나의 상세 풀이 주문';
}
async function refresh(){
 if(!active)return;
 try{
  const data=await api('/api/orders/'+active.id,null,active.token);
  $('#order-error').textContent='';
  $('#order-status').textContent=data.trial&&data.status.startsWith('refund_')?'무료 테스트 주문의 취소 요청을 확인 중입니다. 실제 금액 이동은 없습니다.':data.trial&&data.status==='refunded'?'무료 테스트 주문을 취소했습니다. 실제 금액 이동은 없습니다.':data.trial&&data.status==='sent'&&data.emailAccepted?'PDF 이메일 발송 요청이 접수되었습니다. 수신함과 스팸함을 확인해 주세요. 아래에서 바로 내려받을 수도 있습니다.':data.trial&&data.status==='sent'?'무료 테스트 PDF가 준비되었습니다. 실제 결제·이메일 발송 없이 아래에서 내려받을 수 있습니다.':data.demo&&data.status==='sent'?'모의 주문으로 PDF를 생성했습니다. 실제 결제나 이메일 발송은 하지 않았습니다.':statusText[data.status]||'주문 상태를 확인해 주세요.';
  $('#download-report').hidden=!data.downloadReady;
  $('#open-report').hidden=!data.reportReady;
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
 for(const key of ['agreeTerms','agreePrivacy','agreeProduction','agreeAi'])input[key]=form.has(key);
 try{const a=JSON.parse(sessionStorage.getItem('sajumoon-attribution')||'{}');input.source=a.source;input.campaign=a.campaign;}catch{}
 const order=await api('/api/orders',input);
 persist({id:order.id,token:order.token});
 if(config.demo||config.trial){
  confirmation={paymentKey:config.trial?'trial-no-charge':'local-demo',amount:order.amount};showOrder();await confirm();return;
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
  $('#service-status').textContent=config.trial?'무료 테스트 모드입니다. 실제 결제·이메일·유료 AI 호출 없이 웹 리포트와 PDF를 생성합니다. 무료 서버는 첫 접속에 대기 시간이 있을 수 있습니다. 테스트 보호 한도는 하루 10건·보관 100건입니다.':config.demo?'로컬 체험 모드입니다. 실제로 돈을 받거나 이메일을 보내지 않습니다.':config.enabled?(config.test?'결제사 테스트 모드입니다. 실제 청구되지 않는 테스트 결제입니다. 테스트 주문의 보고서 이메일은 발송될 수 있습니다.':'결제 승인 후 PDF 제작과 이메일 발송을 시작합니다.'):'판매 준비 중입니다. 샘플 PDF를 먼저 확인해 주세요. 실제 결제는 아직 열리지 않았습니다.';
  if(config.reportEngine==='ai'){$('#report-method-note').textContent='검증된 명식·오행에 AI 해설을 연결합니다. 전문가 개별 감정·대운·용신·미래 사건 예측은 포함하지 않습니다. 공개 샘플은 기본 해설의 구성·디자인 예시입니다.';$('#ai-consent-label').hidden=false;$('#agree-ai').required=true;}
  if(config.seller.name)$('#seller-info').textContent=`판매자: ${config.seller.name} / 사업자번호: ${config.seller.businessId}\n주소: ${config.seller.address}\n문의: ${config.seller.contact}`;
  if(config.enabled&&!config.demo&&!config.trial){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://js.tosspayments.com/v2/standard';script.onload=resolve;script.onerror=()=>reject(new Error('결제 모듈을 불러오지 못했습니다.'));document.head.append(script);});}
  payButton.disabled=!config.enabled||!!(config.email&&config.email.mode!=='off'&&!config.email.enabled);
  if(!config.trial){const price=document.querySelector('.price');price.textContent=new Intl.NumberFormat('ko-KR').format(config.product.amount)+'원';payButton.textContent='19,000원 결제하고 PDF 받기 ↗';}
  if(config.trial&&!config.adminConfigured)document.querySelector('#service-status').textContent='무료 테스트 서버가 연결되었습니다. 먼저 관리자 메뉴에서 첫 계정을 만든 뒤 테스트 주문을 이용해 주세요.';
  if(config.trial){document.querySelector('#refund-form button').textContent='테스트 주문 취소 요청';payButton.textContent='무료 테스트 PDF 만들기 · 결제 없음';document.querySelector('.price').textContent='0원 · 무료 테스트';document.querySelector('.checkout-intro').textContent='무료로 테스트 주문을 만들고 15쪽 PDF를 내려받아 보세요. 현재는 이메일을 보내지 않습니다.';document.querySelector('#report-method-note').textContent='기본 해설로 만드는 무료 테스트입니다. 정식 상품의 예정 가격은 19,000원이며, 지금은 청구되지 않습니다.';for(const [name,label] of [['agreeTerms','[필수] 무료 테스트 이용 안내를 확인했습니다.'],['agreePrivacy','[필수] 테스트 주문·PDF 제작을 위한 정보 저장에 동의합니다.'],['agreeProduction','[필수] 결제와 메일 발송 없이 테스트 PDF 제작에 동의합니다.']]){const parent=document.querySelector('[name='+name+']').parentElement;for(const n of [...parent.childNodes])if(n.nodeType===3)n.remove();parent.append(document.createTextNode(' '+label));}}
  if(config.trial&&config.email&&config.email.mode!=='off'){
   $('#service-status').textContent=config.email.enabled?(config.email.mode==='owner_test'?'본인 이메일로만 PDF를 보내는 무료 테스트입니다. Resend 가입 이메일을 입력해 주세요. 실제 카드 결제나 유료 AI는 사용하지 않습니다.':'PDF 이메일 발송이 연결되었습니다. 카드 결제 없는 무료 테스트 주문입니다.'):'이메일 연결 설정이 미완료입니다. 관리자 메뉴의 이메일 연결 상태를 확인해 주세요.';
   if(config.email.enabled){document.querySelector('.checkout-intro').textContent='15쪽 PDF를 이메일로 보내고 웹에서도 내려받을 수 있습니다.';const parent=document.querySelector('[name=agreeProduction]').parentElement;for(const n of [...parent.childNodes])if(n.nodeType===3)n.remove();parent.append(document.createTextNode(' [필수] 결제 없이 PDF 제작·이메일 발송을 시작하는 데 동의합니다.'));}
  }
  if(config.demo)payButton.textContent='모의 주문으로 PDF 만들기 · 결제 없음';
  else if(config.test&&!config.trial)payButton.textContent='19,000원 테스트 결제 · 실제 청구 없음';
 }catch{$('#service-status').textContent='무료 테스트 서버 연결 전입니다. 아직 주문을 만들 수 없으며 샘플 PDF는 내려받을 수 있습니다. 서버 연결 안내에서 Free 설정을 확인해 주세요.';}
 try{active=JSON.parse(sessionStorage.getItem('sajumoon-order')||'null');confirmation=JSON.parse(sessionStorage.getItem('sajumoon-confirmation')||'null');}catch{}
 if(params.get('result')==='success'){
  if(!active||params.get('orderId')!==active.id){$('#purchase-error').textContent='구매한 브라우저의 주문 정보가 없습니다. 결제를 다시 하지 말고 판매자에게 문의해 주세요.';return;}
  confirmation={paymentKey:params.get('paymentKey'),amount:Number(params.get('amount'))};sessionStorage.setItem('sajumoon-confirmation',JSON.stringify(confirmation));showOrder();await confirm();
 }else if(params.get('result')==='fail'){
  $('#purchase-error').textContent='결제가 취소되었거나 완료되지 않았습니다. 결제 내역을 확인한 뒤 다시 시도해 주세요.';
 }else if(active){showOrder();if(confirmation)await confirm();else await refresh();}
}
init();

function textNode(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
$('#open-report').addEventListener('click',async()=>{
 try{
  const report=await api('/api/orders/'+active.id+'/report',null,active.token);
  if(!report.ready){$('#order-error').textContent='아직 상세 리포트를 제작하고 있습니다.';return;}
  $('#web-report-kind').textContent=report.kind==='ai'?'계산값 기반 AI 해설 · 참고용 리포트':'계산값 기반 기본 해설 · 참고용 리포트';
  $('#web-chapters').replaceChildren();
  for(const c of report.chapters){const section=document.createElement('details');section.className='web-chapter';const summary=textNode('summary',`${String(c.page).padStart(2,'0')}  ${c.title}`);section.append(summary,textNode('h3',c.subtitle));for(const p of c.paragraphs)section.append(textNode('p',p));$('#web-chapters').append(section);}
  $('#web-report').showModal();
 }catch(e){$('#order-error').textContent=e.message;}
});
$('#close-web-report').addEventListener('click',()=>$('#web-report').close());
async function loadTickets(){
 if(!active)return;
 try{const data=await api('/api/orders/'+active.id+'/tickets',null,active.token);$('#customer-tickets').replaceChildren();for(const t of data.tickets){const card=document.createElement('article');card.append(textNode('p',t.message),textNode('small',t.reply?'운영자 답변: '+t.reply:'답변 대기 중'));$('#customer-tickets').append(card);}}
 catch(e){$('#support-status').textContent=e.message;}
}
$('#refresh-tickets').addEventListener('click',loadTickets);
$('#support-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/orders/'+active.id+'/tickets',{message:$('#support-message').value},active.token);$('#support-message').value='';$('#support-status').textContent='문의를 접수했습니다. 이 화면에서 답변을 확인해 주세요.';await loadTickets();}catch(error){$('#support-status').textContent=error.message;}});
$('#refund-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/orders/'+active.id+'/refund-request',{reason:$('#refund-reason').value},active.token);$('#support-status').textContent=config?.trial?'테스트 주문 취소 요청을 접수했습니다. 관리자에서 처리 상태를 확인할 수 있습니다. 실제 금액 이동은 없습니다.':'환불 검토를 요청했습니다. 자동 환불 완료를 의미하지 않으며, 운영자 검토 후 안내합니다.';await refresh();await loadTickets();}catch(error){$('#support-status').textContent=error.message;}});
