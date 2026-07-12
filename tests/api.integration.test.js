import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import ExcelJS from 'exceljs';

const port=32109;
const base=`http://127.0.0.1:${port}`;
const temp=resolve('.test-data',`run-${process.pid}`);
mkdirSync(temp,{recursive:true});
let child;

before(async()=>{
  child=spawn(process.execPath,[resolve('src/server.js')],{env:{...process.env,PORT:String(port),DATABASE_PATH:join(temp,'test.sqlite'),ADMIN_INITIAL_PASSWORD:'admin-test-pass',WORKER_INITIAL_PASSWORD:'worker-test-pass'},stdio:'ignore'});
  for(let i=0;i<40;i++){try{if((await fetch(base)).ok)return;}catch{}await new Promise((r)=>setTimeout(r,50));}
  throw new Error('テストサーバーを起動できませんでした');
});
after(async()=>{if(child&&!child.killed){child.kill();await once(child,'exit');}else if(child?.exitCode==null){await once(child,'exit');}rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});});

async function login(username,password){const response=await fetch(`${base}/api/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];}
async function request(path,{cookie,method='GET',value}={}){return fetch(`${base}${path}`,{method,headers:{cookie:cookie??'','content-type':'application/json'},body:value===undefined?undefined:JSON.stringify(value)});}

test('管理者と従業員の機密情報をAPIで分離する',async()=>{
  assert.deepEqual(await (await fetch(`${base}/healthz`)).json(),{ok:true});
  const admin=await login('admin','admin-test-pass');
  const worker=await login('worker','worker-test-pass');
  let response=await request('/api/masters/customers',{cookie:admin,method:'POST',value:{name:'架空客先'}});const customer=await response.json();
  assert.equal((await request(`/api/masters/customers/${customer.id}`,{cookie:worker,method:'PATCH',value:{name:'不正変更'}})).status,404);
  assert.equal((await request(`/api/masters/customers/${customer.id}`,{cookie:admin,method:'PATCH',value:{name:'架空客先（更新）'}})).status,200);
  const masters=await (await request('/api/masters',{cookie:admin})).json();
  response=await request('/api/projects',{cookie:admin,method:'POST',value:{job_number:'TEST-NO-PROC',customer_id:customer.id,construction_name:'工程未登録工事',start_date:'2026-10-01',due_date:'2026-10-10',drawing_management:false,processes:[]}});
  assert.equal(response.status,201);
  const noProcessProject=await response.json();
  const calendar=await (await request('/api/calendar?start=2026-10-01&end=2026-10-31',{cookie:admin})).json();
  assert.equal(calendar.bars.find((bar)=>bar.project_id===noProcessProject.id)?.process_name,'工程未登録');
  assert.equal(calendar.bars.find((bar)=>bar.project_id===noProcessProject.id)?.is_placeholder,1);
  response=await request('/api/projects',{cookie:admin,method:'POST',value:{job_number:'TEST-001',customer_id:customer.id,construction_name:'架空工事',short_name:'架空',start_date:'2026-07-01',material_order_date:'2026-07-02',material_delivery_date:'2026-07-04',due_date:'2026-08-31',drawing_management:true,processes:masters.processes.slice(0,2).map((x,index)=>({process_master_id:x.id,planned_start_date:'2026-07-01',planned_end_date:'2026-07-03',assignee_user_id:index===0?masters.users[0].id:null}))}});assert.equal(response.status,201);const project=await response.json();
  assert.equal((await request(`/api/projects/${project.id}/budget-items`,{cookie:admin,method:'POST',value:{label:'見積',amount:1000}})).status,201);
  assert.equal((await request(`/api/projects/${project.id}/estimate-actual-items`,{cookie:admin,method:'POST',value:{master_id:masters.estimate_items[0].id,budget_quantity:2,budget_unit:'h',budget_unit_price:5000,actual_quantity:3,actual_unit:'h',actual_unit_price:6000}})).status,201);
  assert.equal((await request(`/api/projects/${project.id}/budget-items`,{cookie:worker,method:'POST',value:{label:'漏えい',amount:1}})).status,404);
  const adminView=await (await request(`/api/projects/${project.id}`,{cookie:admin})).json();
  const workerView=await (await request(`/api/projects/${project.id}`,{cookie:worker})).json();
  assert.equal(adminView.project.short_name,'架空');
  assert.equal(adminView.project.processes[0].assignee_user_id,masters.users[0].id);
  assert.equal(adminView.project.estimate_actual_items[0].budget_amount,10000);
  assert.equal(adminView.project.estimate_actual_items[0].actual_amount,18000);
  assert.equal(adminView.project.variance_by_category[0].variance,-8000);
  assert.equal(adminView.project.profit.budget,11000);
  assert.equal(adminView.project.material_order_date,'2026-07-02');
  assert.equal('profit' in workerView.project,false);
  assert.equal('estimate_actual_items' in workerView.project,false);
  assert.equal('budget_items' in workerView.project,false);
  assert.equal((await request(`/api/projects/${project.id}`,{cookie:admin,method:'PATCH',value:{version:adminView.project.version,due_date:'2026-09-01',construction_name:'架空工事'}})).status,409);
  const updateResponse=await request(`/api/projects/${project.id}`,{cookie:admin,method:'PATCH',value:{version:adminView.project.version,start_date:'2026-07-01',material_order_date:'2026-07-03',material_delivery_date:'2026-07-04',due_date:'2026-09-01',deadline_change_reason:'客先要望',construction_name:'架空工事'}});assert.equal(updateResponse.status,200);assert.equal((await updateResponse.json()).project.material_order_date,'2026-07-03');
  assert.equal((await request(`/api/projects/${project.id}`,{cookie:admin,method:'PATCH',value:{version:adminView.project.version,due_date:'2026-09-02',deadline_change_reason:'競合試験',construction_name:'架空工事'}})).status,409);
  const drawingResponse=await request(`/api/projects/${project.id}/drawings`,{cookie:admin,method:'POST',value:{drawing_number:'D-001',title:'組立図'}});assert.equal(drawingResponse.status,201);const drawing=await drawingResponse.json();
  assert.equal((await request(`/api/processes/${workerView.project.processes[0].id}/drawing`,{cookie:admin,method:'PATCH',value:{drawing_id:drawing.id}})).status,200);
  const memoResponse=await request(`/api/processes/${workerView.project.processes[0].id}/memos`,{cookie:worker,method:'POST',value:{memo:'7/1 3h'}});assert.equal(memoResponse.status,201);const memo=await memoResponse.json();
  assert.equal((await request(`/api/work-memos/${memo.id}`,{cookie:worker,method:'PATCH',value:{memo:'7/1 3h',hours:3,confirmed:true}})).status,404);
  assert.equal((await request(`/api/work-memos/${memo.id}`,{cookie:admin,method:'PATCH',value:{memo:'7/1 3h',hours:3,confirmed:true}})).status,200);
  const afterMemo=await (await request(`/api/projects/${project.id}`,{cookie:admin})).json();assert.equal(afterMemo.project.confirmed_hours,3);
  for(const process of workerView.project.processes)assert.equal((await request(`/api/processes/${process.id}`,{cookie:worker,method:'PATCH',value:{status:'completed'}})).status,200);
  const completed=await (await request(`/api/projects/${project.id}`,{cookie:admin})).json();
  assert.equal(completed.project.status,'completed');
  assert.ok(completed.project.locked_at);
  assert.equal((await request(`/api/projects/${project.id}/improvements`,{cookie:admin,method:'POST',value:{memo:'次回見積へ反映'}})).status,201);
  const exportResponse=await request('/api/exports/excel?start=2026-07-01&end=2026-09-30',{cookie:admin});
  assert.equal(exportResponse.status,200);
  assert.match(exportResponse.headers.get('content-type'),/spreadsheetml/);
  const exportedWorkbook=new ExcelJS.Workbook();await exportedWorkbook.xlsx.load(Buffer.from(await exportResponse.arrayBuffer()));
  assert.deepEqual(exportedWorkbook.worksheets.filter((sheet)=>sheet.state==='visible').map((sheet)=>sheet.name),['2026-07','2026-08','2026-09']);
  assert.equal(exportedWorkbook.worksheets.length,3);
  assert.equal(exportedWorkbook.getWorksheet('2026-07').getCell('A8').value,'架空客先（更新）');
  assert.equal(exportedWorkbook.getWorksheet('2026-07').getCell('B8').value,'架空工事');
  assert.equal(exportedWorkbook.getWorksheet('2026-07').getCell('E8').value,'R8.7');
  assert.equal(exportedWorkbook.getWorksheet('2026-07').getCell('F8').value,1000);
  assert.equal(exportedWorkbook.getWorksheet('2026-07').pageSetup.orientation,'landscape');
  assert.equal(exportedWorkbook.getWorksheet('2026-07').pageSetup.printArea,'A1:W104');
  assert.equal(exportedWorkbook.getWorksheet('2026-08').getCell('A8').value,null);
  assert.equal((await request('/api/exports/excel?start=2026-07-01&end=2026-09-30',{cookie:worker})).status,404);
  const history=await (await request('/api/exports/history',{cookie:admin})).json();
  assert.equal(history.history.length,1);
  assert.equal((await request(`/api/projects/${project.id}`,{cookie:worker,method:'DELETE'})).status,404);
  assert.equal((await request(`/api/projects/${project.id}`,{cookie:admin,method:'DELETE'})).status,200);
  assert.equal((await request(`/api/projects/${project.id}`,{cookie:admin})).status,404);
});
