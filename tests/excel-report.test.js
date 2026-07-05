import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPACITY, segmentsFor } from '../src/infrastructure/excel-report.js';

test('2〜3か月は空月を含め月別シートに分ける',()=>{
  const projects=[
    {start_date:'2026-07-01',job_number:'A'},
    {start_date:'2026-09-15',job_number:'B'},
  ];
  const segments=segmentsFor(projects,'2026-07-01','2026-09-30','monthly_sheets');
  assert.deepEqual(segments.map((item)=>[item.name,item.items.length]),[['2026-07',1],['2026-08',0],['2026-09',1]]);
});

test('31件を超える期間は原本レイアウトを複数シートへ分割する',()=>{
  const projects=Array.from({length:CAPACITY+1},(_,index)=>({start_date:'2026-07-01',job_number:String(index)}));
  const segments=segmentsFor(projects,'2026-07-01','2026-07-31','single_month');
  assert.deepEqual(segments.map((item)=>[item.name,item.items.length]),[['2026-07_1',31],['2026-07_2',1]]);
});
