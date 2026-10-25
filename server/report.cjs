const PDFDocument=require('pdfkit');
const path=require('node:path');
const {calculate,korean,element,STEMS}=require('../src/saju.cjs');
const {reading}=require('../src/readings.cjs');
const PRODUCT=require('./product.cjs');
const font=path.join(__dirname,'../assets/fonts/NanumGothic-Regular.ttf');
const meanings={목:['성장과 연결','새로운 시도를 시작하거나 배우는 과정','작은 목표를 정하고 기록하기'],화:['표현과 교류','경험과 생각을 밖으로 나누는 과정','집중과 휴식의 리듬 살피기'],토:['유지와 조율','일상의 기반과 관계를 돌보는 과정','맡은 일의 범위를 분명히 하기'],금:['정리와 기준','중요한 것을 가려내고 마무리하는 과정','완료 기준과 기한을 정하기'],수:['관찰과 탐색','정보를 모으고 다양한 길을 찾는 과정','생각한 것을 한 가지 행동으로 옮기기']};
function tenGod(master,target){
 const a=STEMS.indexOf(master),b=STEMS.indexOf(target);
 const delta=(Math.floor(b/2)-Math.floor(a/2)+5)%5;
 return [['비견','겁재'],['식신','상관'],['편재','정재'],['편관','정관'],['편인','정인']][delta][a%2===b%2?0:1];
}
function sections(input){
 const r=calculate(input), name=input.name||'방문자';
 const general=reading(r,'종합 사주'),love=reading(r,'연애와 인연'),work=reading(r,'일과 재물');
 const pillars=Object.entries(r.pillars).map(([key,values])=>`${{year:'년주',month:'월주',day:'일주',time:'시주'}[key]}: ${values.length?values.map(v=>`${korean(v)}`).join(' 또는 '):'시간 미상으로 제외'}`);
 const traits=meanings[r.dayElement];
 const counts=Object.entries(r.counts).map(([e,n])=>`${e} ${n}개`).join(' · ');
 const uncertain=r.boundary?'절입 경계에 해당해 년주 또는 월주의 후보가 둘입니다. 확정되지 않은 기둥은 집계에서 제외했습니다.':!r.time?'출생 시간이 없어 시주를 제외했습니다. 추가 정보가 생기면 다시 계산해 주세요.':'입력한 한국 날짜와 시각을 기준으로 네 기둥을 계산했습니다.';
 const stemRoles=Object.entries(r.pillars).filter(([key,v])=>key!=='day'&&v.length===1).map(([key,v])=>`${{year:'년간',month:'월간',time:'시간'}[key]} ${korean(v[0][0])}: ${tenGod(r.dayMaster,v[0][0])}`);
 const rows=[
 ['당신이라는 우주를 읽는 시간',`${name}님을 위한 사주문 상세 리포트`,['태어난 순간을 단정적인 운명의 답으로 보기보다, 나를 돌아보는 또 하나의 언어로 만납니다. 이 보고서는 실제 입력값으로 계산한 사주 기둥에 전통적인 상징 설명과 실천 질문을 연결합니다.',`양력 ${r.solarDate} / ${r.time||'시간 미상'}\n음력 ${r.lunarDate}${r.lunar.intercalation?' 윤달':' 평달'}\n일간 ${korean(r.dayMaster)} · ${r.dayElement}`,`총 ${PRODUCT.pages}쪽 · 상품가 ${PRODUCT.amount.toLocaleString('ko-KR')}원\n${input.sample?'내용 확인용 샘플 · 실제 구매 보고서가 아닙니다.':'개인 열람용 보고서 · 입력 정보가 다른 경우 판매자에게 문의해 주세요.'}`]],
 ['보고서를 읽기 전에','내 경험이 언제나 먼저입니다',['앞부분에서는 입력 정보와 계산 결과를 확인하고, 중간에서는 일간·오행·관계와 일의 상징을 살펴봅니다. 뒷부분에서는 이를 일상의 관찰과 실천으로 옮길 수 있도록 질문을 정리했습니다.','문장이 자신의 경험과 맞지 않는다면 억지로 맞출 필요가 없습니다. 같은 생년월일이라도 환경·관계·선택에 따라 삶은 달라집니다. 해당하는 점과 해당하지 않는 점을 나누어 표시해 보세요.','이 보고서는 고정된 규칙으로 구성한 참고용 해설입니다. 전문가의 개별 상담이나 생성형 AI 상담, 과학적 성격 검사, 미래 사건 예측을 제공하지 않습니다. 대운·용신·신강신약에 관한 정밀 감정도 포함하지 않습니다.']],
 ['나의 사주 명식','태어난 순간을 네 기둥으로 살펴봅니다',[pillars.join('\n'),`년주는 입춘, 월주는 12절의 절입 시각으로 구분합니다. 일주는 한국 날짜의 자정에 바뀌며 시주는 해당 날짜의 일간과 두 시간 간격의 지지를 연결합니다. ${uncertain}`,'년·월·일·시는 전통적으로 서로 다른 삶의 배경을 상징합니다. 그러나 특정 기둥만으로 가족·배우자·자녀의 성격이나 사건을 판단하지 않습니다. 우선 각 글자를 확인하고, 이 보고서에서 쓰는 기준을 이해하는 데 활용해 주세요.']],
 ['일간으로 보는 나의 중심',general.title,[general.body,`일간은 일주의 첫 글자인 ${korean(r.dayMaster)}입니다. 이 보고서에서는 ${r.dayElement}의 상징을 중심으로, ${traits[1]}을 돌아봅니다. 이 한 글자가 모든 성격을 설명하는 것은 아닙니다.`,general.practice]],
 ['음양과 표현의 리듬','바깥으로 드러나는 힘과 안으로 다듬는 힘',[`일간 ${r.dayMaster}은 ${STEMS.indexOf(r.dayMaster)%2?'음':'양'}의 천간입니다. 전통적 분류에서 양은 확장과 드러냄, 음은 응축과 다듬음에 비유됩니다. 이는 남녀의 성격 구분이나 우열을 뜻하지 않습니다.`,'같은 목표를 향해도 바로 행동하며 배우는 때가 있고, 충분히 관찰한 다음 움직이는 때가 있습니다. 최근 중요한 결정을 떠올려 어느 방식이 도움이 되었는지 적어 보세요.','실천 질문: 결정을 미루는 이유가 정보 부족인지 실패에 대한 두려움인지 구분해 보세요. 빠르게 행동하는 편이라면 확인할 기준 한 가지를, 오래 고민하는 편이라면 시작할 최소 행동 한 가지를 정해 보세요.']],
 ['오행의 구성','글자의 개수와 실제 삶의 균형은 다릅니다',[`확정된 ${r.total}글자의 분포\n${counts}\n${uncertain}`,Object.entries(meanings).map(([e,[m]])=>`${e}: ${m}`).join('\n'),'이 분포는 표면의 천간·지지를 한 글자씩 센 결과입니다. 지장간과 계절의 영향, 글자 사이의 합충과 세력을 가중하지 않았습니다. 개수가 많다고 항상 강하거나 좋고, 없다고 부족한 성격이라는 의미는 아닙니다. 자신의 생활에서 어느 활동에 시간을 쓰는지와 비교하는 자료로 보세요.']],
 ['나를 둘러싼 계절','월주와 생활 환경을 함께 읽습니다',[`월주 후보: ${r.pillars.month.map(korean).join(' / ')}. ${r.pillars.month.length===1?`월지 ${korean(r.pillars.month[0][1])}의 표면 오행은 ${element(r.pillars.month[0][1])}입니다.`:'태어난 시각에 따라 월주가 달라져 하나로 확정하지 않습니다.'}`,'명리에서는 계절을 중요한 배경으로 다룹니다. 다만 이 보고서는 월지 하나로 계절 전체의 강약이나 용신을 정하지 않습니다. 계절 정보는 오행의 단순 개수와 별개라는 점을 이해하는 출발점으로 제시합니다.','내가 편안하게 집중하는 환경을 떠올려 보세요. 일정이 분명한 환경, 자유롭게 탐색하는 환경, 조용히 혼자 일하는 환경 중 무엇이 실제로 도움이 되었나요? 태어난 계절보다 현재 몸과 마음의 반응을 함께 관찰해 보세요.']],
 ['일간과 다른 천간의 관계','십성의 이름을 역할의 언어로 읽습니다',[stemRoles.length?stemRoles.join('\n'):'확정된 비교 천간이 없어 십성을 표시하지 않습니다.','십성은 일간과 다른 천간의 오행 관계 및 음양에 붙인 전통적 명칭입니다. 비견·겁재는 동료와 주체성, 식신·상관은 표현과 생산, 편재·정재는 자원 운용, 편관·정관은 기준과 책임, 편인·정인은 학습과 지원의 관점으로 읽을 수 있습니다.','명칭에 재물이나 관직을 뜻하는 글자가 있어도 실제 자산이나 직위를 예측하지 않습니다. 여기서는 확정된 표면 천간만 비교하며 지장간의 십성과 격국을 판정하지 않습니다. 지금 자주 맡는 역할과 기대받는 역할이 같은지 돌아보세요.']],
 ['연애와 인연','관계 속에서 나를 지키는 방법',[love.body,'한 사람의 사주만으로 상대의 마음, 만남의 날짜, 결혼 여부를 알 수는 없습니다. 관계의 질은 서로의 의사와 행동을 통해 확인해야 합니다. 일간의 상징은 대화 습관을 점검하는 질문으로 활용해 주세요.',love.practice+' 갈등이 생겼을 때 관찰한 사실, 내가 느낀 감정, 원하는 행동을 구분해서 한 문장씩 적어보세요. 상대를 규정하기보다 함께 바꿀 수 있는 행동을 찾는 것이 도움이 됩니다.']],
 ['일과 성장','맞는 직업을 단정하기보다 경험으로 확인합니다',[work.body,`일간의 상징인 ${traits[0]}을 나의 일하는 방식과 비교해 보세요. ${traits[2]}를 이번 주 업무 하나에 적용해 보고, 결과를 관찰하는 작은 실험을 제안합니다.`,'실천 질문: 가장 몰입했던 일에서 사용한 기술은 무엇이었나요? 잘한다는 평가를 받은 일과 에너지가 소모되는 일을 나누어 기록해 보세요. 직무 전환이나 퇴사는 실제 업무 조건, 경제적 여유, 건강과 지원 자원을 함께 검토해야 합니다.']],
 ['재물과 자원 관리','운의 좋고 나쁨 대신 내 선택을 살펴봅니다',['이 보고서는 부자가 되는 시기, 투자 수익, 횡재나 손실을 예측하지 않습니다. 명리에서 말하는 재성의 상징은 자원을 다루는 방식에 관한 질문으로만 활용합니다.',`${work.practice} 고정비·변동비·예비비를 나누고, 현재 감당할 수 있는 범위를 숫자로 적어보세요. 사주 글자의 개수는 신용도나 자산의 규모를 알려주지 않습니다.`,'이번 달의 작은 실천: 반복되는 지출 한 가지를 살펴보고 그 지출이 어떤 필요를 채우는지 적어보세요. 줄일 항목뿐 아니라 배움·휴식·안전에 필요한 비용도 함께 정리해 보세요. 금융상품 선택은 검증 가능한 정보와 필요한 경우 자격 있는 전문가의 도움을 바탕으로 하세요.']],
 ['함께 일하고 살아가는 방식','역할과 경계를 말로 확인합니다',[`일간 ${korean(r.dayMaster)}의 상징을 바탕으로 보면, ${traits[1]}을 협업 장면에서 돌아볼 수 있습니다. 실제 행동이 이 설명과 다른 경우에는 실제 경험을 우선합니다.`,'좋은 협업에는 누가 무엇을 언제까지 맡는지에 대한 합의가 필요합니다. 역할이 모호해서 생긴 어려움과 사람에 대한 인상을 분리해서 적어보세요. 자신의 방식이 상대에게도 당연할 것이라고 가정하지 않는 연습이 도움이 됩니다.','실천 질문: 최근 도움을 요청하거나 거절하기 어려웠던 상황은 무엇이었나요? 가능한 일, 협의가 필요한 일, 지금은 어려운 일을 나누어 말해보세요. 이를 오행의 우열이나 상대와의 정해진 궁합으로 설명할 필요는 없습니다.']],
 ['나를 위한 일상의 리듬','작은 관찰이 나만의 기준이 됩니다',[`${traits[2]}라는 제안을 생활 속에서 가볍게 실험해 보세요. 일간이나 오행 때문에 특정 활동을 반드시 해야 한다는 의미는 아닙니다.`,'일주일 동안 수면·식사·집중·휴식 시간을 간단히 적어보세요. 잘된 날과 어려웠던 날의 조건을 비교하면 추상적인 성향 설명보다 구체적인 도움이 될 수 있습니다. 신체 증상이나 정신건강 문제를 사주로 진단하지 말고 의료 전문가에게 상담하세요.','실천 질문: 회복에 도움이 된 행동 하나, 지나치게 에너지를 쓴 상황 하나, 다음 주에 줄이고 싶은 부담 하나를 적어보세요. 너무 많은 변화를 한 번에 시도하기보다 하나를 골라 관찰 기간을 정하는 방식이 좋습니다.']],
 ['30일의 작은 실천 계획','해석을 나의 언어로 바꾸는 시간',['1주차 — 관찰하기. 이 보고서에서 자신에게 맞는 문장 두 개와 맞지 않는 문장 하나를 골라 실제 경험을 덧붙여 보세요. 시간이나 날짜를 잘못 입력하지 않았는지도 확인합니다.','2주차 — 대화하기. 가까운 사람에게 최근 고마웠던 행동 하나와 함께 조정하고 싶은 행동 하나를 구체적으로 말해보세요. 3주차 — 실험하기. 일이나 생활에서 바꾸고 싶은 습관 하나를 작게 정하고, 실천한 날을 기록하세요.','4주차 — 돌아보기. 실험 전후의 변화와 어려움을 비교해 보세요. 잘 맞지 않는 해석은 내려놓고, 자신이 직접 발견한 기준을 한 문장으로 적어보세요. 다음 달의 목표는 사주가 정해주는 답보다 실제 관찰을 바탕으로 정합니다.']],
 ['계산 기준과 마지막 안내','당신의 삶은 한 장의 명식보다 넓습니다',[`입력 기준: 한국 표준시 UTC+9 고정, 일주 변경은 00:00. 과거 한국의 표준시 변경·서머타임·해외 출생지 경도·진태양시는 보정하지 않습니다. ${uncertain}`,'한국 음력 평달·윤달 변환에는 korean-lunar-calendar 0.4.0을, 절입 시각과 일주 계산에는 lunar-javascript 1.7.7을 사용합니다. 출생 시각이 분 단위여서 그 분 안에 절입이 있으면 후보를 함께 제시합니다. 다른 만세력은 기준과 보정 방식에 따라 결과가 다를 수 있습니다.',`보고서 버전 ${PRODUCT.version}. 표면 글자 오행과 천간 십성, 일간의 상징을 활용한 정형 해설이며 전문가 감정·대운·용신·합충 해석이나 사건 예측은 포함하지 않습니다. 이 보고서는 선택을 대신하지 않습니다. 당신의 실제 경험과 판단을 존중합니다.`]]
 ];
 return {result:r,rows};
}
async function createPdf(input){
 const {rows}=sections(input);
 if(rows.length!==PRODUCT.pages)throw new Error('Report page configuration mismatch');
 return new Promise((resolve,reject)=>{
 const doc=new PDFDocument({autoFirstPage:false,size:'A4',margin:52,bufferPages:true,info:{Title:'사주문 상세 풀이 리포트',Author:'사주문'}});
 const chunks=[];doc.on('data',c=>chunks.push(c));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));
 doc.registerFont('Korean',font);doc.font('Korean');
 rows.forEach(([title,subtitle,paragraphs],i)=>{
  doc.addPage();doc.rect(0,0,doc.page.width,doc.page.height).fill('#f5f2e9');
  doc.fillColor('#ad503b').fontSize(10).text(`사주문  /  ${String(i+1).padStart(2,'0')}`,52,45);
  doc.fillColor('#272e28').fontSize(i===0?28:23).text(title,52,98,{width:490});
  doc.fontSize(13).fillColor('#6b745f').text(subtitle,52,158,{width:490,lineGap:6});
  let y=218;
  paragraphs.forEach((paragraph,j)=>{
    paragraph=korean(paragraph);
    doc.fontSize(12).fillColor('#394333');
    const height=doc.heightOfString(paragraph,{width:490,lineGap:7});
    if(y+height>735)throw new Error(`Report text exceeds page ${i+1}`);
    doc.text(paragraph,52,y,{width:490,lineGap:7});y+=height+26;
  });
  doc.moveTo(52,755).lineTo(543,755).strokeColor('#cdd2c2').stroke();
  doc.fillColor('#6b745f').fontSize(9).text('전통 상징을 통한 자기 이해 · 참고용 해설',52,770,{width:400,lineBreak:false});
  doc.text(`${i+1} / ${PRODUCT.pages}`,495,770,{lineBreak:false});
 });
 if(doc.bufferedPageRange().count!==15)throw new Error('Report must have 15 pages');
 doc.end();
 });
}
module.exports={createPdf,sections,tenGod};
