export const TIMEZONE = 'Asia/Kolkata';
export const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
export const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const isMonday = s => validDate(s) && new Date(s + 'T00:00:00Z').getUTCDay() === 1;
export const istToday = (now = new Date()) => new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
export const currentWeek = (now = new Date()) => { const s = istToday(now); return addDays(s, -((new Date(s).getUTCDay() + 6) % 7)); };
export const deadline = week => new Date(addDays(week, 7) + 'T00:00:00+05:30');
export const totalHours = entries => Math.round(entries.reduce((sum, e) => sum + e.hours, 0) * 100) / 100;
export function reportRange(period = 'this-week', start, end, now = new Date()) {
  const today = istToday(now), week = currentWeek(now);
  if (period === 'this-week') return { start: week, end: addDays(week, 6) };
  if (period === 'last-week') return { start: addDays(week, -7), end: addDays(week, -1) };
  if (period === 'this-month' || period === 'last-month') { const d = new Date(today.slice(0, 7) + '-01T00:00:00Z'); if (period === 'last-month') d.setUTCMonth(d.getUTCMonth() - 1); const from = d.toISOString().slice(0, 10); d.setUTCMonth(d.getUTCMonth() + 1); return { start: from, end: addDays(d.toISOString().slice(0, 10), -1) }; }
  if (period !== 'custom' || !validDate(start) || !validDate(end) || start > end) throw Object.assign(new Error('Provide a valid period or an ordered custom start/end date range'), { status: 400 });
  return { start, end };
}
