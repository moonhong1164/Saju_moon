const { Solar } = require('lunar-javascript');
const KoreanLunarCalendar = require('korean-lunar-calendar');

const STEMS = '甲乙丙丁戊己庚辛壬癸';
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
const KOREAN = {甲:'갑',乙:'을',丙:'병',丁:'정',戊:'무',己:'기',庚:'경',辛:'신',壬:'임',癸:'계',子:'자',丑:'축',寅:'인',卯:'묘',辰:'진',巳:'사',午:'오',未:'미',申:'신',酉:'유',戌:'술',亥:'해'};
const ELEMENTS = ['목', '화', '토', '금', '수'];
const STEM_ELEMENTS = [0,0,1,1,2,2,3,3,4,4];
const BRANCH_ELEMENTS = [4,2,0,0,2,1,1,2,3,3,2,4];
const pad = n => String(n).padStart(2, '0');
const dateString = d => `${d.year}-${pad(d.month)}-${pad(d.day)}`;
const korean = text => [...text].map(c => KOREAN[c] || c).join('');
function todayKst(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0,10);
}
function element(char) {
  const stem = STEMS.indexOf(char);
  return ELEMENTS[stem >= 0 ? STEM_ELEMENTS[stem] : BRANCH_ELEMENTS[BRANCHES.indexOf(char)]];
}
function validateDate(input, calendar, today) {
  if (!['solar','lunar','leap'].includes(calendar)) throw new Error('달력 기준을 다시 선택해 주세요.');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) throw new Error('생년월일을 1995-06-15처럼 입력해 주세요.');
  const [year,month,day] = match.slice(1).map(Number);
  if (year < 1900 || year > 2050) throw new Error('1900년부터 2050년까지의 날짜를 입력해 주세요.');
  const converter = new KoreanLunarCalendar();
  const valid = calendar === 'solar' ? converter.setSolarDate(year,month,day) : converter.setLunarDate(year,month,day,calendar === 'leap');
  if (!valid) throw new Error(calendar === 'solar' ? '존재하지 않는 양력 날짜입니다. 월과 일을 확인해 주세요.' : '존재하지 않는 음력 날짜 또는 윤달입니다. 평달·윤달과 날짜를 확인해 주세요.');
  const solar = converter.getSolarCalendar();
  const lunar = converter.getLunarCalendar();
  if (dateString(solar) < '1900-01-01' || dateString(solar) > today) throw new Error('양력으로 1900년 1월 1일부터 오늘까지의 생일을 입력해 주세요.');
  return {solar,lunar};
}
// lunar-javascript's solar-term instants are UTC+8 wall-clock values.
// Only year/month calculations use the one-hour earlier UTC+8 instant.
// Day and hour pillars use the entered UTC+9 civil date, with midnight rollover.
function pillarsAt(solar, hour, minute, second = 0) {
  const chinaDate = new Date(Date.UTC(solar.year,solar.month-1,solar.day,hour-1,minute,second));
  const terms = Solar.fromYmdHms(chinaDate.getUTCFullYear(),chinaDate.getUTCMonth()+1,chinaDate.getUTCDate(),chinaDate.getUTCHours(),chinaDate.getUTCMinutes(),chinaDate.getUTCSeconds()).getLunar();
  const local = Solar.fromYmdHms(solar.year,solar.month,solar.day,hour,minute,0).getLunar();
  const day = local.getDayInGanZhiExact2();
  const hourBranch = Math.floor((hour+1)/2)%12;
  const hourStem = (STEMS.indexOf(day[0])%5*2 + hourBranch)%10;
  return {year:terms.getYearInGanZhiExact(),month:terms.getMonthInGanZhiExact(),day,time:STEMS[hourStem]+BRANCHES[hourBranch]};
}
function calculate({date,calendar='solar',time=''}, {today=todayKst()}={}) {
  const {solar,lunar} = validateDate(date,calendar,today);
  let hour = 12, minute = 0;
  if (time !== '') {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('태어난 시간을 00:00부터 23:59 사이로 입력해 주세요.');
    [hour,minute] = time.split(':').map(Number);
  }
  const raw = pillarsAt(solar,hour,minute);
  const pillars = Object.fromEntries(Object.entries(raw).map(([key,value]) => [key,[value]]));
  if (time) {
    // A HH:mm input specifies a minute, not a known second. Preserve both
    // possibilities if a solar term falls inside that minute.
    const end = pillarsAt(solar,hour,minute,59);
    for (const key of ['year','month']) pillars[key] = [...new Set([raw[key],end[key]])];
  }
  if (!time) {
    pillars.time = [];
    const start = pillarsAt(solar,0,0), end = pillarsAt(solar,23,59);
    for (const key of ['year','month']) pillars[key] = [...new Set([start[key],end[key]])];
  }
  const counts = Object.fromEntries(ELEMENTS.map(e=>[e,0]));
  for (const values of Object.values(pillars)) {
    if (values.length === 1) for (const char of values[0]) counts[element(char)]++;
  }
  const total = Object.values(counts).reduce((a,b)=>a+b,0);
  return {solar,lunar,solarDate:dateString(solar),lunarDate:dateString(lunar),time,pillars,counts,total,dayMaster:raw.day[0],dayElement:element(raw.day[0]),boundary:(pillars.year.length>1 || pillars.month.length>1)};
}
module.exports = {calculate,korean,element,ELEMENTS,STEMS,todayKst};
