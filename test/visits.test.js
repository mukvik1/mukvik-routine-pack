'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {report,summary}=require('../analytics');
test('visit report preserves aggregate history and limits periods to safe values',async()=>{
 const queries=[];
 const pool={query:async(sql,args)=>{queries.push({sql,args});if(sql.includes('GROUP BY section'))return {rows:[{section:'free',views:9}]};if(sql.includes('min(visit_day)'))return {rows:[{first:'2026-10-15'}]};return {rows:[{people:3,views:9}]};}};
 const text=await report(pool,30);
 assert.match(text,/Посетители: 3/);assert.match(text,/Просмотры: 9/);assert.match(text,/Бесплатные рутины — 9/);assert.match(text,/2026-10-15/);
 assert.deepEqual(queries[0].args,[30]);
 await report(pool,"malicious");assert.deepEqual(queries[3].args,[7]);
 await summary(pool);assert.match(queries.at(-1).sql,/today-29/);assert.match(queries.at(-1).sql,/month_people/);
});
