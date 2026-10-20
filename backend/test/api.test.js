import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { User, Session, Timesheet } from '../src/models.js';
import { hashPassword, digest } from '../src/security.js';
import { currentWeek, deadline, reportRange, validDate, istToday } from '../src/time.js';
import { bootstrapAdmin } from '../src/bootstrap.js';

let server, base, admin, manager, worker, other, client, project, task, sheet;
const secret = 'Integration-test-password-42!';
const dbName = `tempo_test_${process.pid}_${Date.now()}`;
function actor() { return { cookie: '', csrf: '' }; }
async function request(who, method, path, body, expected = 200, extra = {}) {
  const response = await fetch(base + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(who?.cookie ? { Cookie: who.cookie, 'X-CSRF-Token': who.csrf } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  assert.equal(response.status, expected, `${method} ${path}: ${text}`);
  if (who && response.headers.get('set-cookie')) who.cookie = response.headers.get('set-cookie').split(';')[0];
  if (who && data.csrfToken) who.csrf = data.csrfToken;
  return data;
}
async function login(email) { const who = actor(); const result = await request(who, 'POST', '/auth/login', { email, password: secret }); who.user = result.user; return who; }
before(async () => {
  // Every run owns a uniquely named disposable database; never drop the configured app database.
  const uri = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017';
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
  await Promise.all(Object.values(mongoose.models).map(m => m.init()));
  const passwordHash = await hashPassword(secret);
  const initialAdmin = await bootstrapAdmin({ name: 'Admin', email: 'admin@test.local', password: secret }); assert.equal(initialAdmin.passwordHash, undefined);
  await User.create([{ name: 'Manager', email: 'manager@test.local', role: 'Manager', passwordHash, active: true }, { name: 'Worker', email: 'worker@test.local', role: 'User', passwordHash, active: true }, { name: 'Other', email: 'other@test.local', role: 'User', passwordHash, active: true }]);
  server = createApp().listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}/api`;
  admin = await login('admin@test.local'); manager = await login('manager@test.local'); worker = await login('worker@test.local'); other = await login('other@test.local');
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (mongoose.connection.name === dbName && dbName.startsWith('tempo_test_')) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
test('backend integration workflows', async t => {
  await t.test('bootstrap cannot create another initial administrator', async () => {
    await assert.rejects(bootstrapAdmin({ name: 'Intruder', email: 'intruder@test.local', password: secret }), /already exists/);
  });
  await t.test('health, authentication, CSRF and origin checks', async () => {
    assert.equal((await request(null, 'GET', '/health')).database, 'connected');
    await request(null, 'GET', '/users', undefined, 401);
    await request(worker, 'GET', '/users', undefined, 403);
    await request(admin, 'POST', '/tasks', { name: 'Blocked' }, 403, { 'X-CSRF-Token': 'wrong' });
    await request(admin, 'GET', '/auth/me', undefined, 403, { Origin: 'https://untrusted.example' });
    await request(null, 'POST', '/auth/login', { email: 'admin@test.local', password: 'wrong' }, 401);
    await request(null, 'POST', '/auth/login', { email: { $ne: null }, password: secret }, 400);
    assert.equal((await request(worker, 'GET', '/auth/me')).user.role, 'User');
  });
  await t.test('catalog permissions and assignments', async () => {
    await request(manager, 'POST', '/clients', { name: 'Denied' }, 403);
    client = await request(admin, 'POST', '/clients', { name: 'Client One' }, 201);
    task = await request(manager, 'POST', '/tasks', { name: 'Development' }, 201);
    project = await request(manager, 'POST', '/projects', { name: 'Project One', client: client._id, members: [worker.user.id, manager.user.id] }, 201);
    await request(worker, 'POST', '/projects', { name: 'Denied', client: client._id }, 403);
    assert.equal((await request(other, 'GET', '/projects')).total, 0);
    await request(other, 'GET', `/projects/${project._id}`, undefined, 404);
    const list = await request(worker, 'GET', '/projects'); assert.equal(list.total, 1); assert.equal(list.items[0].members, undefined); assert.equal(list.items[0].history, undefined);
    assert.equal((await request(other, 'GET', '/tasks')).total, 1);
    assert.equal((await request(manager, 'GET', '/users')).total, 4);
    await request(admin, 'PATCH', `/projects/${project._id}`, { version: 99, name: 'Stale' }, 409);
  });
  await t.test('invitations: no email, optional password change, replay and expiry', async () => {
    await request(manager, 'POST', '/users', { name: 'No', email: 'no@test.local', role: 'User' }, 403);
    const invited = await request(admin, 'POST', '/users', { name: 'Invited', email: 'invite@test.local', role: 'User' }, 201);
    assert.equal(invited.invitation.emailSent, false); assert.equal(invited.user.passwordHash, undefined);
    const invitedActor = actor();
    await request(invitedActor, 'POST', '/auth/login', { email: invited.user.email, password: invited.invitation.temporaryPassword }, 401);
    await request(invitedActor, 'POST', '/auth/accept-invitation', { token: invited.invitation.token, temporaryPassword: 'wrong' }, 400);
    await request(invitedActor, 'POST', '/auth/accept-invitation', { token: invited.invitation.token, temporaryPassword: invited.invitation.temporaryPassword });
    await request(invitedActor, 'GET', '/projects');
    await request(null, 'POST', '/auth/accept-invitation', { token: invited.invitation.token, temporaryPassword: invited.invitation.temporaryPassword }, 400);
    await request(actor(), 'POST', '/auth/login', { email: invited.user.email, password: invited.invitation.temporaryPassword });
    const expired = await request(admin, 'POST', '/users', { name: 'Expired', email: 'expired@test.local', role: 'User' }, 201);
    await User.updateOne({ _id: expired.user.id }, { invitationExpiresAt: new Date(0) });
    await request(null, 'POST', '/auth/accept-invitation', { token: expired.invitation.token, temporaryPassword: expired.invitation.temporaryPassword }, 400);
    const renewed = await request(admin, 'POST', `/users/${expired.user.id}/invitation`, {});
    assert.notEqual(renewed.invitation.token, expired.invitation.token);
    await request(null, 'POST', '/auth/accept-invitation', { token: expired.invitation.token, temporaryPassword: expired.invitation.temporaryPassword }, 400);
    await request(null, 'POST', '/auth/accept-invitation', { token: renewed.invitation.token, temporaryPassword: renewed.invitation.temporaryPassword });
  });
  const entries = hours => [{ date: '2026-01-26', project: project._id, task: task._id, description: 'Implementation', hours }];
  await t.test('time entry validation, ownership and minimum 40-hour submission', async () => {
    await request(worker, 'POST', '/timesheets', { weekStart: '2026-01-27' }, 400);
    await request(worker, 'POST', '/timesheets', { weekStart: '2026-01-26', entries: [{ ...entries(1)[0], date: '2026-02-30' }] }, 400);
    await request(worker, 'POST', '/timesheets', { weekStart: '2026-01-26', entries: [{ ...entries(1)[0], date: '2026-02-02' }] }, 400);
    await request(other, 'POST', '/timesheets', { weekStart: '2026-01-26', entries: entries(40) }, 400);
    sheet = await request(worker, 'POST', '/timesheets', { weekStart: '2026-01-26', entries: entries(39.99) }, 201);
    await request(worker, 'POST', `/timesheets/${sheet._id}/submit`, { version: sheet.__v }, 400);
    await request(worker, 'POST', '/timesheets', { weekStart: '2026-01-26', entries: [] }, 409);
    await request(other, 'GET', `/timesheets/${sheet._id}`, undefined, 404);
    await request(other, 'GET', `/timesheets?userId=${worker.user.id}`, undefined, 403);
    await request(admin, 'PUT', `/timesheets/${sheet._id}`, { version: sheet.__v, entries: entries(40) }, 404);
    await request(worker, 'PUT', `/timesheets/${sheet._id}`, { version: sheet.__v, entries: entries(-1) }, 400);
    sheet = await request(worker, 'PUT', `/timesheets/${sheet._id}`, { version: sheet.__v, entries: [...entries(40), { ...entries(2)[0], description: 'Second task row', date: '2026-02-01' }] });
    assert.equal(sheet.totalHours, 42); // More than 24 in one day is allowed.
    await request(worker, 'PUT', `/timesheets/${sheet._id}`, { version: 0, entries: entries(50) }, 409);
    sheet = await request(worker, 'POST', `/timesheets/${sheet._id}/submit`, { version: sheet.__v });
    assert.equal(sheet.status, 'Submitted'); assert.equal(sheet.late, true);
    await request(worker, 'PUT', `/timesheets/${sheet._id}`, { version: sheet.__v, entries: entries(43) }, 409);
  });
  await t.test('review, rejection, resubmission and Admin-only reopening', async () => {
    await request(worker, 'POST', `/timesheets/${sheet._id}/approve`, { version: sheet.__v }, 403);
    await request(manager, 'POST', `/timesheets/${sheet._id}/reject`, { version: sheet.__v, reason: ' ' }, 400);
    sheet = await request(manager, 'POST', `/timesheets/${sheet._id}/reject`, { version: sheet.__v, reason: 'Clarify work' }); assert.equal(sheet.status, 'Rejected');
    sheet = await request(worker, 'POST', `/timesheets/${sheet._id}/submit`, { version: sheet.__v });
    const previousVersion = sheet.__v;
    sheet = await request(manager, 'POST', `/timesheets/${sheet._id}/approve`, { version: previousVersion });
    await request(admin, 'POST', `/timesheets/${sheet._id}/reject`, { version: previousVersion, reason: 'Concurrent review' }, 409);
    await request(manager, 'POST', `/timesheets/${sheet._id}/reopen`, { version: sheet.__v, reason: 'Fix' }, 403);
    sheet = await request(admin, 'POST', `/timesheets/${sheet._id}/reopen`, { version: sheet.__v, reason: 'Correct entry' }); assert.equal(sheet.status, 'Draft');
    assert.ok(sheet.history.some(h => h.action === 'reopened' && h.detail === 'Correct entry'));
    sheet = await request(worker, 'POST', `/timesheets/${sheet._id}/submit`, { version: sheet.__v });
    sheet = await request(admin, 'POST', `/timesheets/${sheet._id}/approve`, { version: sheet.__v });
  });
  await t.test('approval revisions are immutable and survive reopening', async () => {
    assert.equal(sheet.revision, 2); assert.deepEqual(sheet.approvals.map(a => a.revision), [1, 2]); assert.equal(sheet.lastApproved.revision, 2);
    assert.equal(sheet.lastApproved.totalHours, 42); assert.equal(sheet.lastApproved.entries[0].projectName, 'Project One'); assert.equal(sheet.lastApproved.approvedByName, 'Admin');
    const firstApprovals = JSON.stringify(sheet.approvals);
    sheet = await request(admin, 'POST', `/timesheets/${sheet._id}/reopen`, { version: sheet.__v, reason: 'Second correction' });
    assert.equal(sheet.status, 'Draft'); assert.equal(sheet.revision, 3); assert.equal(sheet.lastApproved.revision, 2);
    const original = sheet.entries.map(({ date, project, task, description, hours }) => ({ date, project, task, description, hours }));
    sheet = await request(worker, 'PUT', `/timesheets/${sheet._id}`, { version: sheet.__v, entries: [{ ...original[0], hours: 45 }, original[1]] });
    const edit = sheet.history.at(-1); assert.equal(edit.action, 'edited'); assert.equal(edit.revision, 3);
    assert.equal(edit.changes.totalBefore, 42); assert.equal(edit.changes.totalAfter, 47); assert.equal(edit.changes.added[0].hours, 45); assert.equal(edit.changes.removed[0].hours, 40);
    // Reports keep showing the approved revision until the correction is approved.
    const approved = await request(worker, 'GET', '/reports?period=custom&start=2026-01-01&end=2026-01-31');
    assert.equal(approved.basis, 'approved'); assert.equal(approved.totals.hours, 40); assert.equal(approved.items[0].revision, 2); assert.equal(approved.pending.underCorrection, 1);
    assert.equal((await request(worker, 'GET', '/reports?basis=working&period=custom&start=2026-01-01&end=2026-01-31')).totals.hours, 45);
    assert.equal(approved.unapproved.totals.hours, 45); assert.deepEqual(approved.unapproved.byStatus.map(x => [x._id, x.hours, x.sheets]), [['Draft', 45, 1]]);
    await request(worker, 'GET', '/reports?status=Draft&period=this-week', undefined, 400);
    assert.match(await request(worker, 'GET', '/reports/export?period=custom&start=2026-01-01&end=2026-01-31'), /"Approved revision"/);
    // Direct tampering is refused at the model layer.
    await assert.rejects(Timesheet.updateOne({ _id: sheet._id }, { $set: { 'approvals.0.totalHours': 1 } }), /immutable/);
    await assert.rejects(Timesheet.deleteOne({ _id: sheet._id }), /immutable/);
    const stored = await Timesheet.findById(sheet._id); stored.approvals[0].entries[0].hours = 1; await assert.rejects(stored.save(), /immutable/);
    // Restore the original entries and approve revision 3; revisions 1 and 2 are unchanged.
    sheet = await request(worker, 'PUT', `/timesheets/${sheet._id}`, { version: sheet.__v, entries: original });
    sheet = await request(worker, 'POST', `/timesheets/${sheet._id}/submit`, { version: sheet.__v });
    sheet = await request(manager, 'POST', `/timesheets/${sheet._id}/approve`, { version: sheet.__v });
    assert.deepEqual(sheet.approvals.map(a => a.revision), [1, 2, 3]); assert.equal(JSON.stringify(sheet.approvals.slice(0, 2)), firstApprovals);
    assert.equal(sheet.lastApproved.revision, 3); assert.equal(sheet.lastApproved.approvedByName, 'Manager');
    assert.equal((await request(worker, 'GET', '/reports?period=custom&start=2026-01-01&end=2026-01-31')).items[0].revision, 3);
  });
  await t.test('managers may approve their own sheets', async () => {
    let own = await request(manager, 'POST', '/timesheets', { weekStart: '2026-01-26', entries: entries(40) }, 201);
    own = await request(manager, 'POST', `/timesheets/${own._id}/submit`, { version: own.__v });
    own = await request(manager, 'POST', `/timesheets/${own._id}/approve`, { version: own.__v }); assert.equal(own.status, 'Approved');
  });
  await t.test('reports apply date boundaries, owner scope and CSV escaping', async () => {
    const jan = await request(worker, 'GET', '/reports?period=custom&start=2026-01-01&end=2026-01-31'); assert.equal(jan.totals.hours, 40); assert.equal(jan.unapproved.totals.hours, 0);
    const feb = await request(worker, 'GET', '/reports?period=custom&start=2026-02-01&end=2026-02-28'); assert.equal(feb.totals.hours, 2);
    const all = await request(manager, 'GET', '/reports?period=custom&start=2026-01-01&end=2026-02-28'); assert.equal(all.totals.hours, 82);
    const own = await request(other, 'GET', '/reports?period=custom&start=2026-01-01&end=2026-02-28'); assert.equal(own.totals.hours, 0);
    await request(worker, 'GET', `/reports?userId=${manager.user.id}`, undefined, 403);
    await request(worker, 'GET', '/reports?period=custom&start=2026-02-01&end=2026-01-01', undefined, 400);
    await request(worker, 'GET', '/reports?period=custom&start=2026-02-30&end=2026-03-01', undefined, 400);
    for (const period of ['this-week', 'last-week', 'this-month', 'last-month']) await request(worker, 'GET', `/reports?period=${period}`);
    await request(other, 'POST', '/timesheets', { weekStart: '2026-02-02', entries: [] }, 201);
    const csv = await request(worker, 'GET', '/reports/export?period=custom&start=2026-01-01&end=2026-02-28'); assert.match(csv, /Implementation/); assert.doesNotMatch(csv, /Manager/);
    let evil = await request(worker, 'POST', '/timesheets', { weekStart: '2026-02-02', entries: [{ ...entries(40)[0], date: '2026-02-02', description: '=HYPERLINK("bad")' }] }, 201);
    const escaped = await request(worker, 'GET', '/reports/export?basis=working&period=custom&start=2026-02-02&end=2026-02-02'); assert.ok(escaped.includes("'=HYPERLINK"));
    assert.equal(evil.status, 'Draft');
  });
  await t.test('assignment removal is rechecked on submission', async () => {
    const removed = await request(manager, 'PATCH', `/projects/${project._id}`, { version: project.__v, members: [manager.user.id] }); project = removed;
    const draft = (await request(worker, 'GET', '/timesheets?weekStart=2026-02-02')).items[0];
    await request(worker, 'POST', `/timesheets/${draft._id}/submit`, { version: draft.__v }, 400);
    assert.equal((await request(worker, 'GET', '/projects')).total, 0);
    assert.equal((await request(worker, 'GET', '/reports?period=custom&start=2026-01-01&end=2026-01-31')).totals.hours, 40);
  });
  await t.test('missing and overdue indicators follow tracking dates and the IST deadline', async () => {
    let record = (await request(admin, 'GET', `/users/${worker.user.id}`)).user;
    await request(admin, 'PATCH', `/users/${worker.user.id}`, { version: record.version, trackingStart: '2026-02-15', trackingEnd: '2026-02-01' }, 400);
    // Starts Wednesday 21 Jan: week of 19 Jan is partial, so not expected. Ends Sunday 15 Feb: week of 9 Feb is the last expected.
    record = (await request(admin, 'PATCH', `/users/${worker.user.id}`, { version: record.version, trackingStart: '2026-01-21', trackingEnd: '2026-02-15' })).user;
    assert.equal(record.trackingStart, '2026-01-21');
    const range = 'from=2026-01-12&to=2026-02-23';
    const forWorker = await request(manager, 'GET', `/compliance?${range}&userId=${worker.user.id}`);
    // 26 Jan is approved; 2 Feb has only a Draft (Overdue); 9 Feb has no sheet (Missing).
    assert.deepEqual(forWorker.items.map(i => [i.weekStart, i.indicator, i.status]), [['2026-02-09', 'Missing', undefined], ['2026-02-02', 'Overdue', 'Draft']]);
    assert.deepEqual(forWorker.counts, { missing: 1, overdue: 1 });
    assert.equal((await request(manager, 'GET', `/compliance?${range}&userId=${worker.user.id}&indicator=Missing`)).total, 1);
    // Users without a tracking start are never flagged; Users only see themselves.
    assert.deepEqual((await request(admin, 'GET', `/compliance?${range}`)).items.map(i => i.userId).filter((v, i, a) => a.indexOf(v) === i), [worker.user.id]);
    assert.equal((await request(worker, 'GET', `/compliance?${range}`)).total, 2);
    await request(worker, 'GET', `/compliance?${range}&userId=${manager.user.id}`, undefined, 403);
    await request(manager, 'GET', '/compliance?from=2026-01-27', undefined, 400);
    await request(manager, 'GET', '/compliance?from=2024-01-01&to=2026-02-23', undefined, 400);
    // The current week is never flagged before its Sunday deadline.
    record = (await request(admin, 'PATCH', `/users/${worker.user.id}`, { version: record.version, trackingEnd: null })).user;
    assert.ok((await request(worker, 'GET', `/compliance?from=${currentWeek()}`)).items.every(i => i.weekStart < currentWeek()));
    record = (await request(admin, 'PATCH', `/users/${worker.user.id}`, { version: record.version, trackingStart: null })).user;
    assert.equal((await request(worker, 'GET', `/compliance?${range}`)).total, 0);
  });
  await t.test('concurrent reviewers cannot overwrite each other', async () => {
    let own = await request(manager, 'POST', '/timesheets', { weekStart: '2026-02-09', entries: [{ ...entries(40)[0], date: '2026-02-09' }] }, 201);
    own = await request(manager, 'POST', `/timesheets/${own._id}/submit`, { version: own.__v });
    const review = (who, action, body) => fetch(base + `/timesheets/${own._id}/${action}`, { method: 'POST', headers: { Cookie: who.cookie, 'X-CSRF-Token': who.csrf, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const responses = await Promise.all([review(manager, 'approve', { version: own.__v }), review(admin, 'reject', { version: own.__v, reason: 'Review conflict' })]);
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
    await Promise.all(responses.map(r => r.text()));
    const stored = await Timesheet.findById(own._id); assert.equal(stored.history.filter(h => ['approved', 'rejected'].includes(h.action)).length, 1);
  });
  await t.test('catalog archiving preserves reports and blocks new entries', async () => {
    task = await request(manager, 'PATCH', `/tasks/${task._id}`, { version: task.__v, active: false });
    assert.equal((await request(worker, 'GET', '/tasks')).total, 0);
    assert.equal((await request(worker, 'GET', '/tasks?active=all')).total, 1);
    await request(manager, 'POST', '/timesheets', { weekStart: '2026-02-16', entries: [{ ...entries(40)[0], date: '2026-02-16' }] }, 400);
    task = await request(manager, 'PATCH', `/tasks/${task._id}`, { version: task.__v, active: true });
    project = await request(manager, 'PATCH', `/projects/${project._id}`, { version: project.__v, active: false });
    await request(manager, 'POST', '/timesheets', { weekStart: '2026-02-16', entries: [{ ...entries(40)[0], date: '2026-02-16' }] }, 400);
    assert.equal((await request(worker, 'GET', '/reports?period=custom&start=2026-01-01&end=2026-01-31')).totals.hours, 40);
    await request(worker, 'GET', '/clients', undefined, 403);
    await request(worker, 'GET', `/users/${worker.user.id}`, undefined, 403);
  });
  await t.test('user updates revoke permissions and prevent admin lockout', async () => {
    const currentAdmin = (await request(admin, 'GET', '/auth/me')).user;
    await request(admin, 'PATCH', `/users/${currentAdmin.id}`, { version: currentAdmin.version, disabled: true }, 400);
    await request(admin, 'PATCH', `/users/${worker.user.id}`, { version: 999, name: 'stale' }, 409);
    const workerRecord = (await request(admin, 'GET', `/users/${worker.user.id}`)).user;
    await request(admin, 'PATCH', `/users/${worker.user.id}`, { version: workerRecord.version, role: 'Manager' });
    await request(worker, 'GET', '/auth/me', undefined, 401);
    const newManager = await login('worker@test.local'); await request(newManager, 'GET', '/users');
    const history = await request(admin, 'GET', `/users/${worker.user.id}/history`); assert.ok(history.items.some(h => h.action === 'user-updated'));
  });
  await t.test('password changes, reset tokens, session expiry and deactivation', async () => {
    const second = await login('other@test.local');
    await request(other, 'POST', '/auth/change-password', { currentPassword: secret, newPassword: 'Changed-password-43!' });
    await request(second, 'GET', '/auth/me', undefined, 401);
    const reset = await request(admin, 'POST', `/users/${other.user.id}/password-reset`, {});
    await request(null, 'POST', '/auth/reset-password', { token: reset.token, newPassword: secret });
    await request(null, 'POST', '/auth/reset-password', { token: reset.token, newPassword: secret }, 400);
    other = await login('other@test.local');
    const doc = await User.findById(other.user.id);
    await request(admin, 'PATCH', `/users/${other.user.id}`, { version: doc.__v, disabled: true });
    assert.equal((await User.findById(other.user.id)).trackingEnd, istToday()); // disabling ends time tracking
    await request(other, 'GET', '/auth/me', undefined, 401);
    const managerSession = await Session.findOne({ tokenHash: digest(manager.cookie.split('=')[1]) }); managerSession.expiresAt = new Date(0); await managerSession.save();
    await request(manager, 'GET', '/auth/me', undefined, 401);
    await request(admin, 'POST', '/auth/logout', {}); await request(admin, 'GET', '/auth/me', undefined, 401);
  });
});
test('IST date rules and calendar validation', () => {
  assert.equal(validDate('2026-02-30'), false); assert.equal(validDate('2024-02-29'), true);
  assert.equal(istToday(new Date('2026-10-18T18:30:00Z')), '2026-10-19');
  assert.equal(currentWeek(new Date('2026-10-18T18:29:59Z')), '2026-10-12');
  assert.equal(currentWeek(new Date('2026-10-18T18:30:00Z')), '2026-10-19');
  assert.equal(deadline('2026-10-19').toISOString(), '2026-10-25T18:30:00.000Z');
  assert.deepEqual(reportRange('last-month', undefined, undefined, new Date('2026-01-15T00:00:00Z')), { start: '2025-12-01', end: '2025-12-31' });
});
