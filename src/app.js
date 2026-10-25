const {calculate,korean,element,ELEMENTS} = require('./saju.cjs');
const {reading} = require('./readings.cjs');
const form = document.querySelector('#birth-form');
const dialog = document.querySelector('#result');
const unknown = document.querySelector('#unknown-time');
const time = document.querySelector('#time');
const topic = document.querySelector('#topic');
const error = document.querySelector('#form-error');
document.querySelector('#birth').addEventListener('input', event => {
 const value=event.target.value;
 if (/^\d{8}$/.test(value)) event.target.value=`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`;
});
let current = null;
let currentTopic = '종합 사주';
unknown.addEventListener('change',()=> { time.disabled=unknown.checked; time.required=!unknown.checked; });
document.querySelectorAll('[data-topic]').forEach(card=>card.addEventListener('click',()=>{topic.value=card.dataset.topic;}));
function node(tag,text,className) {
 const el=document.createElement(tag);
 if(text!==undefined) el.textContent=text;
 if(className) el.className=className;
 return el;
}
function renderReading(selected) {
 currentTopic=selected;
 const content=reading(current,selected);
 document.querySelector('#reading-title').textContent=content.title;
 document.querySelector('#reading-body').textContent=content.body;
 document.querySelector('#reading-practice').textContent=content.practice;
 document.querySelectorAll('[data-reading]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.reading===selected)));
}
document.querySelectorAll('[data-reading]').forEach(button=>button.addEventListener('click',()=>renderReading(button.dataset.reading)));
form.addEventListener('input',()=>{error.textContent='';});
form.addEventListener('submit',event=>{
 event.preventDefault();
 error.textContent='';
 try {
 const data=new FormData(form);
 current=calculate({date:String(data.get('birth')).trim(),calendar:data.get('calendar'),time:unknown.checked?'':data.get('time')});
 const name=String(data.get('name')).trim()||'방문자';
 document.querySelector('#result-title').textContent=`${name}님의 사주 이야기`;
 document.querySelector('#result-text').textContent=`양력 ${current.solarDate} · ${current.time ? `${current.time} (한국 표준시)` : '태어난 시간 모름'}\n음력 ${current.lunarDate}${current.lunar.intercalation?' (윤달)':' (평달)'}`;
 const grid=document.querySelector('#result-pillars');
 grid.replaceChildren();
 for(const [key,label] of [['year','년주'],['month','월주'],['day','일주'],['time','시주']]) {
   const values=current.pillars[key];
   const box=node('div',undefined,'result-pillar');
   box.append(node('span',label));
   if(values.length===1) {
     const pair=values[0];
     for(const char of pair) box.append(node('b',char,`element-${ELEMENTS.indexOf(element(char))}`));
     box.append(node('small',`${korean(pair)} · ${element(pair[0])}${element(pair[1])}`));
   } else {
     box.append(node('b','—'));
     box.append(node('small',values.length ? values.map(korean).join(' / ') : '시간 미상'));
   }
   if(key==='day') box.append(node('span','나를 상징하는 기둥','pillar-caption'));
   grid.append(box);
 }
 document.querySelector('#day-master').textContent=`나의 일간은 ${current.dayMaster}(${korean(current.dayMaster)}) · ${current.dayElement}입니다.`;
 const bars=document.querySelector('#elements');
 bars.replaceChildren();
 ELEMENTS.forEach((e,index)=>{
   const row=node('div',undefined,'element-row');
   const track=node('div',undefined,'element-track');
   const bar=node('span',undefined,`element-fill fill-${index}`);
   bar.style.width=`${current.counts[e]/current.total*100}%`;
   track.append(bar);
   row.append(node('span',e),track,node('span',`${current.counts[e]}개`));
   bars.append(row);
 });
 document.querySelector('#element-note').textContent=`확정된 ${current.total}글자 기준 · 지장간과 계절 가중치를 제외한 단순 개수입니다. 오행의 강약이나 용신 판정이 아닙니다.`;
 const warnings=[];
 if(!current.time) warnings.push('시간을 몰라 시주는 계산하지 않았습니다.');
 if(current.boundary) warnings.push((current.time ? '입력한 분 안에 절기가 바뀝니다. 정확한 출생 초를 알 수 없어' : '이 날은 절기가 바뀌는 경계일이며, 시간을 몰라') + ' 년주·월주를 확정할 수 없습니다. 가능한 후보를 함께 표시하고 오행 집계에서는 제외했습니다.');
 document.querySelector('#result-warning').textContent=warnings.join(' ');
 document.querySelector('#result-warning').hidden=!warnings.length;
 renderReading(topic.value);
 document.querySelector('#copy-result').textContent='결과 복사';
 document.querySelector('#copy-status').textContent='';
 dialog.showModal();
 dialog.scrollTop=0;
 } catch(e) {
   error.textContent=e.message;
   error.focus();
 }
});
document.querySelectorAll('.close, .close-result').forEach(button=>button.addEventListener('click',()=>dialog.close()));
dialog.addEventListener('click',event=>{
 if(event.target!==dialog)return;
 const r=dialog.getBoundingClientRect();
 if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
});
document.querySelector('#copy-result').addEventListener('click',async()=>{
 if(!current)return;
 const text=[document.querySelector('#result-title').textContent,document.querySelector('#result-text').textContent,...Object.entries(current.pillars).map(([key,values])=>`${{year:'년주',month:'월주',day:'일주',time:'시주'}[key]}: ${values.length?values.map(v=>`${v}(${korean(v)})`).join(' / '):'미상'}`),document.querySelector('#result-warning').textContent,`${currentTopic}: ${document.querySelector('#reading-body').textContent}`,'한국 표준시 UTC+9 고정 · 절입 기준 · 자정 일주 변경 · 전통 상징에 따른 참고용 풀이'].filter(Boolean).join('\n');
 try { await navigator.clipboard.writeText(text); document.querySelector('#copy-status').textContent='결과를 복사했습니다.'; }
 catch { document.querySelector('#copy-status').textContent='이 브라우저에서 복사가 허용되지 않았습니다. 결과 글을 선택해 복사해 주세요.'; }
});

document.querySelector('#premium-from-result').addEventListener('click',()=>{
 if(!current)return;
 const f=new FormData(form);
 sessionStorage.setItem('sajumoon-prefill',JSON.stringify({name:f.get('name')||'',date:f.get('birth'),calendar:f.get('calendar'),time:unknown.checked?'':f.get('time')}));
});
