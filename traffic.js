(()=>{
 const valid=v=>typeof v==='string'&&/^[a-z0-9_-]{1,40}$/.test(v)?v:null;
 const params=new URLSearchParams(location.search);
 let attribution={source:'direct',campaign:'direct'};
 try{
  const saved=JSON.parse(sessionStorage.getItem('sajumoon-attribution')||'null');
  attribution={source:valid(params.get('utm_source'))||valid(saved?.source)||'direct',campaign:valid(params.get('utm_campaign'))||valid(saved?.campaign)||'direct'};
  sessionStorage.setItem('sajumoon-attribution',JSON.stringify(attribution));
 }catch{}
 const page=location.pathname.endsWith('checkout.html')?'checkout':'landing';
 // Aggregate counts only: no name, birth, email, cookie, or visitor identifier.
 fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({page,...attribution}),keepalive:true}).catch(()=>{});
if(page==='landing')fetch('/api/config').then(r=>r.ok?r.json():null).then(c=>{if(!c?.trial)return;const price=document.querySelector('.premium-price');if(price)price.textContent='무료 테스트';const note=document.querySelector('.premium-meta');if(note)note.textContent='실제 결제·이메일·유료 AI 없이 PDF 다운로드로 확인하세요. 정식 상품 예정가는 19,000원입니다.';const link=document.querySelector('.premium-side .button');if(link)link.textContent='무료 테스트 PDF 만들기 ↗';}).catch(()=>{});
})();
