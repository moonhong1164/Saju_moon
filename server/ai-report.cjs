const {sections}=require('./report.cjs');
const PAGES=[4,5,7,9,10,11,12,13,14];
function schema(){return {type:'object',additionalProperties:false,properties:{chapters:{type:'array',minItems:9,maxItems:9,items:{type:'object',additionalProperties:false,properties:{page:{type:'integer',enum:PAGES},paragraphs:{type:'array',minItems:3,maxItems:3,items:{type:'string'}}},required:['page','paragraphs']}}},required:['chapters']};}
async function generateAiReport(input,{key,model,fetcher=fetch}={}){
 if(!key||!model)throw new Error('AI report configuration is missing.');
 const base=sections(input),r=base.result;
 const chart={pillars:r.pillars,counts:r.counts,total:r.total,dayMaster:r.dayMaster,dayElement:r.dayElement,boundary:r.boundary,timeKnown:!!r.time};
 const prompt={chart,chapters:PAGES.map(page=>({page,title:base.rows[page-1][0]}))};
 const response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},signal:AbortSignal.timeout(75000),body:JSON.stringify({model,store:false,max_output_tokens:8000,instructions:'검증된 사주 계산값을 바탕으로 자기 이해를 돕는 한국어 참고용 리포트를 작성한다. 계산값을 다시 계산하거나 다른 년주/월주/일주/시주를 주장하지 않는다. 경계와 시간 미상의 불확정을 보존한다. 각 지정 페이지에 서로 다른 3개 문단을 쓰되, 문단마다 40~170자, 줄바꿈 없이 한글·영문·숫자·일반 문장부호만 사용한다. 한자와 이모지는 쓰지 않는다. 성별/가족/과거 사건을 추정하거나 전문가 감정, 대운, 용신 분석을 수행한 것처럼 쓰지 않는다. 죽음·질병·임신·이혼·재난·투자수익·결혼시기 등 미래 사건을 예측하거나 불안을 조장하지 않는다. 단정 대신 성찰 질문과 현실적인 실천을 제공한다. 기둥 개수가 성격 결핍이나 우열이라는 판단을 하지 않는다. 요청된 9개 페이지를 중복 없이 모두 반환한다.',input:JSON.stringify(prompt),text:{format:{type:'json_schema',name:'saju_interpretation',strict:true,schema:schema()}}})});
 if(!response.ok)throw new Error('AI report request failed.');
 const data=await response.json();if(data.status!=='completed')throw new Error('AI report was not completed.');
 const content=(data.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
 let parsed;try{parsed=JSON.parse(content);}catch{throw new Error('AI report is not valid JSON.');}
 if(!Array.isArray(parsed.chapters)||parsed.chapters.length!==PAGES.length)throw new Error('AI chapter count is invalid.');
 const seen=new Set();
 for(const chapter of parsed.chapters){
  if(!PAGES.includes(chapter.page)||seen.has(chapter.page)||!Array.isArray(chapter.paragraphs)||chapter.paragraphs.length!==3)throw new Error('AI chapters are invalid.');
  for(const p of chapter.paragraphs){if(typeof p!=='string'||[...p].length<30||[...p].length>180||/[\n\r\t]/.test(p)||!/^[\p{Script=Hangul}\p{Script=Latin}\p{N}\p{P} ]+$/u.test(p))throw new Error('AI text does not meet report limits.');}
  seen.add(chapter.page);base.rows[chapter.page-1][2]=chapter.paragraphs;
 }
 base.rows[1][2][2]='이 보고서는 검증된 명식·오행 계산값에 AI가 작성한 참고용 해설을 연결합니다. 개인 상담이나 과학적 성격 검사, 미래 사건 예측을 제공하지 않습니다. 계산 기준과 시간 미상에 따른 불확정 부분을 확인하고 자신의 실제 경험을 우선해 주세요.';
 base.kind='ai';return base;
}
module.exports={generateAiReport,PAGES};
