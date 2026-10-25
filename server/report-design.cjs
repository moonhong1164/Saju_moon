const path=require('node:path');
const {korean,ELEMENTS}=require('../src/saju.cjs');
const PRODUCT=require('./product.cjs');
const THEME=Object.freeze({brand:'월홍',ink:'#44374f',muted:'#81738d',pink:'#f3d8e3',lavender:'#e6ddf5',paper:'#fcf9fc',plum:'#292137',gold:'#c9ae89',pearl:['#f5d9eb','#ded4f6','#c8e6e0','#faf1d9','#dac6ed']});
function fonts(doc){
 const root=path.join(__dirname,'../assets/fonts');
 doc.registerFont('Body',path.join(root,'NanumGothic-Regular.ttf'));
 doc.registerFont('Serif',path.join(root,'NanumMyeongjo-Regular.ttf'));
 doc.registerFont('Title',path.join(root,'NanumMyeongjo-Bold.ttf'));
}
function text(doc,value,x,y,size=11,color=THEME.ink,options={}){
 doc.font(options.font||'Body').fontSize(size).fillColor(color);
 doc.text(korean(value),x,y,{width:options.width||491,lineGap:options.lineGap??5,...options});
}
// Original vector ornament inspired by najeon shell inlay. Fine pastel shards
// and translucent-looking veins create a pearlescent texture at any resolution.
function petal(doc,x,y,size,rotation=0){
 doc.save().translate(x,y).rotate(rotation);
 doc.moveTo(0,0).bezierCurveTo(-size*.65,-size*.4,-size*.5,-size*1.3,0,-size*1.65).bezierCurveTo(size*.5,-size*1.3,size*.65,-size*.4,0,0).fill(THEME.pearl[rotation%5]);
 for(let j=0;j<4;j++){
  const py=-size*(.22+j*.27);
  doc.moveTo(0,py).lineTo(-size*(.22+j*.02),py-size*.22).lineTo(size*.23,py-size*.35).lineTo(size*.13,py-size*.1).closePath().fill(THEME.pearl[(j+rotation)%5]);
 }
 doc.moveTo(0,0).bezierCurveTo(size*.08,-size*.5,-size*.06,-size,0,-size*1.5).lineWidth(.45).strokeColor('#ffffff').stroke();
 doc.restore();
}
function flower(doc,x,y,size=20){for(let i=0;i<5;i++)petal(doc,x,y,size,i*72);doc.circle(x,y,size*.18).fill(THEME.gold);}
function star(doc,x,y,r=4,color=THEME.gold){doc.save().translate(x,y).moveTo(0,-r).lineTo(r*.24,-r*.24).lineTo(r,0).lineTo(r*.24,r*.24).lineTo(0,r).lineTo(-r*.24,r*.24).lineTo(-r,0).lineTo(-r*.24,-r*.24).closePath().fill(color).restore();}
function moon(doc,x,y,r,color,background){doc.circle(x,y,r).fill(color);doc.circle(x+r*.43,y-r*.18,r*.84).fill(background);}
function medallion(doc,x,y,r){
 doc.save();
 doc.circle(x,y,r).lineWidth(.6).strokeColor(THEME.gold).stroke();
 doc.circle(x,y,r-9).lineWidth(.4).strokeColor('#74607d').stroke();
 doc.circle(x,y,r-19).dash(1.3,{space:6}).strokeColor('#73637f').stroke().undash();
 const grad=doc.linearGradient(x-r*.5,y-r*.5,x+r*.5,y+r*.5);grad.stop(0,'#fff2dc').stop(.33,'#e9d5f6').stop(.65,'#bddbd7').stop(1,'#f1cfdf');
 moon(doc,x+7,y-28,r*.52,grad,THEME.plum);
 doc.moveTo(x-r*.6,y+r*.48).bezierCurveTo(x-r*.4,y+r*.24,x+r*.1,y+r*.6,x+r*.63,y+r*.04).lineWidth(.85).strokeColor(THEME.gold).stroke();
 flower(doc,x-r*.48,y+r*.30,r*.24);flower(doc,x+r*.38,y+r*.46,r*.14);flower(doc,x+r*.66,y+r*.1,r*.10);
 star(doc,x-r*.48,y-r*.42,5,'#f5d9eb');star(doc,x+r*.58,y-r*.44,4,'#dcd0f4');star(doc,x-r*.1,y+r*.69,3);
 doc.restore();
}
function frame(doc,page){
 doc.rect(0,0,595.28,841.89).fill(THEME.paper);
 const gradient=doc.linearGradient(390,0,595,260);gradient.stop(0,'#f9e9ef').stop(1,'#eee7f8');
 doc.save().rect(0,0,595,842).clip();doc.circle(572,30,135).fill(gradient);doc.circle(612,90,155).lineWidth(.5).strokeColor('#e1d6eb').stroke();doc.restore();
 text(doc,THEME.brand,50,38,18,THEME.ink,{font:'Title',width:100});
 text(doc,'PERSONAL SAJU  /  MOONLIGHT EDITION',280,44,7,THEME.muted,{width:265,align:'right',characterSpacing:1});
 doc.moveTo(50,72).lineTo(545,72).lineWidth(.5).strokeColor('#e6dce9').stroke();
 flower(doc,531,122,11);star(doc,505,107,3);
 doc.moveTo(50,764).lineTo(545,764).lineWidth(.5).strokeColor('#dfd4e5').stroke();
 text(doc,'월홍 · 나를 읽는 다정한 시간',50,779,8,THEME.muted,{width:300});
 text(doc,`${String(page).padStart(2,'0')}  /  15`,470,779,8,THEME.muted,{width:75,align:'right'});
}
function card(doc,paragraph,y,index,highlight=false){
 const width=491,padding=20;
 doc.font('Body').fontSize(11.1);
 const content=korean(paragraph),height=doc.heightOfString(content,{width:width-padding*2,lineGap:6});
 const h=height+padding*2;
 if(y+h>747)throw new Error(`Report text exceeds design bounds (card ${index})`);
 const gradient=doc.linearGradient(50,y,541,y+h);gradient.stop(0,highlight?'#f5e7ee':'#ffffff').stop(1,highlight?'#eee6f8':'#ffffff');
 doc.roundedRect(50,y,width,h,9).fill(gradient);
 if(!highlight)doc.roundedRect(50,y,width,h,9).lineWidth(.6).strokeColor('#eee5ed').stroke();
 doc.roundedRect(50,y+20,3,19,1).fill(index%2? '#d4c4e7':'#e5b8ca');
 text(doc,content,70,y+padding,11.1,THEME.ink,{width:451,lineGap:6});
 return y+h+15;
}
function cover(doc,input,row){
 doc.rect(0,0,595.28,841.89).fill(THEME.plum);
 doc.roundedRect(25,25,545,792,120).lineWidth(.6).strokeColor('#796581').stroke();
 doc.roundedRect(34,34,527,774,113).lineWidth(.35).strokeColor('#57445f').stroke();
 text(doc,THEME.brand,58,52,27,'#f7e8ef',{font:'Title',width:130});
 text(doc,'MOONLIGHT EDITION\nPERSONAL SAJU REPORT',300,59,7.4,'#cbbbd9',{width:235,align:'right',characterSpacing:1.5,lineGap:5});
 text(doc,'당신이라는 우주를\n읽는 시간',58,116,31,'#fff2f4',{font:'Serif',width:480,lineGap:12});
 text(doc,`${input.name||'방문자'}님을 위한 월홍 사주 리포트`,59,220,11,'#d9c6e3',{width:470,lineGap:4});
 medallion(doc,298,408,136);
 text(doc,row[2][0],62,567,9.2,'#ddcfe3',{width:470,lineGap:5});
 doc.roundedRect(58,636,479,64,8).fill('#362b44');
 text(doc,row[2][1],76,649,9.4,'#f4e5ed',{width:440,lineGap:5});
 text(doc,row[2][2],60,722,8.5,'#d3bfdc',{width:475,lineGap:5});
 star(doc,298,782,4,'#dcc4ae');
 text(doc,'W O L H O N G',60,779,7.5,'#bfa5c9',{width:180});
 text(doc,'01 / 15',440,779,8,'#bfa5c9',{width:95,align:'right'});
}
function pillarCards(doc,result,y){
 const keys=[['year','년주'],['month','월주'],['day','일주'],['time','시주']];
 keys.forEach(([key,label],i)=>{
  const x=50+i*125;
  doc.roundedRect(x,y,116,117,9).fill(key==='day'?'#eee4f6':'#ffffff');
  doc.roundedRect(x,y,116,117,9).lineWidth(.6).strokeColor('#e3d6e7').stroke();
  text(doc,label,x,y+13,9,THEME.muted,{width:116,align:'center'});
  const values=result.pillars[key];
  if(values.length===1){
   text(doc,korean(values[0][0]),x,y+35,24,THEME.ink,{font:'Title',width:116,align:'center'});
   text(doc,korean(values[0][1]),x,y+67,24,'#9a6c8d',{font:'Title',width:116,align:'center'});
  }else text(doc,values.length?values.map(korean).join('\n또는\n'):'시간\n미상',x+6,y+38,11,THEME.muted,{width:104,align:'center',lineGap:5});
 });
 return y+134;
}
function elementsChart(doc,result,y){
 doc.roundedRect(50,y,491,154,10).fill('#ffffff');
 const colors=['#a5c1b7','#dfa7bb','#d8c295','#b8acd1','#a5b9d4'];
 ELEMENTS.forEach((e,i)=>{
  const yy=y+18+i*25;
  text(doc,e,70,yy,10,THEME.ink,{width:25});
  doc.roundedRect(108,yy+2,350,8,4).fill('#f2edf5');
  const width=350*result.counts[e]/result.total;
  if(width)doc.roundedRect(108,yy+2,Math.max(width,8),8,4).fill(colors[i]);
  text(doc,`${result.counts[e]}개`,474,yy,9,THEME.muted,{width:45,align:'right'});
 });
 return y+171;
}
const labels=['','READING GUIDE','YOUR FOUR PILLARS','INNER NATURE','YIN & YANG','FIVE ELEMENTS','YOUR SEASON','TEN RELATIONSHIPS','LOVE & CONNECTION','WORK & GROWTH','MONEY & RESOURCES','LIVING TOGETHER','DAILY RHYTHM','YOUR NEXT 30 DAYS','A NOTE FOR YOU'];
function render(doc,input,{rows,result}){
 fonts(doc);
 rows.forEach((row,i)=>{
  const [title,subtitle,paragraphs]=row;doc.addPage();
  if(i===0){cover(doc,input,row);return;}
  frame(doc,i+1);
  text(doc,`${String(i).padStart(2,'0')}   /   ${labels[i]}`,50,106,8,'#a080a4',{width:440,characterSpacing:1.2});
  text(doc,title,50,143,25,THEME.ink,{font:'Title',width:475});
  text(doc,subtitle,51,188,11.5,THEME.muted,{font:'Serif',width:475,lineGap:6});
  let y=240;
  if(i===2)y=pillarCards(doc,result,y);
  if(i===5)y=elementsChart(doc,result,y);
  const list=paragraphs.slice();
  if(i===2)list.shift(); // The same computed pillars are presented in the cards.
  if(i===5){
   // Keep the uncertainty note below the chart; values are already visualized.
   list[0]=list[0].split('\n').filter((_,n)=>n!==1).join('\n');
   // The five symbol definitions form a compact inline legend.
   text(doc,list[1].replaceAll('\n','  ·  '),51,y,8.3,THEME.muted,{width:490,lineGap:5});
   y+=35;list.splice(1,1);
  }
  list.forEach((paragraph,j)=>{y=card(doc,paragraph,y,j,j===list.length-1);});
  // Quiet floral signature occupies only the margin, never the reading area.
  if(y<668){doc.save().opacity(.72);flower(doc,498,705,16);star(doc,467,687,3);doc.restore();
   text(doc,'나를 알아가는, 오롯한 시간.',60,705,10,'#a58ba8',{font:'Serif',width:350});}
 });
 if(doc.bufferedPageRange().count!==PRODUCT.pages)throw new Error('Report must have 15 pages');
}
module.exports={render,THEME};
