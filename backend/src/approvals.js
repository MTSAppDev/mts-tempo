import { Project, Task } from './models.js';
import { totalHours } from './time.js';
// Edit audit events store full added/removed rows only up to this many; beyond it, counts and totals only.
const MAX_DIFF_ROWS = 100;
const plainEntry = e => ({ date: e.date, project: String(e.project), task: String(e.task), description: e.description, hours: e.hours });
// Builds the immutable record of exactly what was approved. Names are copied so later renames/archives never alter it.
export async function approvalSnapshot(sheet, approver, { approvedAt = new Date(), migrated = false } = {}) {
  const projectIds = [...new Set(sheet.entries.map(e => String(e.project)))], taskIds = [...new Set(sheet.entries.map(e => String(e.task)))];
  const [projects, tasks] = await Promise.all([
    Project.find({ _id: { $in: projectIds } }).select('name client').populate('client', 'name').lean(),
    Task.find({ _id: { $in: taskIds } }).select('name').lean(),
  ]);
  const projectMap = new Map(projects.map(p => [String(p._id), p])), taskMap = new Map(tasks.map(t => [String(t._id), t]));
  return {
    revision: sheet.revision,
    entries: sheet.entries.map(e => {
      const project = projectMap.get(String(e.project));
      return { entryId: e._id, date: e.date, project: e.project, projectName: project?.name ?? 'Unknown project', client: project?.client?._id, clientName: project?.client?.name, task: e.task, taskName: taskMap.get(String(e.task))?.name ?? 'Unknown task', description: e.description, hours: e.hours };
    }),
    totalHours: totalHours(sheet.entries), entryCount: sheet.entries.length,
    approvedBy: approver._id, approvedByName: approver.name, approvedAt,
    submittedAt: sheet.submittedAt, late: sheet.late, ...(migrated ? { migrated: true } : {}),
  };
}
// Multiset difference of entries by content. A changed row appears as one removal plus one addition.
export function entryChanges(before, after) {
  const key = e => JSON.stringify(plainEntry(e));
  const diff = (from, against) => { const pool = new Map(); for (const e of against) pool.set(key(e), (pool.get(key(e)) || 0) + 1); const out = []; for (const e of from) { const k = key(e); if (pool.get(k)) pool.set(k, pool.get(k) - 1); else out.push(plainEntry(e)); } return out; };
  const added = diff(after, before), removed = diff(before, after);
  const summary = { totalBefore: totalHours(before), totalAfter: totalHours(after), addedCount: added.length, removedCount: removed.length };
  return added.length + removed.length > MAX_DIFF_ROWS ? { ...summary, truncated: true } : { ...summary, added, removed };
}
export const describeChanges = c => `${c.totalBefore} → ${c.totalAfter} hrs · ${c.addedCount} added, ${c.removedCount} removed`;
