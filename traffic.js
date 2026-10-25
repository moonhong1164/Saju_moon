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
})();
