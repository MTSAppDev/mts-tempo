import { Router } from 'express';
import { User, Timesheet } from './models.js';
import { z, id, weekString, parse } from './validation.js';
import { asyncRoute as wrap, fail } from './security.js';
import { addDays, currentWeek, deadline, TIMEZONE } from './time.js';
// Derived indicators, never stored: for each week whose Sunday IST deadline has passed and each user expected that week,
//  Missing = no timesheet exists; Overdue = a timesheet exists but is still Draft/Rejected and has never been approved.
// A user is expected for a week only when the whole Monday–Sunday week lies within [trackingStart, trackingEnd].
// Reopened sheets (which have an approved revision) are corrections, not overdue submissions.
const MAX_WEEKS = 53;
const query = z.object({ from: weekString.optional(), to: weekString.optional(), userId: id.optional(), indicator: z.enum(['Missing', 'Overdue']).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50) }).strict();
export const expectedFor = (user, week) => !!user.trackingStart && user.trackingStart <= week && (!user.trackingEnd || user.trackingEnd >= addDays(week, 6));
export function complianceRouter() {
  const r = Router();
  r.get('/', wrap(async (req, res) => {
    const q = parse(query, req.query);
    if (req.user.role === 'User' && q.userId && q.userId !== String(req.user._id)) fail(403, 'Only your own timesheets are available');
    if (q.from && q.to && q.from > q.to) fail(400, 'from must be on or before to');
    const lastDue = addDays(currentWeek(), -7); // the most recent week whose deadline has passed
    const to = q.to && q.to < lastDue ? q.to : lastDue, from = q.from ?? addDays(to, -7 * 11);
    const weeks = []; for (let w = from; w <= to; w = addDays(w, 7)) weeks.push(w);
    if (weeks.length > MAX_WEEKS) fail(400, `Choose at most ${MAX_WEEKS} weeks`);
    const empty = { from, to, items: [], total: 0, counts: { missing: 0, overdue: 0 }, page: q.page, limit: q.limit, timezone: TIMEZONE };
    if (!weeks.length) return res.json(empty);
    const userFilter = { trackingStart: { $type: 'string', $lte: to }, $or: [{ trackingEnd: { $exists: false } }, { trackingEnd: null }, { trackingEnd: { $gte: addDays(from, 6) } }] };
    if (req.user.role === 'User') userFilter._id = req.user._id; else if (q.userId) userFilter._id = q.userId;
    const users = await User.find(userFilter).select('name role disabled trackingStart trackingEnd').sort({ name: 1, _id: 1 }).lean();
    if (!users.length) return res.json(empty);
    const sheets = await Timesheet.find({ user: { $in: users.map(u => u._id) }, weekStart: { $gte: from, $lte: to } }).select('user weekStart status lastApproved.revision').lean();
    const byKey = new Map(sheets.map(s => [`${s.user}|${s.weekStart}`, s]));
    const all = [];
    for (const week of [...weeks].reverse()) for (const u of users) {
      if (!expectedFor(u, week)) continue;
      const sheet = byKey.get(`${u._id}|${week}`), base = { userId: String(u._id), userName: u.name, role: u.role, disabled: u.disabled, weekStart: week, deadline: deadline(week) };
      if (!sheet) all.push({ ...base, indicator: 'Missing' });
      else if (['Draft', 'Rejected'].includes(sheet.status) && !sheet.lastApproved?.revision) all.push({ ...base, indicator: 'Overdue', sheetId: String(sheet._id), status: sheet.status });
    }
    const counts = { missing: all.filter(i => i.indicator === 'Missing').length, overdue: all.filter(i => i.indicator === 'Overdue').length };
    const filtered = q.indicator ? all.filter(i => i.indicator === q.indicator) : all;
    res.json({ ...empty, items: filtered.slice((q.page - 1) * q.limit, q.page * q.limit), total: filtered.length, counts });
  }));
  return r;
}
