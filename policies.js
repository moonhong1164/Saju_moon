fetch('/api/config').then(r=>r.ok?r.json():Promise.reject()).then(data=>{
 const s=data.seller;if(s?.name)document.querySelector('#policy-seller').textContent=`판매자 ${s.name} · 사업자번호 ${s.businessId} · 주소 ${s.address} · 문의 ${s.contact}`;
 if(data.reportEngine==='ai')document.querySelector('#policy-engine').textContent='명식·오행 계산 기반 AI 해설';
}).catch(()=>{});
