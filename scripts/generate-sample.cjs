const fs=require('node:fs');
const path=require('node:path');
const {createPdf}=require('../server/report.cjs');
createPdf({name:'샘플 고객',date:'1995-06-15',calendar:'solar',time:'09:30',sample:true}).then(buffer=>{
 fs.writeFileSync(path.join(__dirname,'../sample-report.pdf'),buffer);
 console.log('Created 15-page sample report.');
}).catch(error=>{console.error(error.message);process.exitCode=1;});
