import { Router } from 'express';
import mongoose from 'mongoose';
import { Timesheet } from './models.js';
import { z, id, parse } from './validation.js';
import { asyncRoute as wrap, fail } from './security.js';
import { reportRange, addDays, TIMEZONE } from './time.js';
// basis=approved (default): each sheet's latest immutable approved revision; reopened sheets keep reporting it until re-approved.
// basis=working: the current editable entries of every sheet, any status, clearly labelled as unapproved where applicable.
const query = z.object({ basis: z.enum(['approved', 'working']).default('approved'), period: z.enum(['this-week', 'last-week', 'this-month', 'last-month', 'custom']).default('this-week'), start: z.string().optional(), end: z.string().optional(), userId: id.optional(), projectId: id.optional(), status: z.enum(['Draft', 'Submitted', 'Rejected', 'Approved']).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
const nameLookup = (from, local, as) => ({ $lookup: { from, localField: local, foreignField: '_id', as, pipeline: [{ $project: { name: 1 } }] } });
function pipeline(req, q) {
  if (req.user.role === 'User' && q.userId && q.userId !== String(req.user._id)) fail(403, 'Only your own reports are available');
  if (q.basis === 'approved' && q.status) fail(400, 'Status filters apply only to basis=working. Approved reports always use the latest approved revision.');
  const range = reportRange(q.period, q.start, q.end), scope = { weekStart: { $gte: addDays(range.start, -6), $lte: range.end } };
  if (req.user.role === 'User') scope.user = req.user._id; else if (q.userId) scope.user = new mongoose.Types.ObjectId(q.userId);
  const rowFilter = { 'entries.date': { $gte: range.start, $lte: range.end } };
  if (q.projectId) rowFilter['entries.project'] = new mongoose.Types.ObjectId(q.projectId);
  if (q.basis === 'approved') return { range, scope, rowFilter, stages: [
    { $match: { ...scope, 'lastApproved.revision': { $exists: true } } },
    { $project: { user: 1, status: { $literal: 'Approved' }, late: '$lastApproved.late', revision: '$lastApproved.revision', approvedAt: '$lastApproved.approvedAt', entries: '$lastApproved.entries' } },
    { $unwind: '$entries' }, { $match: rowFilter },
  ] };
  return { range, scope, rowFilter, stages: [
    { $match: { ...scope, ...(q.status ? { status: q.status } : {}) } },
    { $project: { user: 1, status: 1, late: 1, revision: 1, entries: 1 } },
    { $unwind: '$entries' }, { $match: rowFilter },
    nameLookup('projects', 'entries.project', '_project'), nameLookup('tasks', 'entries.task', '_task'),
    { $set: { 'entries.projectName': { $arrayElemAt: ['$_project.name', 0] }, 'entries.taskName': { $arrayElemAt: ['$_task.name', 0] } } }, { $unset: ['_project', '_task'] },
  ] };
}
const rows = [
  nameLookup('users', 'user', 'person'),
  { $project: { _id: 0, sheetId: '$_id', entryId: { $ifNull: ['$entries.entryId', '$entries._id'] }, date: '$entries.date', userId: '$user', userName: { $arrayElemAt: ['$person.name', 0] }, projectId: '$entries.project', projectName: '$entries.projectName', taskId: '$entries.task', taskName: '$entries.taskName', description: '$entries.description', hours: '$entries.hours', status: 1, late: 1, revision: 1, approvedAt: 1 } },
];
const sum = { hours: { $sum: '$entries.hours' }, entries: { $sum: 1 } };
// Working entries of sheets that are not currently Approved, by status. Reported separately; never added to approved totals.
const statusOrder = { Submitted: 0, Rejected: 1, Draft: 2 };
async function unapprovedSummary(scope, rowFilter) {
  const byStatus = await Timesheet.aggregate([
    { $match: { ...scope, status: { $ne: 'Approved' } } }, { $project: { status: 1, entries: 1 } }, { $unwind: '$entries' }, { $match: rowFilter },
    { $group: { _id: '$status', ...sum, sheets: { $addToSet: '$_id' } } }, { $project: { hours: { $round: ['$hours', 2] }, entries: 1, sheets: { $size: '$sheets' } } },
  ]);
  byStatus.sort((a, b) => statusOrder[a._id] - statusOrder[b._id]);
  return { totals: { hours: Math.round(byStatus.reduce((t, s) => t + s.hours, 0) * 100) / 100, entries: byStatus.reduce((t, s) => t + s.entries, 0), sheets: byStatus.reduce((t, s) => t + s.sheets, 0) }, byStatus };
}
const finish = [{ $set: { hours: { $round: ['$hours', 2] } } }, { $sort: { hours: -1, _id: 1 } }];
const group = field => [{ $group: { _id: field, ...sum } }, ...finish];
const groupWithName = (field, nameField) => [{ $group: { _id: field, name: { $last: nameField }, ...sum } }, ...finish];
const userGroup = [...group('$user'), nameLookup('users', '_id', 'record'), { $set: { name: { $arrayElemAt: ['$record.name', 0] } } }, { $unset: 'record' }];
function csvCell(value) { let s = String(value ?? ''); if (/^[\s]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s; return '"' + s.replaceAll('"', '""') + '"'; }
export function reportRouter() {
  const r = Router();
  r.get('/', wrap(async (req, res) => {
    const q = parse(query, req.query), { range, scope, rowFilter, stages } = pipeline(req, q);
    const [[result], awaitingApproval, underCorrection, unapproved] = await Promise.all([
      Timesheet.aggregate([...stages, { $facet: {
        totals: [{ $group: { _id: null, ...sum } }, { $project: { _id: 0, hours: { $round: ['$hours', 2] }, entries: 1 } }],
        byProject: groupWithName('$entries.project', '$entries.projectName'), byTask: groupWithName('$entries.task', '$entries.taskName'), byUser: userGroup, byStatus: group('$status'), byDate: group('$entries.date'),
        items: [{ $sort: { 'entries.date': 1, _id: 1, 'entries.entryId': 1, 'entries._id': 1 } }, { $skip: (q.page - 1) * q.limit }, { $limit: q.limit }, ...rows],
      } }]),
      Timesheet.countDocuments({ ...scope, status: 'Submitted' }),
      // Reopened or re-reviewed sheets whose latest approved revision is still what approved reports show.
      Timesheet.countDocuments({ ...scope, status: { $ne: 'Approved' }, 'lastApproved.revision': { $exists: true } }),
      q.basis === 'approved' ? unapprovedSummary(scope, rowFilter) : null,
    ]);
    res.json({ ...result, totals: result.totals[0] || { hours: 0, entries: 0 }, basis: q.basis, pending: { awaitingApproval, underCorrection }, ...(unapproved ? { unapproved } : {}), range, timezone: TIMEZONE, page: q.page, limit: q.limit });
  }));
  r.get('/export', wrap(async (req, res) => {
    const q = parse(query, req.query), { stages } = pipeline(req, q);
    const cursor = Timesheet.aggregate([...stages, { $sort: { 'entries.date': 1, _id: 1, 'entries.entryId': 1, 'entries._id': 1 } }, ...rows]).cursor({ batchSize: 200 });
    res.type('text/csv').attachment(`tempo-${q.basis}-timesheet-report.csv`);
    res.write(['Date', 'User', 'Project', 'Task', 'Description', 'Hours', 'Status', 'Late', 'Revision', 'Approved at', 'Basis'].map(csvCell).join(',') + '\r\n');
    const basis = q.basis === 'approved' ? 'Approved revision' : 'Working copy';
    try { for await (const row of cursor) { if (res.destroyed) break; const ok = res.write([row.date, row.userName, row.projectName, row.taskName, row.description, row.hours, row.status, row.late, row.revision, row.approvedAt?.toISOString?.() ?? '', basis].map(csvCell).join(',') + '\r\n'); if (!ok) await new Promise(resolve => { const done = () => { res.off('drain', done); res.off('close', done); resolve(); }; res.once('drain', done); res.once('close', done); }); } } finally { await cursor.close(); }
    res.end();
  }));
  return r;
}
