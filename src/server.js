import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, transaction, audit, now } from './infrastructure/db.js';
import { newSessionToken, tokenHash, verifyPassword } from './infrastructure/auth.js';
import { buildOrderDetailsWorkbook } from './infrastructure/excel-report.js';
import { assertDeadlineChange, assertEditable, calculateProfit, employeeProject, exportGrouping, progressView, projectShouldComplete } from './domain/project.js';

const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT ?? 3000);
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml' };
const json = (res, status, body) => { res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }); res.end(JSON.stringify(body)); };
const fail = (res, error, status = 400) => json(res, status, { error: error.message ?? String(error) });
const body = async (req) => { const chunks=[]; for await (const chunk of req) chunks.push(chunk); const text=Buffer.concat(chunks).toString('utf8'); return text ? JSON.parse(text) : {}; };
const cookies = (req) => Object.fromEntries((req.headers.cookie ?? '').split(';').filter(Boolean).map((part) => part.trim().split('=').map(decodeURIComponent)));

function userFor(req) {
  const token = cookies(req).session;
  if (!token) return null;
  return db.prepare(`SELECT u.id,u.username,u.display_name,u.role FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`).get(tokenHash(token), now()) ?? null;
}
function requireUser(req, res, role) {
  const user = userFor(req);
  if (!user) { fail(res, new Error('ログインが必要です'), 401); return null; }
  if (role && user.role !== role) { fail(res, new Error('対象が見つかりません'), 404); return null; }
  return user;
}
const rows = (sql, ...args) => db.prepare(sql).all(...args);
const one = (sql, ...args) => db.prepare(sql).get(...args);

function processesFor(projectId) {
  return rows(`SELECT pp.*,pm.name,pm.abbreviation,d.drawing_number FROM project_processes pp
    JOIN process_masters pm ON pm.id=pp.process_master_id LEFT JOIN drawings d ON d.id=pp.drawing_id
    WHERE pp.project_id=? ORDER BY pp.sequence`, projectId);
}
function projectView(project, role) {
  const processes = processesFor(project.id).map((process) => ({
    ...process,
    work_memos: rows(`SELECT id,memo,work_date,${role === 'admin' ? 'hours,confirmed,' : ''}created_at FROM work_memos WHERE project_process_id=? ORDER BY created_at`, process.id)
  }));
  const view = { ...project, processes, progress: progressView(processes), cautions: rows(`SELECT cm.* FROM project_cautions pc JOIN caution_masters cm ON cm.id=pc.caution_id WHERE pc.project_id=? ORDER BY cm.sort_order`, project.id) };
  if (role === 'admin') {
    view.drawings = rows('SELECT * FROM drawings WHERE project_id=? ORDER BY drawing_number', project.id);
    view.budget_items = rows('SELECT * FROM budget_items WHERE project_id=? ORDER BY sort_order,id', project.id);
    view.actual_costs = rows('SELECT * FROM actual_costs WHERE project_id=? ORDER BY incurred_on,id', project.id);
    view.confirmed_hours = one(`SELECT COALESCE(SUM(w.hours),0) hours FROM work_memos w JOIN project_processes pp ON pp.id=w.project_process_id WHERE pp.project_id=? AND w.confirmed=1`, project.id).hours;
    view.profit = calculateProfit({ budgetItems:view.budget_items, actualCosts:view.actual_costs, confirmedHours:view.confirmed_hours, hourlyRate:Number(process.env.HOURLY_RATE ?? 0) });
    view.deadline_changes = rows('SELECT dc.*,u.display_name changed_by_name FROM deadline_changes dc JOIN users u ON u.id=dc.changed_by WHERE project_id=? ORDER BY changed_at DESC', project.id);
    view.improvement_memos = rows('SELECT im.*,u.display_name created_by_name FROM improvement_memos im JOIN users u ON u.id=im.created_by WHERE project_id=? ORDER BY created_at DESC', project.id);
  }
  return role === 'admin' ? view : employeeProject(view);
}

async function api(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/api/login') {
    const input = await body(req); const user = one('SELECT * FROM users WHERE username=? AND active=1', input.username ?? '');
    if (!user || !verifyPassword(input.password ?? '', user.password_salt, user.password_hash)) { audit(null,'LOGIN_FAILED','session',null,{username:input.username}); return fail(res,new Error('ユーザー名またはパスワードが違います'),401); }
    const token=newSessionToken(); const expires=new Date(Date.now()+8*60*60*1000).toISOString();
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(tokenHash(token),user.id,expires,now()); audit(user,'LOGIN','session',null);
    res.writeHead(200,{'content-type':'application/json; charset=utf-8','set-cookie':`session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`}); return res.end(JSON.stringify({user:{id:user.id,display_name:user.display_name,role:user.role}}));
  }
  if (req.method === 'POST' && url.pathname === '/api/logout') { const token=cookies(req).session; if(token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token)); res.writeHead(204,{'set-cookie':'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'}); return res.end(); }
  const user=requireUser(req,res); if(!user) return;
  if (req.method === 'GET' && url.pathname === '/api/me') return json(res,200,{user});
  if (req.method === 'GET' && url.pathname === '/api/masters') return json(res,200,{processes:rows('SELECT * FROM process_masters WHERE active=1 ORDER BY sort_order'),cautions:rows('SELECT * FROM caution_masters WHERE active=1 ORDER BY sort_order'),customers:rows('SELECT * FROM customers WHERE active=1 ORDER BY sort_order,name')});
  if (req.method === 'POST' && url.pathname === '/api/masters/customers') { if(user.role!=='admin') return fail(res,new Error('対象が見つかりません'),404); const input=await body(req); const result=db.prepare('INSERT INTO customers(name,sort_order) VALUES(?,?)').run(String(input.name).trim(),Number(input.sort_order??0)); audit(user,'CREATE','customer',result.lastInsertRowid); return json(res,201,{id:Number(result.lastInsertRowid)}); }
  if (req.method === 'POST' && url.pathname === '/api/masters/processes') { if(user.role!=='admin') return fail(res,new Error('対象が見つかりません'),404); const input=await body(req); const result=db.prepare('INSERT INTO process_masters(name,abbreviation,sort_order) VALUES(?,?,?)').run(String(input.name).trim(),String(input.abbreviation).trim(),Number(input.sort_order??999)); audit(user,'CREATE','process_master',result.lastInsertRowid); return json(res,201,{id:Number(result.lastInsertRowid)}); }
  if (req.method === 'POST' && url.pathname === '/api/masters/cautions') { if(user.role!=='admin') return fail(res,new Error('対象が見つかりません'),404); const input=await body(req); const result=db.prepare('INSERT INTO caution_masters(name,sort_order) VALUES(?,?)').run(String(input.name).trim(),Number(input.sort_order??999)); audit(user,'CREATE','caution_master',result.lastInsertRowid); return json(res,201,{id:Number(result.lastInsertRowid)}); }
  const masterEdit=url.pathname.match(/^\/api\/masters\/(customers|processes|cautions)\/(\d+)$/);
  if(req.method==='PATCH'&&masterEdit){if(user.role!=='admin')return fail(res,new Error('対象が見つかりません'),404);const [,type,idText]=masterEdit;const id=Number(idText);const input=await body(req);try{const table=type==='customers'?'customers':type==='processes'?'process_masters':'caution_masters';const current=one(`SELECT * FROM ${table} WHERE id=?`,id);if(!current)throw new Error('マスタが見つかりません');const sortOrder=Number(input.sort_order??current.sort_order);const active=input.active===undefined?current.active:input.active?1:0;let result;if(type==='processes')result=db.prepare('UPDATE process_masters SET name=?,abbreviation=?,sort_order=?,active=? WHERE id=?').run(String(input.name??current.name).trim(),String(input.abbreviation??current.abbreviation).trim(),sortOrder,active,id);else result=db.prepare(`UPDATE ${table} SET name=?,sort_order=?,active=? WHERE id=?`).run(String(input.name??current.name).trim(),sortOrder,active,id);if(result.changes!==1)throw new Error('マスタが見つかりません');audit(user,'UPDATE',`${type}_master`,id,input);return json(res,200,{ok:true});}catch(error){return fail(res,error);}}
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    const completed=url.searchParams.get('completed')==='1'; const found=rows(`SELECT p.*,c.name customer_name FROM projects p JOIN customers c ON c.id=p.customer_id WHERE p.deleted_at IS NULL AND p.status ${completed?'=':'!='} 'completed' ORDER BY p.due_date,p.job_number`);
    return json(res,200,{projects:found.map((p)=>projectView(p,user.role))});
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    if(user.role!=='admin') return fail(res,new Error('対象が見つかりません'),404); const input=await body(req);
    try { const id=transaction(()=>{ const stamp=now(); const project=db.prepare(`INSERT INTO projects(job_number,customer_id,construction_name,start_date,material_order_date,material_delivery_date,due_date,special_notes,site_notes,drawing_management,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(input.job_number,input.customer_id,input.construction_name,input.start_date||null,input.material_order_date||null,input.material_delivery_date||null,input.due_date,input.special_notes??'',input.site_notes??'',input.drawing_management?1:0,user.id,user.id,stamp,stamp).lastInsertRowid;
      const add=db.prepare('INSERT INTO project_processes(project_id,process_master_id,sequence,planned_start_date,planned_end_date,updated_by,updated_at) VALUES(?,?,?,?,?,?,?)'); (input.processes??[]).forEach((p,i)=>add.run(project,p.process_master_id,i+1,p.planned_start_date||null,p.planned_end_date||null,user.id,stamp));
      const caution=db.prepare('INSERT INTO project_cautions(project_id,caution_id) VALUES(?,?)'); (input.caution_ids??[]).forEach((id)=>caution.run(project,id)); audit(user,'CREATE','project',project,{job_number:input.job_number}); return Number(project); }); return json(res,201,{id}); } catch(error){ return fail(res,error); }
  }
  const projectMatch=url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (req.method === 'GET' && projectMatch) { const project=one('SELECT p.*,c.name customer_name FROM projects p JOIN customers c ON c.id=p.customer_id WHERE p.id=? AND p.deleted_at IS NULL',Number(projectMatch[1])); return project?json(res,200,{project:projectView(project,user.role)}):fail(res,new Error('案件が見つかりません'),404); }
  if (req.method === 'PATCH' && projectMatch) {
    if(user.role!=='admin') return fail(res,new Error('対象が見つかりません'),404); const input=await body(req); const id=Number(projectMatch[1]); const project=one('SELECT * FROM projects WHERE id=?',id); if(!project) return fail(res,new Error('案件が見つかりません'),404);
    try { assertEditable(project); assertDeadlineChange(project.due_date,input.due_date??project.due_date,input.deadline_change_reason); transaction(()=>{ const due=input.due_date??project.due_date; const result=db.prepare(`UPDATE projects SET construction_name=?,start_date=?,material_order_date=?,material_delivery_date=?,due_date=?,special_notes=?,site_notes=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=?`).run(input.construction_name??project.construction_name,input.start_date||null,input.material_order_date||null,input.material_delivery_date||null,due,input.special_notes??project.special_notes,input.site_notes??project.site_notes,user.id,now(),id,input.version); if(result.changes!==1)throw new Error('他の利用者が先に更新しました。再読込してください'); if(due!==project.due_date) db.prepare('INSERT INTO deadline_changes(project_id,old_due_date,new_due_date,reason,changed_by,changed_at) VALUES(?,?,?,?,?,?)').run(id,project.due_date,due,input.deadline_change_reason.trim(),user.id,now()); audit(user,'UPDATE','project',id,{due_changed:due!==project.due_date}); }); return json(res,200,{project:projectView(one('SELECT p.*,c.name customer_name FROM projects p JOIN customers c ON c.id=p.customer_id WHERE p.id=?',id),user.role)}); } catch(error){ return fail(res,error,409); }
  }
  const processMatch=url.pathname.match(/^\/api\/processes\/(\d+)$/);
  if (req.method === 'PATCH' && processMatch) { const input=await body(req); const id=Number(processMatch[1]); const process=one('SELECT pp.*,p.locked_at,p.deleted_at FROM project_processes pp JOIN projects p ON p.id=pp.project_id WHERE pp.id=?',id); if(!process) return fail(res,new Error('工程が見つかりません'),404);
    try { assertEditable(process); const allowed=['not_started','in_progress','completed']; if(!allowed.includes(input.status)) throw new Error('工程状態が不正です'); transaction(()=>{ const stamp=now(); db.prepare(`UPDATE project_processes SET status=?,started_at=CASE WHEN ?='in_progress' AND started_at IS NULL THEN ? ELSE started_at END,completed_at=CASE WHEN ?='completed' THEN ? ELSE NULL END,version=version+1,updated_by=?,updated_at=? WHERE id=?`).run(input.status,input.status,stamp,input.status,stamp,user.id,stamp,id); const all=processesFor(process.project_id); if(projectShouldComplete(all)) db.prepare("UPDATE projects SET status='completed',completed_at=?,locked_at=?,updated_by=?,updated_at=? WHERE id=?").run(stamp,stamp,user.id,stamp,process.project_id); else db.prepare("UPDATE projects SET status='in_progress',completed_at=NULL,locked_at=NULL,updated_by=?,updated_at=? WHERE id=? AND status!='completed'").run(user.id,stamp,process.project_id); audit(user,'UPDATE_PROCESS','process',id,{status:input.status}); }); return json(res,200,{ok:true}); } catch(error){ return fail(res,error,409); }
  }
  const processDrawing=url.pathname.match(/^\/api\/processes\/(\d+)\/drawing$/);
  if(req.method==='PATCH'&&processDrawing){if(user.role!=='admin')return fail(res,new Error('対象が見つかりません'),404);const input=await body(req);const id=Number(processDrawing[1]);const process=one('SELECT pp.*,p.drawing_management,p.locked_at,p.deleted_at FROM project_processes pp JOIN projects p ON p.id=pp.project_id WHERE pp.id=?',id);try{assertEditable(process);if(!process.drawing_management)throw new Error('図面番号管理がOFFです');if(input.drawing_id!=null&&!one('SELECT id FROM drawings WHERE id=? AND project_id=?',Number(input.drawing_id),process.project_id))throw new Error('図面番号が不正です');db.prepare('UPDATE project_processes SET drawing_id=?,version=version+1,updated_by=?,updated_at=? WHERE id=?').run(input.drawing_id==null?null:Number(input.drawing_id),user.id,now(),id);audit(user,'ASSIGN_DRAWING','process',id,{drawing_id:input.drawing_id??null});return json(res,200,{ok:true});}catch(error){return fail(res,error);}}
  const memoMatch=url.pathname.match(/^\/api\/processes\/(\d+)\/memos$/);
  if (req.method === 'POST' && memoMatch) { const input=await body(req); const process=one('SELECT pp.*,p.locked_at,p.deleted_at FROM project_processes pp JOIN projects p ON p.id=pp.project_id WHERE pp.id=?',Number(memoMatch[1])); if(!process) return fail(res,new Error('工程が見つかりません'),404); try{assertEditable(process); const hours=user.role==='admin'&&input.hours!==''?Number(input.hours):null; const confirmed=user.role==='admin'&&input.confirmed?1:0; const result=db.prepare('INSERT INTO work_memos(project_process_id,memo,work_date,hours,confirmed,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(process.id,String(input.memo??'').trim(),input.work_date||null,hours,confirmed,user.id,now(),now()); audit(user,'CREATE','work_memo',result.lastInsertRowid); return json(res,201,{id:Number(result.lastInsertRowid)});}catch(error){return fail(res,error);}
  }
  const workMemo=url.pathname.match(/^\/api\/work-memos\/(\d+)$/);
  if(req.method==='PATCH'&&workMemo){if(user.role!=='admin')return fail(res,new Error('対象が見つかりません'),404);const id=Number(workMemo[1]);const memo=one('SELECT w.*,p.locked_at,p.deleted_at FROM work_memos w JOIN project_processes pp ON pp.id=w.project_process_id JOIN projects p ON p.id=pp.project_id WHERE w.id=?',id);try{assertEditable(memo);const input=await body(req);const hours=input.hours==null||input.hours===''?null:Number(input.hours);if(hours!=null&&(!Number.isFinite(hours)||hours<0))throw new Error('工数が不正です');db.prepare('UPDATE work_memos SET memo=?,work_date=?,hours=?,confirmed=?,updated_at=? WHERE id=?').run(String(input.memo??memo.memo).trim(),input.work_date||memo.work_date,hours,input.confirmed?1:0,now(),id);audit(user,'CONFIRM_WORK_MEMO','work_memo',id,{hours,confirmed:Boolean(input.confirmed)});return json(res,200,{ok:true});}catch(error){return fail(res,error);}}
  const unlock=url.pathname.match(/^\/api\/projects\/(\d+)\/unlock$/);
  if(req.method==='POST'&&unlock){if(user.role!=='admin')return fail(res,new Error('対象が見つかりません'),404);const input=await body(req);if(!String(input.reason??'').trim())return fail(res,new Error('ロック解除理由は必須です'));const id=Number(unlock[1]);db.prepare('UPDATE projects SET locked_at=NULL,status=\'in_progress\',updated_by=?,updated_at=? WHERE id=?').run(user.id,now(),id);audit(user,'UNLOCK','project',id,{reason:input.reason.trim()});return json(res,200,{ok:true});}
  const improvement=url.pathname.match(/^\/api\/projects\/(\d+)\/improvements$/);
  if(req.method==='POST'&&improvement){if(user.role!=='admin')return fail(res,new Error('対象が見つかりません'),404);const id=Number(improvement[1]);const project=one('SELECT * FROM projects WHERE id=?',id);if(project?.status!=='completed')return fail(res,new Error('改善メモは完了後のみ入力できます'));const input=await body(req);const result=db.prepare('INSERT INTO improvement_memos(project_id,memo,created_by,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,String(input.memo).trim(),user.id,now(),now());audit(user,'CREATE','improvement_memo',result.lastInsertRowid);return json(res,201,{id:Number(result.lastInsertRowid)});}
  const budget=url.pathname.match(/^\/api\/projects\/(\d+)\/budget-items$/);
  if(req.method==='POST'&&budget){if(user.role!=='admin')return fail(res,new Error('対象が見つかりません'),404);const id=Number(budget[1]);const project=one('SELECT * FROM projects WHERE id=?',id);try{assertEditable(project);const input=await body(req);const result=db.prepare('INSERT INTO budget_items(project_id,label,amount,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,String(input.label).trim(),Number(input.amount),Number(input.sort_order??0),now(),now());audit(user,'CREATE','budget_item',result.lastInsertRowid);return json(res,201,{id:Number(result.lastInsertRowid)});}catch(error){return fail(res,error);}}
  const cost=url.pathname.match(/^\/api\/projects\/(\d+)\/actual-costs$/);
  if(req.method==='POST'&&cost){if(user.role!=='admin')return fail(res,new Error('対象が見つかりません'),404);const id=Number(cost[1]);const project=one('SELECT * FROM projects WHERE id=?',id);try{assertEditable(project);const input=await body(req);if(!['material','outsourcing'].includes(input.category))throw new Error('原価区分が不正です');const result=db.prepare('INSERT INTO actual_costs(project_id,category,label,amount,incurred_on,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,input.category,String(input.label??'').trim(),Number(input.amount),input.incurred_on||null,now(),now());audit(user,'CREATE','actual_cost',result.lastInsertRowid);return json(res,201,{id:Number(result.lastInsertRowid)});}catch(error){return fail(res,error);}}
  const drawing=url.pathname.match(/^\/api\/projects\/(\d+)\/drawings$/);
  if(req.method==='POST'&&drawing){if(user.role!=='admin')return fail(res,new Error('対象が見つかりません'),404);const id=Number(drawing[1]);const project=one('SELECT * FROM projects WHERE id=?',id);try{assertEditable(project);if(!project.drawing_management)throw new Error('図面番号管理がOFFです');const input=await body(req);const result=db.prepare('INSERT INTO drawings(project_id,drawing_number,title) VALUES(?,?,?)').run(id,String(input.drawing_number).trim(),String(input.title??'').trim());audit(user,'CREATE','drawing',result.lastInsertRowid);return json(res,201,{id:Number(result.lastInsertRowid)});}catch(error){return fail(res,error);}}
  const removal=url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if(req.method==='DELETE'&&removal){if(user.role!=='admin')return fail(res,new Error('対象が見つかりません'),404);const id=Number(removal[1]);db.prepare('UPDATE projects SET deleted_at=?,updated_by=?,updated_at=? WHERE id=?').run(now(),user.id,now(),id);audit(user,'DELETE','project',id);return json(res,200,{ok:true});}
  if(req.method==='GET'&&url.pathname==='/api/calendar'){const start=url.searchParams.get('start');const end=url.searchParams.get('end');const bars=rows(`SELECT pp.id,pp.project_id,pp.planned_start_date start,pp.planned_end_date end,pp.status,p.job_number,p.construction_name,pm.name process_name FROM project_processes pp JOIN projects p ON p.id=pp.project_id JOIN process_masters pm ON pm.id=pp.process_master_id WHERE p.deleted_at IS NULL AND pp.planned_start_date<=? AND pp.planned_end_date>=? ORDER BY pp.planned_start_date,p.job_number,pp.sequence`,end,start);return json(res,200,{bars});}
  if(req.method==='GET'&&url.pathname==='/api/exports/history'){if(user.role!=='admin')return fail(res,new Error('対象が見つかりません'),404);return json(res,200,{history:rows('SELECT eh.*,u.display_name exported_by_name FROM export_history eh JOIN users u ON u.id=eh.exported_by ORDER BY exported_at DESC LIMIT 200')});}
  if(req.method==='GET'&&url.pathname==='/api/exports/excel'){if(user.role!=='admin')return fail(res,new Error('対象が見つかりません'),404);const start=url.searchParams.get('start'),end=url.searchParams.get('end');try{const grouping=exportGrouping(start,end);const projects=rows(`SELECT p.job_number,c.name customer_name,p.construction_name,p.start_date,p.due_date,p.status,COALESCE((SELECT SUM(b.amount) FROM budget_items b WHERE b.project_id=p.id),0) budget_total FROM projects p JOIN customers c ON c.id=p.customer_id WHERE p.deleted_at IS NULL AND p.start_date BETWEEN ? AND ? ORDER BY p.start_date,p.job_number`,start,end);const exportedAt=now();const output=await buildOrderDetailsWorkbook({projects,start,end,grouping,exportedAt:new Date(exportedAt)});db.prepare('INSERT INTO export_history(export_type,period_start,period_end,exported_by,exported_at,parameters_json) VALUES(?,?,?,?,?,?)').run('excel',start,end,user.id,exportedAt,JSON.stringify({grouping,format:'original-template'}));audit(user,'EXPORT','excel',null,{start,end,grouping,format:'original-template'});res.writeHead(200,{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':`attachment; filename="orders-${start}-${end}.xlsx"`});return res.end(output);}catch(error){return fail(res,error);}}
  return fail(res,new Error('対象が見つかりません'),404);
}

function staticFile(req,res,url){let path=url.pathname==='/'?'/index.html':url.pathname;path=normalize(path).replace(/^(\.\.[/\\])+/, '');const file=resolve(root,'public',`.${path}`);if(!file.startsWith(resolve(root,'public'))||!existsSync(file)){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'content-type':mime[extname(file)]??'application/octet-stream'});res.end(readFileSync(file));}
export const server=http.createServer(async(req,res)=>{const url=new URL(req.url,`http://${req.headers.host??'localhost'}`);try{if(url.pathname.startsWith('/api/'))await api(req,res,url);else staticFile(req,res,url);}catch(error){console.error(error);if(!res.headersSent)fail(res,error,500);else res.end();}});
if(resolve(process.argv[1]??'')===fileURLToPath(import.meta.url))server.listen(port,()=>console.log(`Wellnot Order Profit Management: http://localhost:${port}`));
