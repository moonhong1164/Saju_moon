function reportFilename(name){
 const nickname=String(name||'').normalize('NFC')
  .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>:"/\\|?*]/g,'_')
  .trim().replace(/^[. ]+|[. ]+$/g,'').slice(0,80);
 const base=nickname&&!/^_+$/.test(nickname)?nickname:'sajumoon-report';
 return (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(base)?'_'+base:base)+'.pdf';
}
function disposition(name){
 const encoded=encodeURIComponent(reportFilename(name)).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
 return `attachment; filename="sajumoon-report.pdf"; filename*=UTF-8''${encoded}`;
}
module.exports={reportFilename,disposition};
