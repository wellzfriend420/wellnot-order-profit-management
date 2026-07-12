export const PROCESS_STATUS = Object.freeze({ not_started: '○', in_progress: '△', completed: '●' });

export function progressView(processes) {
  const ordered = [...processes].sort((a, b) => a.sequence - b.sequence);
  const current = ordered.find((p) => p.status === 'in_progress')
    ?? ordered.find((p) => p.status === 'not_started')
    ?? ordered.at(-1) ?? null;
  return {
    currentProcess: current?.name ?? '工程未設定',
    remaining: ordered.filter((p) => p.status !== 'completed').length,
    steps: ordered.map((p) => ({ abbreviation: p.abbreviation, symbol: PROCESS_STATUS[p.status] }))
  };
}

export function projectShouldComplete(processes) {
  return processes.length > 0 && processes.every((process) => process.status === 'completed');
}

export function assertDeadlineChange(oldDate, newDate, reason) {
  if (oldDate !== newDate && !String(reason ?? '').trim()) throw new Error('納期変更理由は必須です');
}

export function assertEditable(project, { allowImprovement = false } = {}) {
  if (project.deleted_at) throw new Error('削除済み案件は編集できません');
  if (project.locked_at && !allowImprovement) throw new Error('完了案件はロックされています');
}

export function calculateProfit({ budgetItems, actualCosts, confirmedHours, hourlyRate = 0 }) {
  const budget = budgetItems.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const material = actualCosts.filter((row) => row.category === 'material').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const outsourcing = actualCosts.filter((row) => row.category === 'outsourcing').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const labor = Number(confirmedHours || 0) * Number(hourlyRate || 0);
  const actual = material + outsourcing + labor;
  const variance = budget - actual;
  return { budget, material, outsourcing, confirmedHours, labor, actual, variance, grossMarginRate: budget ? variance / budget : null };
}

export function exportGrouping(start, end) {
  const from = new Date(`${start}T00:00:00Z`);
  const to = new Date(`${end}T00:00:00Z`);
  if (!Number.isFinite(from.valueOf()) || !Number.isFinite(to.valueOf()) || to < from) throw new Error('対象期間が不正です');
  const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth() + 1;
  return months === 1 ? 'single_month' : months <= 3 ? 'monthly_sheets' : 'combined_period';
}

export function employeeProject(project) {
  const { budget_items, actual_costs, estimate_actual_items, variance_by_category, profit, confirmed_hours, ...safe } = project;
  return safe;
}
