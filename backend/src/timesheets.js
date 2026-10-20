import { Router } from 'express';
import { Timesheet, Project, Task } from './models.js';
import { z, id, version, entry, weekString, parse, pageQuery } from './validation.js';
import { asyncRoute as wrap, roles, fail } from './security.js';
import { requireVersion } from './catalog.js';
import { addDays, deadline, totalHours, currentWeek, TIMEZONE } from './time.js';
import { approvalSnapshot, entryChanges, describeChanges } from './approvals.js';
const statuses = z.enum(['Draft', 'Submitted', 'Rejected', 'Approved']);
export function sheetView(sheet) { return { ...sheet.toObject(), totalHours: totalHours(sheet.entries), lastApprovedRevision: sheet.lastApproved?.revision ?? null, deadline: deadline(sheet.weekStart), timezone: TIMEZONE, weeklyMinimum: 40 }; }
async function getSheet(req, ownerOnly = false) {
  const sheet = await Timesheet.findById(parse(id, req.params.id));
  if (!sheet || ((ownerOnly || req.user.role === 'User') && !sheet.user.equals(req.user._id))) fail(404, 'Timesheet not found');
  return sheet;
}
async function validateEntries(entries, week, user) {
  if (entries.some(e => e.date < week || e.date > addDays(week, 6))) fail(400, 'Entries must be within the selected week');
  const projectIds = [...new Set(entries.map(e => String(e.project)))], taskIds = [...new Set(entries.map(e => String(e.task)))];
  const projectFilter = { _id: { $in: projectIds }, active: true };
  if (user.role === 'User') projectFilter.members = user._id;
  const [projects, tasks] = await Promise.all([Project.countDocuments(projectFilter), Task.countDocuments({ _id: { $in: taskIds }, active: true })]);
  if (projects !== projectIds.length) fail(400, 'Entries must use active projects you can access');
  if (tasks !== taskIds.length) fail(400, 'Entries must use active shared tasks');
}
export function timesheetRouter() {
  const r = Router();
  r.get('/', wrap(async (req, res) => {
    const q = parse(pageQuery.extend({ userId: id.optional(), status: statuses.optional(), weekStart: weekString.optional() }), req.query);
    if (req.user.role === 'User' && q.userId && q.userId !== String(req.user._id)) fail(403, 'Only your own timesheets are available');
    const filter = {}; if (req.user.role === 'User') filter.user = req.user._id; else if (q.userId) filter.user = q.userId;
    if (q.status) filter.status = q.status; if (q.weekStart) filter.weekStart = q.weekStart;
    const [items, total] = await Promise.all([Timesheet.find(filter).sort({ weekStart: -1, _id: -1 }).skip((q.page - 1) * q.limit).limit(q.limit), Timesheet.countDocuments(filter)]);
    res.json({ items: items.map(sheetView), total, page: q.page, limit: q.limit });
  }));
  r.get('/current', wrap(async (req, res) => { const weekStart = currentWeek(); const sheet = await Timesheet.findOne({ user: req.user._id, weekStart }); res.json({ weekStart, timezone: TIMEZONE, sheet: sheet ? sheetView(sheet) : null }); }));
  r.post('/', wrap(async (req, res) => {
    const body = parse(z.object({ weekStart: weekString, entries: z.array(entry).max(1000).default([]) }).strict(), req.body);
    await validateEntries(body.entries, body.weekStart, req.user);
    const sheet = await Timesheet.create({ ...body, user: req.user._id, history: [{ action: 'created', actor: req.user._id, revision: 1, changes: entryChanges([], body.entries) }] });
    res.status(201).json(sheetView(sheet));
  }));
  r.get('/:id', wrap(async (req, res) => res.json(sheetView(await getSheet(req)))));
  r.put('/:id', wrap(async (req, res) => {
    const body = parse(z.object({ version, entries: z.array(entry).max(1000) }).strict(), req.body);
    const sheet = await getSheet(req, true); requireVersion(sheet, body.version);
    if (!['Draft', 'Rejected'].includes(sheet.status)) fail(409, 'Only draft or rejected timesheets can be edited');
    await validateEntries(body.entries, sheet.weekStart, req.user);
    const changes = entryChanges(sheet.entries, body.entries); sheet.entries = body.entries;
    sheet.history.push({ action: 'edited', actor: req.user._id, revision: sheet.revision, changes, detail: describeChanges(changes) }); await sheet.save(); res.json(sheetView(sheet));
  }));
  r.post('/:id/submit', wrap(async (req, res) => {
    const { version: v } = parse(z.object({ version }).strict(), req.body); const sheet = await getSheet(req, true); requireVersion(sheet, v);
    if (!['Draft', 'Rejected'].includes(sheet.status)) fail(409, 'Only draft or rejected timesheets can be submitted');
    await validateEntries(sheet.entries, sheet.weekStart, req.user);
    if (totalHours(sheet.entries) < 40) fail(400, 'At least 40 hours are required to submit');
    sheet.status = 'Submitted'; sheet.submittedAt = new Date(); sheet.late = sheet.submittedAt >= deadline(sheet.weekStart); sheet.reviewedAt = undefined; sheet.reviewedBy = undefined; sheet.rejectionReason = undefined;
    sheet.history.push({ action: 'submitted', actor: req.user._id, revision: sheet.revision, detail: sheet.late ? 'Late submission (IST Sunday deadline)' : 'On time' }); await sheet.save(); res.json(sheetView(sheet));
  }));
  for (const action of ['approve', 'reject', 'reopen']) {
    r.post(`/:id/${action}`, roles(...(action === 'reopen' ? ['Admin'] : ['Admin', 'Manager'])), wrap(async (req, res) => {
      const body = parse(z.object({ version, ...(action === 'approve' ? {} : { reason: z.string().trim().min(1).max(2000) }) }).strict(), req.body);
      const sheet = await getSheet(req); requireVersion(sheet, body.version);
      if (sheet.status !== (action === 'reopen' ? 'Approved' : 'Submitted')) fail(409, `Cannot ${action} a ${sheet.status} timesheet`);
      let detail = body.reason, changes;
      if (action === 'approve') {
        // Snapshot, status and audit event are written by the single versioned update in sheet.save().
        sheet.status = 'Approved'; sheet.reviewedAt = new Date(); sheet.reviewedBy = req.user._id; sheet.rejectionReason = undefined;
        const snapshot = await approvalSnapshot(sheet, req.user, { approvedAt: sheet.reviewedAt });
        sheet.approvals.push(snapshot); sheet.lastApproved = snapshot;
        detail = `Revision ${sheet.revision} approved · ${snapshot.totalHours} hrs`;
      } else if (action === 'reject') {
        sheet.status = 'Rejected'; sheet.reviewedAt = new Date(); sheet.reviewedBy = req.user._id; sheet.rejectionReason = body.reason;
      } else {
        if (sheet.lastApproved?.revision !== sheet.revision) fail(409, 'This approval has no stored snapshot. Run npm run migrate:approvals before reopening.');
        // Earlier approvals stay untouched; editing continues on a new revision that starts as a copy of the approved entries.
        changes = { fromRevision: sheet.revision }; sheet.revision += 1;
        sheet.status = 'Draft'; sheet.reviewedAt = undefined; sheet.reviewedBy = undefined; sheet.rejectionReason = undefined;
      }
      sheet.history.push({ action: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'reopened', actor: req.user._id, revision: sheet.revision, detail, ...(changes ? { changes } : {}) });
      await sheet.save(); res.json(sheetView(sheet));
    }));
  }
  return r;
}
