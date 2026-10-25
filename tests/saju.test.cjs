const test = require('node:test');
const assert = require('node:assert/strict');
const {calculate,todayKst} = require('../src/saju.cjs');
const {reading} = require('../src/readings.cjs');

test('known four-pillar fixture, 2005-12-23 08:37',()=>{
 const result=calculate({date:'2005-12-23',time:'08:37'});
 assert.deepEqual(result.pillars,{year:['乙酉'],month:['戊子'],day:['辛巳'],time:['壬辰']});
 assert.deepEqual(result.counts,{'목':1,'화':1,'토':2,'금':2,'수':2});
 assert.equal(result.total,8);
});
test('known Korean lunar new year and lunar/solar equivalence',()=>{
 const a=calculate({date:'2024-01-01',calendar:'lunar',time:'12:00'});
 const b=calculate({date:'2024-02-10',time:'12:00'});
 assert.equal(a.solarDate,'2024-02-10');
 assert.deepEqual(a.pillars,b.pillars);
 assert.deepEqual(a.pillars.day,['甲辰']);
});
test('Korean leap fifth month fixture and ordinary month are distinct',()=>{
 const leap=calculate({date:'2017-05-01',calendar:'leap'});
 assert.equal(leap.solarDate,'2017-06-24');
 assert.equal(leap.lunar.intercalation,true);
 assert.deepEqual(leap.pillars.day,['壬午']);
 assert.equal(calculate({date:'2017-05-01',calendar:'lunar'}).solarDate,'2017-05-26');
});
test('Korean lunar published conversion fixture, 1956 lunar 1/21',()=>{
 assert.equal(calculate({date:'1956-01-21',calendar:'lunar'}).solarDate,'1956-03-03');
});
test('invalid solar dates, leap months, times, and future births are rejected',()=>{
 for(const date of ['2023-02-29','2024-02-30','2024-04-31','2024-00-01','2024-13-01','2024-01-00','1899-12-31','2051-01-01','2024-2-1','not a date']) assert.throws(()=>calculate({date}),undefined,date);
 assert.throws(()=>calculate({date:'2024-01-01',calendar:'leap'}));
 assert.throws(()=>calculate({date:'2024-01-31',calendar:'lunar'}));
 assert.throws(()=>calculate({date:'2024-01-01',calendar:'other'}));
 for(const time of ['24:00','23:60','-1:00','8:30','08:30:00']) assert.throws(()=>calculate({date:'2000-01-01',time}));
 assert.throws(()=>calculate({date:'2024-02-11'},{today:'2024-02-10'}));
 // Future detection is after lunar conversion, not by the typed lunar date.
 assert.throws(()=>calculate({date:'2024-01-01',calendar:'lunar'},{today:'2024-02-09'}));
 assert.equal(calculate({date:'2024-02-29'}).solarDate,'2024-02-29');
});
test('year and month change at Ipchun in KST, not lunar new year or UTC+8',()=>{
 const before=calculate({date:'2024-02-04',time:'17:26'});
 const after=calculate({date:'2024-02-04',time:'17:28'});
 assert.deepEqual(before.pillars.year,['癸卯']);
 assert.deepEqual(before.pillars.month,['乙丑']);
 assert.deepEqual(after.pillars.year,['甲辰']);
 assert.deepEqual(after.pillars.month,['丙寅']);
 assert.deepEqual(before.pillars.day,after.pillars.day);
});
test('month changes at Gyeongchip in KST',()=>{
 assert.deepEqual(calculate({date:'2024-03-05',time:'11:00'}).pillars.month,['丙寅']);
 assert.deepEqual(calculate({date:'2024-03-05',time:'12:00'}).pillars.month,['丁卯']);
});
test('unknown birth time does not fabricate an hour; term-boundary pillars excluded from counts',()=>{
 const ordinary=calculate({date:'2005-12-23'});
 assert.deepEqual(ordinary.pillars.time,[]);
 assert.equal(ordinary.total,6);
 const boundary=calculate({date:'2024-02-04'});
 assert.equal(boundary.boundary,true);
 assert.deepEqual(boundary.pillars.year,['癸卯','甲辰']);
 assert.deepEqual(boundary.pillars.month,['乙丑','丙寅']);
 assert.equal(boundary.total,2);
 const monthBoundary=calculate({date:'2024-03-05'});
 assert.equal(monthBoundary.total,4);
});
test('day and hour change at stated boundaries, including 23:00 and midnight',()=>{
 assert.deepEqual(calculate({date:'2000-01-07',time:'00:00'}).pillars.day,['甲子']);
 assert.deepEqual(calculate({date:'2000-01-07',time:'00:00'}).pillars.time,['甲子']);
 assert.deepEqual(calculate({date:'2000-01-07',time:'00:59'}).pillars.time,['甲子']);
 assert.deepEqual(calculate({date:'2000-01-07',time:'01:00'}).pillars.time,['乙丑']);
 assert.deepEqual(calculate({date:'2000-01-07',time:'22:59'}).pillars.time,['乙亥']);
 const late=calculate({date:'2000-01-07',time:'23:00'});
 assert.deepEqual(late.pillars.day,['甲子']);
 assert.deepEqual(late.pillars.time,['甲子']);
 const next=calculate({date:'2000-01-08',time:'00:00'});
 assert.deepEqual(next.pillars.day,['乙丑']);
 assert.deepEqual(next.pillars.time,['丙子']);
});
test('today uses Korea midnight regardless of host timezone',()=>{
 assert.equal(todayKst(new Date('2026-10-25T14:59:59Z')),'2026-10-25');
 assert.equal(todayKst(new Date('2026-10-25T15:00:00Z')),'2026-10-26');
});
test('readings vary by actual day master and topic',()=>{
 const a=calculate({date:'2000-01-07'}), b=calculate({date:'2000-01-08'});
 assert.notEqual(reading(a,'종합 사주').body,reading(b,'종합 사주').body);
 assert.notEqual(reading(a,'종합 사주').body,reading(a,'연애와 인연').body);
 assert.notEqual(reading(a,'연애와 인연').body,reading(a,'일과 재물').body);
});

test('minute containing a solar term is uncertain when seconds are unknown',()=>{
 const result=calculate({date:'2024-02-04',time:'17:27'});
 assert.equal(result.boundary,true);
 assert.deepEqual(result.pillars.year,['癸卯','甲辰']);
 assert.deepEqual(result.pillars.month,['乙丑','丙寅']);
 assert.equal(result.total,4);
});
