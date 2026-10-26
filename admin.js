const $=s=>document.querySelector(s);
let csrf='',username='',data=null,selected=null;
const won=n=>new Intl.NumberFormat('ko-KR').format(n)+'원';
const date=n=>n?new Date(n).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'—';
const labels={pending_payment:'결제 대기',paid:'제작 대기',processing:'제작·발송 중',sent:'메일 접수',delivery_failed:'제작·발송 실패',refunded:'환불 완료',requested:'환불 요청',processing_refund:'환불 처리 중',declined:'환불 검토 답변'};
function el(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
async function api(path,body){const r=await fetch('/api/admin/'+path,{method:body?'POST':'GET',credentials:'same-origin',headers:{...(body?{'Content-Type':'application/json','X-Admin-Request':'1',...(csrf?{'X-CSRF-Token':csrf}:{})}:{})},body:body?JSON.stringify(body):undefined});if(!r.headers.get('content-type')?.includes('application/json'))throw new Error('관리자 서버가 연결되지 않았습니다. 정적 사이트에서는 운영실 데이터를 불러올 수 없습니다.');const value=await r.json();if(!r.ok){if(r.status===401&&!['auth/login','auth/password'].includes(path))lock();throw new Error(value.error||'처리하지 못했습니다.');}return value;}
function cell(row,value){const td=el('td',value);row.append(td);return td;}
function button(label,handler){const b=el('button',label,'table-button');b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{await handler();}catch(e){$('#detail-error').textContent=e.message;}finally{b.disabled=false;}});return b;}
function renderOrders(){
 const query=$('#order-search').value.toLowerCase();const list=$('#order-list');list.replaceChildren();
 const orders=data.orders.filter(o=>[o.id,o.name,o.email].some(v=>v?.toLowerCase().includes(query)));
 if(!orders.length){const row=el('tr');const td=cell(row,'아직 해당 주문이 없습니다.');td.colSpan=5;list.append(row);return;}
 for(const o of orders){const row=el('tr'),who=cell(row,o.name||'방문자');who.append(el('small',o.email),el('small',o.id));cell(row,o.refundState==='processing'?'환불 처리 중':labels[o.refundState]||labels[o.status]||o.status);cell(row,`${o.source} / ${o.campaign}`);cell(row,o.status==='refunded'?'환불로 열람 종료':(o.reportKind==='ai'?'AI 해설':'기본 해설')+(o.hasPdf?' · PDF 준비':' · 대기'));cell(row,'').append(button('상세 보기',()=>openOrder(o.id)));list.append(row);}
}
function render(){
 $('#metric-cards').replaceChildren();
 const t=data.totals;
 for(const [label,value] of [['순매출',won(t.net)],['결제 / 환불',`${t.paid} / ${t.refunded}건`],['랜딩 조회',`${t.landingViews}회`],['미답변 문의',`${t.openTickets}건`]]){const box=el('div',undefined,'metric');box.append(el('small',label),el('strong',value));$('#metric-cards').append(box);}
 $('#environment-note').textContent=`${data.demo?'로컬 모의 데이터 · 실제 결제/메일 아님':data.mode==='test'?'결제사 테스트 데이터':'실제 운영 데이터'} / ${data.encrypted?'개인정보 암호화 저장':'로컬 개발용 저장'} / ${data.reportEngine==='ai'?'AI 해설 연동':'기본 해설 모드'}`;
 renderOrders();
 const customers=new Map();for(const o of data.orders){if(!customers.has(o.email))customers.set(o.email,{name:o.name,count:0,paid:0,purchases:0,recent:o.created});const c=customers.get(o.email);c.count++;if(o.status!=='pending_payment')c.paid++;if(!['pending_payment','refunded'].includes(o.status)&&!['requested','processing','refunded'].includes(o.refundState))c.purchases++;}
 $('#customer-list').replaceChildren();for(const [email,c] of customers){const row=el('tr'),who=cell(row,c.name||'방문자');who.append(el('small',email));cell(row,`${c.count}건${c.purchases>1?' · 재구매':''}`);cell(row,`${c.paid}건`);cell(row,date(c.recent));$('#customer-list').append(row);}
 const groups=new Map();function group(s,c){const key=s+'/'+c;if(!groups.has(key))groups.set(key,{s,c,landing:0,checkout:0,orders:0,paid:0,net:0});return groups.get(key);}
 for(const v of data.traffic)group(v.source,v.campaign)[v.page]+=v.views;
 for(const o of data.ledger){const g=group(o.source,o.campaign);g.orders++;if(o.paid_at){g.paid++;if(!o.refunded_at)g.net+=o.amount;}}
 $('#source-list').replaceChildren();for(const g of groups.values()){const row=el('tr');cell(row,`${g.s} / ${g.c}`);cell(row,g.landing);cell(row,g.checkout);cell(row,`${g.paid} / ${g.orders}건 (${g.orders?Math.round(g.paid/g.orders*100):0}%)`);cell(row,won(g.net));$('#source-list').append(row);}
 if(data.costs)for(const [key,value] of Object.entries(data.costs))$('#cost-form').elements[key].value=value;
 $('#profit-result').textContent=data.estimatedProfit===null?'비용을 입력하면 예상 수익이 표시됩니다.':'예상 수익 '+won(data.estimatedProfit);
}
async function load(){
 try{data=await api('summary');$('#admin-error').textContent='';$('#login-panel').hidden=true;$('#dashboard').hidden=false;$('#logout').hidden=false;$('#signed-in-user').textContent=username+' 계정으로 로그인했습니다.';render();}
 catch(e){$('#admin-error').textContent=e.message;$('#login-panel').hidden=false;$('#dashboard').hidden=true;}
}
async function openOrder(id){
 const o=await api('orders/'+id);selected=id;
 $('#detail-title').textContent=(o.input.name||'방문자')+'님의 주문';
 $('#detail-info').textContent=`${o.id}\n${o.email}\n생일 ${o.input.date} · ${o.input.calendar} · ${o.input.time||'시간 모름'}\n상태 ${labels[o.status]||o.status} / ${date(o.created)}`;
 $('#detail-error').textContent=({report_generation:'해설 생성 단계 확인 필요',pdf_generation:'PDF 제작 단계 확인 필요',email_submission:'메일 접수 단계 확인 필요',payment_confirmation:'결제 승인 확인 필요',refund_confirmation:'환불 완료 재확인 필요'}[o.errorCode]||'');$('#action-reason').value='';$('#detail-actions').replaceChildren();
 if(o.hasPdf)$('#detail-actions').append(button('PDF 내려받기',async()=>{const r=await fetch('/api/admin/orders/'+id+'/pdf',{credentials:'same-origin'});if(!r.ok)throw new Error('PDF가 없습니다.');const url=URL.createObjectURL(await r.blob()),a=el('a');a.href=url;a.download='sajumoon-report.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}));
 if(['sent','delivery_failed'].includes(o.status)&&!['requested','processing','refunded'].includes(o.refundState))$('#detail-actions').append(button('이메일 재발송',async()=>{if(!confirm('PDF 이메일을 새 발송으로 다시 요청할까요?'))return;await api('orders/'+id+'/resend',{});await openOrder(id);await load();}));
 if(o.paidAt&&o.status!=='refunded')$('#detail-actions').append(button(data.demo?'19,000원 모의 환불':'19,000원 전액 환불',async()=>{const reason=$('#action-reason').value.trim();if(reason.length<5)throw new Error('환불 사유를 5자 이상 입력해 주세요.');if(!confirm(data.demo?'실제 돈을 이동하지 않는 모의 환불을 처리할까요?':'이 주문의 실제 결제 19,000원을 전액 환불할까요? 이 작업은 되돌릴 수 없습니다.'))return;await api('orders/'+id+'/refund',{reason});await openOrder(id);await load();}));
 if(o.refundState==='requested')$('#detail-actions').append(button('환불 검토 답변·제작 재개',async()=>{const message=$('#action-reason').value.trim();if(message.length<5)throw new Error('고객에게 전달할 검토 답변을 입력해 주세요.');await api('orders/'+id+'/decline-refund',{message});await openOrder(id);await load();}));
 $('#ticket-list').replaceChildren();
 if(!o.tickets.length)$('#ticket-list').append(el('p','아직 문의가 없습니다.','muted'));
 for(const t of o.tickets){const box=el('div',undefined,'ticket');box.append(el('small',`${date(t.created)} · ${t.kind==='refund'?'환불 요청':'고객 문의'}`),el('p',t.message));if(t.reply)box.append(el('p','운영자 답변: '+t.reply));else{const input=el('textarea');input.rows=3;input.maxLength=1500;input.setAttribute('aria-label','고객 문의 답변');box.append(input,button('답변 저장',async()=>{await api('orders/'+id+'/reply',{ticketId:t.id,message:input.value});await openOrder(id);await load();}));}$('#ticket-list').append(box);}
 $('#audit-list').replaceChildren();for(const a of o.audit)$('#audit-list').append(el('p',`${date(a.created)} · ${{payment_confirmed:'결제 승인 확인',mail_accepted:'메일 발송 접수',resend_requested:'재발송 요청',refund_requested:'고객 환불 요청',refund_started:'환불 처리 시작',refund_confirmed:'전액 환불 확인',refund_declined:'환불 검토 답변'}[a.action]||a.action}`));
 if(!$('#order-detail').open)$('#order-detail').showModal();
}
function lock(){csrf='';username='';data=null;selected=null;if($('#order-detail').open)$('#order-detail').close();$('#dashboard').hidden=true;$('#login-panel').hidden=false;$('#logout').hidden=true;for(const id of ['#metric-cards','#order-list','#customer-list','#source-list','#ticket-list','#audit-list'])$(id).replaceChildren();$('#detail-info').textContent='';$('#detail-title').textContent='주문 상세';$('#action-reason').value='';$('#password-form').reset();$('#cost-form').reset();$('#profit-result').textContent='';$('#admin-password').value='';}
async function signedIn(session){csrf=session.csrf;username=session.username;$('#admin-login').reset();$('#admin-setup').reset();$('#account-setup').hidden=true;$('#admin-login').hidden=false;await load();}
$('#admin-login').addEventListener('submit',async e=>{e.preventDefault();$('#login-button').disabled=true;$('#admin-error').textContent='';try{await signedIn(await api('auth/login',{username:$('#admin-username').value.trim(),password:$('#admin-password').value}));}catch(error){$('#admin-error').textContent=error.message;$('#admin-password').value='';}finally{$('#login-button').disabled=false;}});
$('#admin-setup').addEventListener('submit',async e=>{e.preventDefault();$('#admin-error').textContent='';if($('#setup-password').value!==$('#setup-password-confirm').value){$('#admin-error').textContent='비밀번호 확인이 일치하지 않습니다.';return;}$('#setup-button').disabled=true;try{await signedIn(await api('auth/setup',{username:$('#setup-username').value.trim(),password:$('#setup-password').value,setupToken:$('#setup-token').value}));}catch(error){$('#admin-error').textContent=error.message;}finally{$('#setup-button').disabled=false;}});
$('#logout').addEventListener('click',async()=>{try{await api('auth/logout',{});lock();$('#login-note').textContent='로그아웃했습니다. 다시 로그인해 주세요.';}catch(error){$('#admin-error').textContent=error.message;}});
$('#password-form').addEventListener('submit',async e=>{e.preventDefault();const status=$('#password-status');if($('#new-password').value!==$('#new-password-confirm').value){status.textContent='새 비밀번호 확인이 일치하지 않습니다.';return;}try{const session=await api('auth/password',{currentPassword:$('#current-password').value,newPassword:$('#new-password').value});csrf=session.csrf;username=session.username;e.target.reset();status.textContent='비밀번호를 변경했습니다. 다른 로그인은 종료되었습니다.';}catch(error){status.textContent=error.message;}});
function showConnectionHelp(message){
 lock();$('#admin-login').hidden=false;$('#account-setup').hidden=true;$('#connection-help').hidden=false;
 $('#admin-username').disabled=true;$('#admin-password').disabled=true;$('#login-button').disabled=true;
 $('#login-note').textContent=message;
}
async function initialize(){
 try{
  const session=await api('auth/session');$('#admin-login').hidden=false;$('#account-setup').hidden=true;$('#connection-help').hidden=true;
  if(session.configurationIssue){showConnectionHelp(session.configurationIssue);return;}
  if(session.serviceOrigin&&new URL(session.serviceOrigin).origin!==location.origin){showConnectionHelp('서버의 PUBLIC_BASE_URL을 현재 접속한 서버 주소로 맞춰 주세요.');return;}
  $('#admin-username').disabled=false;$('#admin-password').disabled=false;$('#login-button').disabled=false;
  $('#login-note').textContent='아이디와 비밀번호로 로그인해 주세요.';
  if(session.authenticated){await signedIn(session);return;}
  lock();
  if(session.setupRequired){$('#account-setup').hidden=false;$('#admin-login').hidden=true;$('#login-note').textContent='아직 관리자 계정이 없습니다. 먼저 계정을 만들어 주세요.';$('#setup-token-field').hidden=!!session.localSetup;$('#setup-token').required=!session.localSetup;}
 }catch{showConnectionHelp('로그인 화면 미리보기입니다. 서버 미연결로 실제 로그인은 아직 사용할 수 없습니다. 아래에서 관리자 화면 구성을 확인해 주세요.');}
}
$('#refresh-admin').addEventListener('click',initialize);$('#order-search').addEventListener('input',()=>{if(data)renderOrders();});
$('#close-detail').addEventListener('click',()=>$('#order-detail').close());
$('#cost-form').addEventListener('submit',async e=>{e.preventDefault();try{const f=new FormData(e.currentTarget);await api('costs',Object.fromEntries([...f].map(([k,v])=>[k,Number(v)])));await load();}catch(error){$('#admin-error').textContent=error.message;}});
$('#destination').value=location.origin+'/index.html';
$('#campaign-form').addEventListener('submit',e=>{e.preventDefault();try{const url=new URL($('#destination').value);if(!['https:','http:'].includes(url.protocol))return;url.searchParams.set('utm_source',$('#campaign-source').value);url.searchParams.set('utm_campaign',$('#campaign-name').value);$('#campaign-result').value=url.toString();}catch{$('#campaign-result').value='주소를 확인해 주세요.';}});
initialize();
