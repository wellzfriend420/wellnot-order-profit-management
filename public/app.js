const app = document.querySelector('#app');
const nav = document.querySelector('#nav');
const account = document.querySelector('#account');
let me = null;
let masters = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const money = (value) => Number(value ?? 0).toLocaleString('ja-JP');
const status = (value) => ({ planned:'予定', in_progress:'進行中', completed:'完了', not_started:'未着手' }[value] ?? value);

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'content-type':'application/json', ...(options.headers ?? {}) } });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? '処理に失敗しました');
  return data;
}

async function init() {
  try {
    me = (await api('/api/me')).user;
    authenticated();
    show('orders');
  } catch {
    document.querySelector('#login').addEventListener('submit', login);
  }
}

async function login(event) {
  event.preventDefault();
  try {
    me = (await api('/api/login', { method:'POST', body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) })).user;
    authenticated();
    show('orders');
  } catch (error) {
    document.querySelector('#login-error').textContent = error.message;
  }
}

function authenticated() {
  nav.hidden = false;
  document.querySelectorAll('[data-admin]').forEach((element) => { element.hidden = me.role !== 'admin'; });
  account.innerHTML = `<span>${esc(me.display_name)}（${me.role === 'admin' ? '管理者' : '従業員'}）</span><button id="logout">ログアウト</button>`;
  document.querySelector('#logout').onclick = async () => { await api('/api/logout', { method:'POST' }); location.reload(); };
  nav.onclick = (event) => {
    const target = event.target.closest('[data-view]');
    if (target) show(target.dataset.view);
  };
}

async function show(view, arg) {
  app.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    if (view === 'orders') return orders(false);
    if (view === 'completed') return orders(true);
    if (view === 'calendar') return calendarView();
    if (view === 'profit') return profitManagement();
    if (view === 'new') return newProject();
    if (view === 'exports') return exportView();
    if (view === 'masters') return masterView();
    if (view === 'detail') return detail(arg);
  } catch (error) {
    app.innerHTML = `<div class="card error">${esc(error.message)}</div>`;
  }
}

async function loadMasters() {
  masters ??= await api('/api/masters');
  return masters;
}

function progress(progressValue) {
  return `<div class="progress">${progressValue.steps.map((step) => `<span class="progress-step"><b>${esc(step.abbreviation)}</b><span>${step.symbol}</span></span>`).join('')}</div>`;
}

async function orders(completed) {
  const data = await api(`/api/projects?completed=${completed ? 1 : 0}`);
  const actionLabel = completed ? (me.role === 'admin' ? 'ロック管理' : '参照') : (me.role === 'admin' ? '編集' : '工程編集');
  app.innerHTML = `<section class="card orders-view">
    <div class="toolbar"><h1>${completed ? '完了案件' : '受注工事一覧'}</h1><button class="no-print" id="print">PDF / 印刷</button></div>
    <p class="print-only">出力日時: ${new Date().toLocaleString('ja-JP')}</p>
    <table class="orders-table"><thead><tr><th>工番</th><th>客先</th><th>工事名</th><th>納期</th><th>状態</th><th>現在工程</th><th>残工程</th><th>工程進捗</th><th class="no-print">操作</th></tr></thead><tbody>
      ${data.projects.map((project) => `<tr><td><a class="job-link" href="#" data-id="${project.id}">${esc(project.job_number)}</a></td><td>${esc(project.customer_name)}</td><td>${esc(project.construction_name)}</td><td>${esc(project.due_date)}</td><td><span class="status">${status(project.status)}</span></td><td>${esc(project.progress.currentProcess)}</td><td>${project.progress.remaining}</td><td>${progress(project.progress)}</td><td class="no-print"><button data-id="${project.id}">${actionLabel}</button></td></tr>`).join('') || '<tr><td colspan="9">該当案件はありません</td></tr>'}
    </tbody></table>
    <div class="order-cards">${data.projects.map((project) => `<article class="order-card"><div class="order-card-head"><a class="job-link" href="#" data-id="${project.id}">${esc(project.job_number)}</a><span class="status">${status(project.status)}</span></div><h2>${esc(project.construction_name)}</h2><dl><div><dt>客先</dt><dd>${esc(project.customer_name)}</dd></div><div><dt>納期</dt><dd>${esc(project.due_date)}</dd></div><div><dt>現在工程</dt><dd>${esc(project.progress.currentProcess)}</dd></div><div><dt>残工程</dt><dd>${project.progress.remaining}</dd></div></dl>${progress(project.progress)}<div class="card-actions no-print"><button data-id="${project.id}">詳細</button><button data-id="${project.id}">${actionLabel}</button></div></article>`).join('') || '<p>該当案件はありません</p>'}</div>
  </section>`;
  app.onclick = openProjectFromDataId;
  document.querySelector('#print').onclick = () => print();
}

async function newProject() {
  const m = await loadMasters();
  const employeeOptions = `<option value="">未定</option>${m.employees.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}`;
  app.innerHTML = `<section class="card"><div class="toolbar"><h1>案件登録</h1></div>
    <form id="project-form">
      <div class="field-grid">
        <label>工番<input name="job_number" required></label>
        <label>客先<select name="customer_id" required><option value="">選択</option>${m.customers.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
        <label>正式工事名<input name="construction_name" required></label>
        <label>工事略名<input name="short_name" placeholder="カレンダー表示用"></label>
        <label>税込受注総額<input name="contract_total_tax_included" type="number" min="0" value="0"></label>
        <label>開始日<input name="start_date" type="date"></label>
        <label>材料発注日<input name="material_order_date" type="date"></label>
        <label>材料納入日<input name="material_delivery_date" type="date"></label>
        <label>納期<input name="due_date" type="date" required></label>
        <label>図面番号管理<select name="drawing_management"><option value="">OFF</option><option value="1">ON（大型案件）</option></select></label>
      </div>
      <label>現場注意事項<div class="check-grid">${m.cautions.map((x) => `<label><input type="checkbox" name="caution_ids" value="${x.id}">${esc(x.name)}</label>`).join('')}</div></label>
      <label>特記事項<textarea name="special_notes"></textarea></label>
      <label>現場注意事項（自由記入）<textarea name="site_notes"></textarea></label>
      <fieldset><legend>使用工程・予定・担当者（任意）</legend><div class="process-list">${m.processes.map((x) => `<label class="process-row process-row-wide"><input type="checkbox" data-process="${x.id}"><b>${esc(x.name)}</b><input type="date" data-start="${x.id}" aria-label="開始予定"><input type="date" data-end="${x.id}" aria-label="完了予定"><select data-employee="${x.id}" aria-label="担当者">${employeeOptions}</select></label>`).join('')}</div></fieldset>
      <button class="primary">登録</button><p class="error" id="form-error"></p>
    </form></section>`;
  document.querySelector('#project-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = Object.fromEntries(form);
    input.caution_ids = form.getAll('caution_ids').map(Number);
    input.drawing_management = Boolean(input.drawing_management);
    input.processes = [...document.querySelectorAll('[data-process]:checked')].map((element) => ({
      process_master_id: Number(element.dataset.process),
      planned_start_date: document.querySelector(`[data-start="${element.dataset.process}"]`).value,
      planned_end_date: document.querySelector(`[data-end="${element.dataset.process}"]`).value,
      employee_id: document.querySelector(`[data-employee="${element.dataset.process}"]`).value || null,
    }));
    try {
      const result = await api('/api/projects', { method:'POST', body:JSON.stringify(input) });
      show('detail', result.id);
    } catch (error) {
      document.querySelector('#form-error').textContent = error.message;
    }
  };
}

async function detail(id) {
  const project = (await api(`/api/projects/${id}`)).project;
  if (me.role === 'admin') await loadMasters();
  app.innerHTML = `<section class="card a4-report">
    <div class="toolbar"><h1>${esc(project.job_number)}　${esc(project.construction_name)}</h1><button id="print">工程票 PDF / 印刷</button>${!project.locked_at ? `<button id="edit">${me.role === 'admin' ? '編集' : '工程編集'}</button>` : ''}${me.role === 'admin' && project.locked_at ? '<button id="unlock">ロック解除</button>' : ''}${me.role === 'admin' ? '<button id="delete" class="danger">削除</button>' : ''}</div>
    <div class="summary-grid"><div><small>客先</small>${esc(project.customer_name)}</div><div><small>工事略名</small>${esc(project.short_name || '—')}</div><div><small>税込受注総額</small>¥${money(project.contract_total_tax_included)}</div><div><small>納期</small>${esc(project.due_date)}</div><div><small>現在工程</small>${esc(project.progress.currentProcess)}</div></div>
    <div class="two-col"><div><h2>工程管理</h2><div class="process-list">${project.processes.map((x) => `<div class="process-row ${x.status}"><span>${esc(x.abbreviation)}</span><b>${esc(x.name)}</b><span>${esc(x.planned_start_date ?? '')} ～ ${esc(x.planned_end_date ?? '')}${x.employee_name ? `<br>担当: ${esc(x.employee_name)}` : ''}<br>${x.work_memos.map(memoDisplay).join('<br>')}</span><span class="print-only">${({ not_started:'○ 未着手', in_progress:'△ 進行中', completed:'● 完了' })[x.status]}</span><select data-process-status="${x.id}" ${project.locked_at ? 'disabled' : ''}><option value="not_started" ${x.status === 'not_started' ? 'selected' : ''}>○ 未着手</option><option value="in_progress" ${x.status === 'in_progress' ? 'selected' : ''}>△ 進行中</option><option value="completed" ${x.status === 'completed' ? 'selected' : ''}>● 完了</option></select></div>`).join('')}</div>${!project.locked_at ? memoForm(project) : ''}</div>
    <aside><h2>現場注意事項</h2><ul>${project.cautions.map((x) => `<li>${esc(x.name)}</li>`).join('')}</ul><p>${esc(project.site_notes).replaceAll('\n', '<br>')}</p><h2>特記事項</h2><p>${esc(project.special_notes).replaceAll('\n', '<br>')}</p></aside></div>
    ${me.role === 'admin' ? profitPanel(project) + billingPanel(project) + adminProjectTools(project) : ''}
  </section>`;
  wireDetail(project);
}

function memoDisplay(memo) {
  return `${esc(memo.memo)}${me.role === 'admin' && memo.hours != null ? ` (${memo.hours}h${memo.confirmed ? '・集計済' : ''})` : ''}${me.role === 'admin' ? ` <button class="no-print" data-confirm-memo="${memo.id}" data-memo="${esc(memo.memo)}" data-hours="${memo.hours ?? ''}">工数確定</button>` : ''}`;
}

function memoForm(project) {
  return `<form id="memo-form" class="no-print"><h3>実績メモ</h3><div class="field-grid"><label>工程<select name="process_id">${project.processes.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label><label>日付<input name="work_date" type="date"></label>${me.role === 'admin' ? '<label>時間（管理者確定用）<input name="hours" type="number" min="0" step="0.25"></label><label><span>集計へ反映</span><input name="confirmed" type="checkbox" value="1"></label>' : ''}</div><label>自由記入<textarea name="memo" placeholder="7/1 3h&#10;材料待ち" required></textarea></label><button>メモ追加</button></form>`;
}

function profitPanel(project) {
  const masterList = masters?.estimate_items ?? [];
  return `<section class="no-print"><hr><h2>見積・実績・利益（管理者のみ）</h2>
    <div class="summary-grid"><div><small>見積原価</small>¥${money(project.profit.budget)}</div><div><small>実績原価</small>¥${money(project.profit.actual)}</div><div><small>見積粗利</small>¥${money(Number(project.contract_total_tax_included || 0) - Number(project.profit.budget || 0))}</div><div><small>実績粗利</small>¥${money(Number(project.contract_total_tax_included || 0) - Number(project.profit.actual || 0))}</div></div>
    <h3>予実比較</h3><div class="table-scroll"><table><thead><tr><th>大分類</th><th>項目</th><th colspan="4">見積</th><th colspan="4">実績</th><th>差異</th></tr><tr><th></th><th></th><th>数量</th><th>単位</th><th>単価</th><th>金額</th><th>数量</th><th>単位</th><th>単価</th><th>金額</th><th></th></tr></thead><tbody>${project.estimate_actual_items.map((x) => `<tr><td>${esc(x.category)}</td><td>${esc(x.label)}</td><td>${x.budget_quantity ?? ''}</td><td>${esc(x.budget_unit)}</td><td>¥${money(x.budget_unit_price)}</td><td>¥${money(x.budget_amount)}</td><td>${x.actual_quantity ?? ''}</td><td>${esc(x.actual_unit)}</td><td>¥${money(x.actual_unit_price)}</td><td>¥${money(x.actual_amount)}</td><td>¥${money(Number(x.budget_amount) - Number(x.actual_amount))}</td></tr>`).join('') || '<tr><td colspan="11">見積・実績項目はありません</td></tr>'}</tbody></table></div>
    <h3>大分類ごとの差異</h3><div class="table-scroll"><table><thead><tr><th>大分類</th><th>見積</th><th>実績</th><th>差異</th></tr></thead><tbody>${project.variance_by_category.map((x) => `<tr><td>${esc(x.category)}</td><td>¥${money(x.budget)}</td><td>¥${money(x.actual)}</td><td>¥${money(x.variance)}</td></tr>`).join('') || '<tr><td colspan="4">集計対象はありません</td></tr>'}</tbody></table></div>
    ${!project.locked_at ? `<form id="estimate-actual-form"><h3>見積・実績項目を追加</h3><div class="field-grid"><label>見積項目マスタ<select name="master_id" required><option value="">選択</option>${masterList.map((x) => `<option value="${x.id}" data-category="${esc(x.category)}" data-name="${esc(x.name)}" data-unit="${esc(x.unit)}" data-price="${x.standard_unit_price}">${esc(x.category)} / ${esc(x.name)}</option>`).join('')}</select></label><label>見積数量<input name="budget_quantity" type="number" step="0.01"></label><label>見積単位<input name="budget_unit"></label><label>見積単価<input name="budget_unit_price" type="number" step="0.01"></label><label>見積金額<input name="budget_amount" type="number" placeholder="未入力なら数量×単価"></label><label>実績数量<input name="actual_quantity" type="number" step="0.01"></label><label>実績単位<input name="actual_unit"></label><label>実績単価<input name="actual_unit_price" type="number" step="0.01"></label><label>実績金額<input name="actual_amount" type="number" placeholder="未入力なら数量×単価"></label></div><button>追加</button></form>` : ''}
  </section>`;
}

function billingPanel(project) {
  return `<section class="no-print"><hr><h2>請求予定・入金予定</h2><div class="table-scroll"><table><thead><tr><th>内容</th><th>金額</th><th>請求対象月</th><th>入金予定月</th><th>計算</th><th>操作</th></tr></thead><tbody>${project.billing_schedules.map((x) => `<tr><td>${esc(x.label)}</td><td>¥${money(x.amount)}</td><td>${esc(x.billing_month)}</td><td>${esc(x.expected_payment_month)}</td><td>${x.auto_calculated ? '自動' : '手動'}</td><td><button data-edit-billing="${x.id}" data-amount="${x.amount}" data-billing="${esc(x.billing_month)}" data-payment="${esc(x.expected_payment_month)}">変更</button></td></tr>`).join('') || '<tr><td colspan="6">請求予定はありません</td></tr>'}</tbody></table></div>
  <form id="billing-form" class="field-grid"><label>内容<input name="label" value="出来高"></label><label>金額<input name="amount" type="number" required></label><label>請求対象月<input name="billing_month" type="month" required></label><label>入金予定月<input name="expected_payment_month" type="month" required></label><button>出来高請求を追加</button></form></section>`;
}

function adminProjectTools(project) {
  const drawing = project.drawing_management ? `<hr><div class="two-col no-print"><form id="drawing-form"><h3>図面番号を追加</h3><label>図面番号<input name="drawing_number" required></label><label>名称<input name="title"></label><button>追加</button></form><form id="assign-drawing"><h3>工程へ図面を割当</h3><label>工程<select name="process_id">${project.processes.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label><label>図面<select name="drawing_id"><option value="">割当なし</option>${project.drawings.map((x) => `<option value="${x.id}">${esc(x.drawing_number)} ${esc(x.title)}</option>`).join('')}</select></label><button>割当</button></form></div>` : '';
  const improvement = project.status === 'completed' ? `<hr><div class="no-print"><h2>改善メモ</h2><ul>${project.improvement_memos.map((x) => `<li>${esc(x.memo)}</li>`).join('')}</ul><form id="improvement-form"><label>次回見積へ活かす内容<textarea name="memo" required></textarea></label><button>追加</button></form></div>` : '';
  return drawing + improvement;
}

function wireDetail(project) {
  document.querySelector('#print').onclick = () => print();
  document.querySelectorAll('[data-process-status]').forEach((select) => {
    select.onchange = async () => { await api(`/api/processes/${select.dataset.processStatus}`, { method:'PATCH', body:JSON.stringify({ status:select.value }) }); show('detail', project.id); };
  });
  document.querySelectorAll('[data-confirm-memo]').forEach((button) => button.onclick = async () => { const hours = prompt('集計する工数（時間）', button.dataset.hours); if (hours !== null) { await api(`/api/work-memos/${button.dataset.confirmMemo}`, { method:'PATCH', body:JSON.stringify({ memo:button.dataset.memo, hours, confirmed:true }) }); show('detail', project.id); } });
  document.querySelector('#memo-form')?.addEventListener('submit', async (event) => { event.preventDefault(); const input = Object.fromEntries(new FormData(event.currentTarget)); const processId = input.process_id; delete input.process_id; await api(`/api/processes/${processId}/memos`, { method:'POST', body:JSON.stringify(input) }); show('detail', project.id); });
  document.querySelector('#estimate-actual-form')?.addEventListener('submit', async (event) => { event.preventDefault(); const input = Object.fromEntries(new FormData(event.currentTarget)); const option = event.currentTarget.querySelector(`[value="${input.master_id}"]`); if (option) { input.category = option.dataset.category; input.label = option.dataset.name; input.budget_unit ||= option.dataset.unit; input.actual_unit ||= option.dataset.unit; input.budget_unit_price ||= option.dataset.price; } await api(`/api/projects/${project.id}/estimate-actual-items`, { method:'POST', body:JSON.stringify(input) }); show('detail', project.id); });
  document.querySelector('#billing-form')?.addEventListener('submit', async (event) => { event.preventDefault(); await api(`/api/projects/${project.id}/billing-schedules`, { method:'POST', body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); show('detail', project.id); });
  document.querySelector('#drawing-form')?.addEventListener('submit', async (event) => { event.preventDefault(); await api(`/api/projects/${project.id}/drawings`, { method:'POST', body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); show('detail', project.id); });
  document.querySelector('#assign-drawing')?.addEventListener('submit', async (event) => { event.preventDefault(); const input = Object.fromEntries(new FormData(event.currentTarget)); await api(`/api/processes/${input.process_id}/drawing`, { method:'PATCH', body:JSON.stringify({ drawing_id:input.drawing_id ? Number(input.drawing_id) : null }) }); show('detail', project.id); });
  document.querySelector('#improvement-form')?.addEventListener('submit', async (event) => { event.preventDefault(); await api(`/api/projects/${project.id}/improvements`, { method:'POST', body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); show('detail', project.id); });
  document.querySelectorAll('[data-edit-billing]').forEach((button) => button.onclick = async () => { const amount = prompt('金額', button.dataset.amount); if (amount === null) return; const billing = prompt('請求対象月 YYYY-MM', button.dataset.billing); if (!billing) return; const payment = prompt('入金予定月 YYYY-MM', button.dataset.payment); if (!payment) return; await api(`/api/billing-schedules/${button.dataset.editBilling}`, { method:'PATCH', body:JSON.stringify({ amount, billing_month:billing, expected_payment_month:payment }) }); show('detail', project.id); });
  document.querySelector('#edit')?.addEventListener('click', () => me.role === 'admin' ? editProject(project) : document.querySelector('[data-process-status]')?.focus());
  document.querySelector('#unlock')?.addEventListener('click', async () => { const reason = prompt('ロック解除理由を入力してください'); if (reason) { await api(`/api/projects/${project.id}/unlock`, { method:'POST', body:JSON.stringify({ reason }) }); show('detail', project.id); } });
  document.querySelector('#delete')?.addEventListener('click', async () => { if (confirm(`工番 ${project.job_number} を削除しますか？`)) { await api(`/api/projects/${project.id}`, { method:'DELETE' }); show('orders'); } });
}

function editProject(project) {
  app.innerHTML = `<section class="card"><h1>案件編集</h1><form id="edit-form"><div class="field-grid"><label>正式工事名<input name="construction_name" value="${esc(project.construction_name)}" required></label><label>工事略名<input name="short_name" value="${esc(project.short_name ?? '')}"></label><label>税込受注総額<input name="contract_total_tax_included" type="number" value="${project.contract_total_tax_included ?? 0}"></label><label>開始日<input name="start_date" type="date" value="${esc(project.start_date ?? '')}"></label><label>材料発注日<input name="material_order_date" type="date" value="${esc(project.material_order_date ?? '')}"></label><label>材料納入日<input name="material_delivery_date" type="date" value="${esc(project.material_delivery_date ?? '')}"></label><label>納期<input name="due_date" type="date" value="${esc(project.due_date)}" required></label><label>納期変更理由<input name="deadline_change_reason" placeholder="納期を変える場合は必須"></label></div><label>特記事項<textarea name="special_notes">${esc(project.special_notes)}</textarea></label><label>現場注意事項<textarea name="site_notes">${esc(project.site_notes)}</textarea></label><button class="primary">保存</button><p class="error" id="form-error"></p></form></section>`;
  document.querySelector('#edit-form').onsubmit = async (event) => { event.preventDefault(); const input = Object.fromEntries(new FormData(event.currentTarget)); input.version = project.version; try { await api(`/api/projects/${project.id}`, { method:'PATCH', body:JSON.stringify(input) }); show('detail', project.id); } catch (error) { document.querySelector('#form-error').textContent = error.message; } };
}

async function calendarView(offset = 0, mode = 'project') {
  const first = new Date(); first.setHours(0,0,0,0); first.setDate(1); first.setMonth(first.getMonth() + offset);
  const end = new Date(first); end.setMonth(end.getMonth() + 2); end.setDate(0);
  const iso = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const bars = (await api(`/api/calendar?start=${iso(first)}&end=${iso(end)}`)).bars;
  if (mode === 'staff') await loadMasters();
  const months = [new Date(first), new Date(first.getFullYear(), first.getMonth() + 1, 1)];
  app.innerHTML = `<section class="card calendar-page"><div class="toolbar"><h1>カレンダー</h1><button id="prev">前月</button><button id="next">翌月</button><button id="print">PDF / 印刷</button><span>${first.getFullYear()}年${first.getMonth()+1}月〜${end.getFullYear()}年${end.getMonth()+1}月</span></div><div class="view-tabs"><button class="${mode === 'project' ? 'primary' : ''}" id="project-tab">工事予定</button><button class="${mode === 'staff' ? 'primary' : ''}" id="staff-tab">人員予定</button></div><div class="calendar-stack">${months.map((month) => monthCalendar(month, bars, mode)).join('')}</div></section>`;
  document.querySelector('#prev').onclick = () => calendarView(offset - 1, mode);
  document.querySelector('#next').onclick = () => calendarView(offset + 1, mode);
  document.querySelector('#print').onclick = () => print();
  document.querySelector('#project-tab').onclick = () => calendarView(offset, 'project');
  document.querySelector('#staff-tab').onclick = () => calendarView(offset, 'staff');
  app.onclick = openProjectFromDataId;
}

function monthCalendar(month, bars, mode) {
  const addDays = (date, count) => { const copy = new Date(date); copy.setDate(copy.getDate() + count); return copy; };
  const dayNumber = (date) => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  const parse = (value) => { const [y,m,d] = String(value).split('-').map(Number); return new Date(y, m - 1, d); };
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const gridStart = addDays(monthStart, -((monthStart.getDay() + 6) % 7));
  const weekNames = ['月','火','水','木','金','土','日'];
  const weeks = [];
  for (let cursor = new Date(gridStart); cursor <= monthEnd || cursor.getDay() !== 1; cursor = addDays(cursor, 7)) {
    const days = Array.from({ length:7 }, (_, index) => addDays(cursor, index));
    const weekBars = [];
    for (const bar of bars) {
      const start = Math.max(dayNumber(parse(bar.start)), dayNumber(days[0]), dayNumber(monthStart));
      const finish = Math.min(dayNumber(parse(bar.end)), dayNumber(days[6]), dayNumber(monthEnd));
      if (start > finish) continue;
      weekBars.push({ ...bar, startIndex:start - dayNumber(days[0]), span:finish - start + 1, displayName:bar.short_name || bar.construction_name });
    }
    const lanes = [];
    weekBars.sort((a,b) => a.startIndex - b.startIndex || String(a.job_number).localeCompare(String(b.job_number), 'ja')).forEach((bar) => {
      let lane = lanes.findIndex((end) => end < bar.startIndex);
      if (lane < 0) { lane = lanes.length; lanes.push(-1); }
      bar.lane = lane;
      lanes[lane] = bar.startIndex + bar.span - 1;
    });
    weeks.push({ days, bars:weekBars, lanes:Math.max(1, lanes.length) });
  }
  const label = (bar) => mode === 'staff'
    ? `${esc(bar.displayName)}${!bar.is_placeholder && bar.process_name ? ` ${esc(bar.process_name)}` : ''}`
    : esc(bar.displayName);
  return `<section class="month-board"><h2>${month.getFullYear()}年${month.getMonth()+1}月</h2><div class="month-board-weekdays">${weekNames.map((name) => `<div>${name}</div>`).join('')}</div>${weeks.map((week) => `<div class="month-board-week" style="--lanes:${week.lanes}">${week.days.map((day) => `<div class="month-board-day ${day.getMonth() === month.getMonth() ? '' : 'outside'}"><b>${day.getDate()}</b></div>`).join('')}<div class="month-board-bars">${week.bars.map((bar) => `<a href="#" data-id="${bar.project_id}" class="month-board-bar ${bar.is_placeholder ? 'placeholder' : ''}" style="grid-column:${bar.startIndex + 1}/span ${bar.span};grid-row:${bar.lane + 1};${mode === 'staff' ? `--bar:${esc(bar.employee_color || '#667085')}` : ''}" title="${label(bar)}">${label(bar)}</a>`).join('')}</div></div>`).join('')}</section>`;
}

async function profitManagement() {
  const today = new Date().toISOString().slice(0, 7);
  app.innerHTML = `<section class="card"><div class="toolbar"><h1>予実管理</h1><label>期間<input id="pm-month" type="month" value="${today}"></label><label>表示<select id="pm-period"><option value="month">月</option><option value="fiscal">会計年度累計</option></select></label><button id="pm-load">再集計</button></div><div id="pm-content"></div></section>`;
  const load = async () => {
    const data = await api(`/api/profit-management?month=${document.querySelector('#pm-month').value}&period=${document.querySelector('#pm-period').value}`);
    document.querySelector('#pm-content').innerHTML = renderProfitManagement(data);
  };
  document.querySelector('#pm-load').onclick = load;
  await load();
}

function renderProfitManagement(data) {
  const s = data.summary;
  return `<div class="summary-grid"><div><small>税込受注総額</small>¥${money(s.contract)}</div><div><small>見積原価</small>¥${money(s.budget)}</div><div><small>実績原価</small>¥${money(s.actual)}</div><div><small>見積粗利</small>¥${money(s.budgetProfit)}</div><div><small>実績粗利</small>¥${money(s.actualProfit)}</div><div><small>利益差</small>¥${money(s.profitDiff)}</div><div><small>粗利率</small>${s.grossMarginRate == null ? '—' : (s.grossMarginRate * 100).toFixed(1) + '%'}</div></div>
  <h2>大分類比較</h2><div class="table-scroll"><table><thead><tr><th>大分類</th><th>見積</th><th>実績</th><th>差異</th></tr></thead><tbody>${data.categories.map((x) => `<tr><td>${esc(x.category)}</td><td>¥${money(x.budget)}</td><td>¥${money(x.actual)}</td><td>¥${money(x.variance)}</td></tr>`).join('') || '<tr><td colspan="4">対象データはありません</td></tr>'}</tbody></table></div>
  <h2>詳細（取引先・項目粒度）</h2><div class="table-scroll"><table><thead><tr><th>大分類</th><th>項目/取引先</th><th>見積</th><th>実績</th><th>差異</th></tr></thead><tbody>${data.details.map((x) => `<tr><td>${esc(x.category)}</td><td>${esc(x.label)}</td><td>¥${money(x.budget)}</td><td>¥${money(x.actual)}</td><td>¥${money(x.variance)}</td></tr>`).join('') || '<tr><td colspan="5">対象データはありません</td></tr>'}</tbody></table></div>
  <h2>取引先別</h2><div class="table-scroll"><table><thead><tr><th>取引先</th><th>税込受注総額</th><th>見積原価</th><th>実績原価</th></tr></thead><tbody>${data.customers.map((x) => `<tr><td>${esc(x.name)}</td><td>¥${money(x.contract)}</td><td>¥${money(x.budget)}</td><td>¥${money(x.actual)}</td></tr>`).join('') || '<tr><td colspan="4">対象データはありません</td></tr>'}</tbody></table></div>
  <h2>工事別</h2><div class="table-scroll"><table><thead><tr><th>工番</th><th>工事名</th><th>取引先</th><th>税込受注総額</th><th>見積原価</th><th>実績原価</th></tr></thead><tbody>${data.projects.map((x) => `<tr><td>${esc(x.job_number)}</td><td>${esc(x.short_name || x.construction_name)}</td><td>${esc(x.customer_name)}</td><td>¥${money(x.contract_total_tax_included)}</td><td>¥${money(x.budget_cost)}</td><td>¥${money(x.actual_cost)}</td></tr>`).join('') || '<tr><td colspan="6">対象データはありません</td></tr>'}</tbody></table></div>`;
}

async function masterView() {
  const m = await api('/api/masters');
  masters = m;
  app.innerHTML = `<section class="card"><div class="toolbar"><h1>マスタ管理</h1></div><div class="two-col"><div>
    <h2>従業員マスタ</h2><ul>${m.employees.map((x) => `<li><span class="color-chip" style="background:${esc(x.color)}"></span>${esc(x.name)}（${esc(x.abbreviation)}） <button data-employee-edit="${x.id}" data-name="${esc(x.name)}" data-abbr="${esc(x.abbreviation)}" data-color="${esc(x.color)}">編集</button></li>`).join('')}</ul>
    <form id="employee-master" class="field-grid"><label>氏名<input name="name" required></label><label>略称<input name="abbreviation" maxlength="4"></label><label>表示カラー<input name="color" type="color" value="#2f6fa3"></label><button>追加</button></form>
    <h2>工程マスタ</h2><table>${m.processes.map((x) => `<tr><td>${esc(x.abbreviation)}</td><td>${esc(x.name)}</td><td><button data-master-type="processes" data-master-id="${x.id}" data-master-name="${esc(x.name)}" data-master-abbreviation="${esc(x.abbreviation)}">編集</button></td></tr>`).join('')}</table>
    <form id="process-master"><label>工程名<input name="name" required></label><label>略称<input name="abbreviation" maxlength="2" required></label><button>追加</button></form>
    <h2>見積項目マスタ</h2><div class="table-scroll"><table><thead><tr><th>大分類</th><th>項目</th><th>単位</th><th>標準単価</th></tr></thead><tbody>${m.estimate_items.map((x) => `<tr><td>${esc(x.category)}</td><td>${esc(x.name)}</td><td>${esc(x.unit)}</td><td>${money(x.standard_unit_price)}</td></tr>`).join('')}</tbody></table></div>
    <form id="estimate-master" class="field-grid"><label>大分類<input name="category" required></label><label>項目名<input name="name" required></label><label>単位<input name="unit"></label><label>標準単価<input name="standard_unit_price" type="number" step="0.01"></label><button>追加</button></form>
  </div><div>
    <h2>客先マスタ</h2><ul>${m.customers.map((x) => `<li>${esc(x.name)} <small>締日:${x.closing_day} / ${x.payment_month_offset}か月後入金</small> <button data-customer-terms="${x.id}" data-closing="${x.closing_day}" data-offset="${x.payment_month_offset}" data-payday="${x.payment_day}">条件</button></li>`).join('')}</ul>
    <form id="customer"><label>客先名<input name="name" required></label><label>締日<input name="closing_day" type="number" min="1" max="31" value="31"></label><label>入金月<input name="payment_month_offset" type="number" min="0" value="1"></label><label>入金日<input name="payment_day" type="number" min="1" max="31" value="31"></label><button>追加</button></form>
    <h2>現場注意事項マスタ</h2><ul>${m.cautions.map((x) => `<li>${esc(x.name)} <button data-master-type="cautions" data-master-id="${x.id}" data-master-name="${esc(x.name)}">編集</button></li>`).join('')}</ul><form id="caution-master"><label>注意事項<input name="name" required></label><button>追加</button></form>
  </div></div></section>`;
  const submit = (selector, path) => document.querySelector(selector).onsubmit = async (event) => { event.preventDefault(); await api(path, { method:'POST', body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); masters = null; masterView(); };
  submit('#customer', '/api/masters/customers');
  submit('#process-master', '/api/masters/processes');
  submit('#caution-master', '/api/masters/cautions');
  submit('#estimate-master', '/api/masters/estimate-items');
  submit('#employee-master', '/api/masters/employees');
  document.querySelectorAll('[data-employee-edit]').forEach((button) => button.onclick = async () => { const name = prompt('氏名', button.dataset.name); if (!name) return; const abbreviation = prompt('略称', button.dataset.abbr) ?? ''; const color = prompt('色', button.dataset.color) ?? button.dataset.color; await api(`/api/masters/employees/${button.dataset.employeeEdit}`, { method:'PATCH', body:JSON.stringify({ name, abbreviation, color }) }); masters = null; masterView(); });
  document.querySelectorAll('[data-customer-terms]').forEach((button) => button.onclick = async () => { const closing_day = prompt('締日', button.dataset.closing); if (!closing_day) return; const payment_month_offset = prompt('何か月後入金', button.dataset.offset); if (payment_month_offset == null) return; const payment_day = prompt('入金日', button.dataset.payday); if (!payment_day) return; await api(`/api/masters/customers/${button.dataset.customerTerms}/terms`, { method:'PATCH', body:JSON.stringify({ closing_day, payment_month_offset, payment_day }) }); masters = null; masterView(); });
}

async function exportView() {
  const history = (await api('/api/exports/history')).history;
  app.innerHTML = `<section class="card"><div class="toolbar"><h1>Excel出力</h1><button onclick="history.back()">戻る</button></div><p>出力後もこの画面へ戻れます。必要ならブラウザの戻る、または上の戻るボタンを使ってください。</p><form id="excel-form" class="field-grid"><label>開始日<input name="start" type="date" required></label><label>終了日<input name="end" type="date" required></label><button class="primary">Excel出力</button></form><h2>出力履歴</h2><table><thead><tr><th>日時</th><th>出力者</th><th>対象期間</th><th>形式</th></tr></thead><tbody>${history.map((x) => `<tr><td>${esc(new Date(x.exported_at).toLocaleString('ja-JP'))}</td><td>${esc(x.exported_by_name)}</td><td>${esc(x.period_start)} ～ ${esc(x.period_end)}</td><td>${esc(x.export_type)}</td></tr>`).join('') || '<tr><td colspan="4">出力履歴はありません</td></tr>'}</tbody></table></section>`;
  document.querySelector('#excel-form').onsubmit = (event) => { event.preventDefault(); const input = Object.fromEntries(new FormData(event.currentTarget)); if (input.end < input.start) { alert('終了日は開始日以降にしてください'); return; } location.href = `/api/exports/excel?start=${encodeURIComponent(input.start)}&end=${encodeURIComponent(input.end)}`; setTimeout(() => exportView(), 700); };
}

function openProjectFromDataId(event) {
  const link = event.target.closest('[data-id]');
  if (link) {
    event.preventDefault();
    show('detail', link.dataset.id);
  }
}

init();
