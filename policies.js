fetch('/api/config').then(r=>r.ok?r.json():Promise.reject()).then(data=>{
 if(data.trial){const notice=document.createElement('p');notice.className='service-status';notice.textContent=data.email?.enabled?'현재는 0원 테스트이며 카드 결제·유료 AI는 사용하지 않습니다. PDF 이메일 발송이 설정되어 있으며 본인 수신 테스트 또는 검증된 발신 도메인의 발송 방식이 적용됩니다.':'현재는 청구 금액 0원의 무료 테스트입니다. 실제 카드 결제·이메일 발송·유료 AI 호출은 하지 않습니다. 아래 19,000원 상품은 향후 정식 판매 시의 안내입니다.';document.querySelector('main').insertBefore(notice,document.querySelector('#policy-seller'));}
 const s=data.seller;if(s?.name)document.querySelector('#policy-seller').textContent=`판매자 ${s.name} · 사업자번호 ${s.businessId} · 주소 ${s.address} · 문의 ${s.contact}`;
 if(data.reportEngine==='ai')document.querySelector('#policy-engine').textContent='명식·오행 계산 기반 AI 해설';
}).catch(()=>{});
