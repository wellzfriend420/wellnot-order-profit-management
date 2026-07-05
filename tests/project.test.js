import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDeadlineChange, calculateProfit, employeeProject, exportGrouping, progressView, projectShouldComplete } from '../src/domain/project.js';

test('工程内容と記号を順序通り表示する',()=>{const result=progressView([{sequence:2,name:'組立',abbreviation:'組',status:'not_started'},{sequence:1,name:'加工',abbreviation:'加',status:'in_progress'}]);assert.equal(result.currentProcess,'加工');assert.equal(result.remaining,2);assert.deepEqual(result.steps,[{abbreviation:'加',symbol:'△'},{abbreviation:'組',symbol:'○'}]);});
test('全工程完了時だけ案件を完了する',()=>{assert.equal(projectShouldComplete([]),false);assert.equal(projectShouldComplete([{status:'completed'}]),true);assert.equal(projectShouldComplete([{status:'completed'},{status:'in_progress'}]),false);});
test('納期変更理由を必須にする',()=>{assert.throws(()=>assertDeadlineChange('2026-07-01','2026-07-02',''),/必須/);assert.doesNotThrow(()=>assertDeadlineChange('2026-07-01','2026-07-02','客先要望'));});
test('粗利を予算と実績から計算する',()=>{assert.deepEqual(calculateProfit({budgetItems:[{amount:1000},{amount:500}],actualCosts:[{category:'material',amount:300},{category:'outsourcing',amount:200}],confirmedHours:5,hourlyRate:100}),{budget:1500,material:300,outsourcing:200,confirmedHours:5,labor:500,actual:1000,variance:500,grossMarginRate:1/3});});
test('従業員向けデータから機密情報を除外する',()=>{const safe=employeeProject({id:1,budget_items:[1],actual_costs:[2],profit:{},confirmed_hours:9,construction_name:'架空工事'});assert.deepEqual(safe,{id:1,construction_name:'架空工事'});});
test('Excel期間区分を判定する',()=>{assert.equal(exportGrouping('2026-07-01','2026-07-31'),'single_month');assert.equal(exportGrouping('2026-07-01','2026-09-30'),'monthly_sheets');assert.equal(exportGrouping('2026-07-01','2026-10-01'),'combined_period');assert.throws(()=>exportGrouping('2026-08-01','2026-07-01'),/不正/);});

