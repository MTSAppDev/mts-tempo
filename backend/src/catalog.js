import { Router } from 'express';
import { User, Project, Client, Task } from './models.js';
import { z, id, name, email, role, version, pageQuery, literalSearch, parse, dateString } from './validation.js';
import { istToday } from './time.js';
import { asyncRoute as wrap, roles, fail, token, digest, hashPassword, publicUser } from './security.js';
const management = roles('Admin', 'Manager');
const history = (req, action, detail) => ({ actor: req.user._id, action, detail });
function checkTracking(user) { if (user.trackingStart && user.trackingEnd && user.trackingEnd < user.trackingStart) fail(400, 'Time tracking end date must be on or after the start date'); }
export function requireVersion(record, value) { if (record.__v !== value) fail(409, 'Record changed. Reload and retry.'); }
async function find(Model, value) { const record = await Model.findById(parse(id, value)); if (!record) fail(404, 'Record not found'); return record; }
async function invitation(user, actor) {
  const raw = token(), temporaryPassword = token().slice(0, 24);
  user.passwordHash = await hashPassword(temporaryPassword); user.invitationTokenHash = digest(raw); user.invitationExpiresAt = new Date(Date.now() + 7 * 86400000); user.authVersion++;
  user.history.push({ action: 'invitation-created', actor }); await user.save();
  return { user: publicUser(user), invitation: { token: raw, link: `${process.env.APP_URL || 'http://localhost:5173'}/invite#token=${raw}`, temporaryPassword, expiresAt: user.invitationExpiresAt, emailSent: false, message: 'Password change after sign-in is optional and recommended.' } };
}
export function catalogRouter() {
  const r = Router();
  r.get('/users', management, wrap(async (req, res) => { const q = parse(pageQuery, req.query), filter = q.search ? { $or: [{ name: { $regex: literalSearch(q.search), $options: 'i' } }, { email: { $regex: literalSearch(q.search), $options: 'i' } }] } : {}; const [users, total] = await Promise.all([User.find(filter).sort({ name: 1, _id: 1 }).skip((q.page - 1) * q.limit).limit(q.limit), User.countDocuments(filter)]); res.json({ items: users.map(publicUser), total, page: q.page, limit: q.limit }); }));
  r.post('/users', roles('Admin'), wrap(async (req, res) => { const body = parse(z.object({ name: name.max(120), email, role, trackingStart: dateString.optional(), trackingEnd: dateString.optional() }).strict(), req.body); const user = new User({ trackingStart: istToday(), ...body }); checkTracking(user); res.status(201).json(await invitation(user, req.user._id)); }));
  r.patch('/users/:id', roles('Admin'), wrap(async (req, res) => {
    const body = parse(z.object({ version, name: name.max(120).optional(), role: role.optional(), disabled: z.boolean().optional(), trackingStart: dateString.nullable().optional(), trackingEnd: dateString.nullable().optional() }).strict(), req.body);
    const user = await find(User, req.params.id); requireVersion(user, body.version);
    // Disallow self-demotion/deactivation, preserving an active administrator even under concurrent edits.
    if (String(user._id) === String(req.user._id) && ((body.role && body.role !== 'Admin') || body.disabled === true)) fail(400, 'An administrator cannot demote or disable their own account');
    if (user.role === 'Admin' && (body.role && body.role !== 'Admin' || body.disabled === true)) fail(400, 'Administrator demotion/deactivation requires an offline administrator procedure');
    if (body.name !== undefined) user.name = body.name; if (body.role !== undefined) user.role = body.role; if (body.disabled !== undefined) user.disabled = body.disabled;
    if (body.trackingStart !== undefined) user.trackingStart = body.trackingStart ?? undefined; if (body.trackingEnd !== undefined) user.trackingEnd = body.trackingEnd ?? undefined;
    // Disabling without an end date ends time tracking today so departed users are not flagged later; Admin can adjust it.
    if (body.disabled === true && !user.trackingEnd) body.trackingEnd = user.trackingEnd = istToday();
    checkTracking(user);
    if (body.role !== undefined || body.disabled !== undefined) user.authVersion++;
    user.history.push(history(req, 'user-updated', JSON.stringify({ name: body.name, role: body.role, disabled: body.disabled, trackingStart: body.trackingStart, trackingEnd: body.trackingEnd }))); await user.save(); res.json({ user: publicUser(user) });
  }));
  r.post('/users/:id/invitation', roles('Admin'), wrap(async (req, res) => { parse(z.object({}).strict(), req.body); const user = await find(User, req.params.id); if (user.active || user.disabled) fail(409, 'Only pending, enabled users can be invited'); res.json(await invitation(user, req.user._id)); }));
  r.post('/users/:id/password-reset', roles('Admin'), wrap(async (req, res) => { parse(z.object({}).strict(), req.body); const user = await find(User, req.params.id); if (!user.active || user.disabled) fail(409, 'Account is unavailable'); const raw = token(); user.resetTokenHash = digest(raw); user.resetExpiresAt = new Date(Date.now() + 3600000); user.history.push(history(req, 'password-reset-issued')); await user.save(); res.json({ token: raw, link: `${process.env.APP_URL || 'http://localhost:5173'}/reset-password#token=${raw}`, expiresAt: user.resetExpiresAt, emailSent: false }); }));
  r.get('/users/:id/history', roles('Admin'), wrap(async (req, res) => res.json({ items: (await find(User, req.params.id)).history })));
  r.get('/users/:id', management, wrap(async (req, res) => res.json({ user: publicUser(await find(User, req.params.id)) })));
  for (const [path, Model, writers] of [['clients', Client, ['Admin']], ['tasks', Task, ['Admin', 'Manager']], ['projects', Project, ['Admin', 'Manager']]]) {
    const project = path === 'projects';
    const schema = z.object({ name, ...(project ? { client: id, members: z.array(id).max(1000).default([]) } : {}) }).strict();
    const readGuard = path === 'clients' ? management : (_req, _res, next) => next();
    r.get(`/${path}`, readGuard, wrap(async (req, res) => {
      const q = parse(pageQuery.extend({ active: z.enum(['true', 'false', 'all']).default('true') }), req.query);
      const filter = {}; if (q.active !== 'all') filter.active = q.active === 'true'; if (q.search) filter.name = { $regex: literalSearch(q.search), $options: 'i' };
      if (project && req.user.role === 'User') filter.members = req.user._id;
      const [items, total] = await Promise.all([Model.find(filter).sort({ name: 1, _id: 1 }).skip((q.page - 1) * q.limit).limit(q.limit), Model.countDocuments(filter)]);
      res.json({ items: items.map(item => catalogView(item, req.user.role, project)), total, page: q.page, limit: q.limit });
    }));
    r.get(`/${path}/:id`, readGuard, wrap(async (req, res) => { const item = await find(Model, req.params.id); if (project && req.user.role === 'User' && !item.members.some(m => m.equals(req.user._id))) fail(404, 'Project not found'); res.json(catalogView(item, req.user.role, project)); }));
    r.post(`/${path}`, roles(...writers), wrap(async (req, res) => { const body = parse(schema, req.body); if (project) await validateProject(body); const item = await Model.create({ ...body, history: [history(req, 'created')] }); res.status(201).json(item); }));
    r.patch(`/${path}/:id`, roles(...writers), wrap(async (req, res) => {
      const body = parse(schema.partial().extend({ active: z.boolean().optional(), version }).strict(), req.body); const item = await find(Model, req.params.id); requireVersion(item, body.version);
      if (project) await validateProject(body); const { version: _version, ...changes } = body; Object.assign(item, changes); item.history.push(history(req, 'updated', JSON.stringify(changes))); await item.save(); res.json(item);
    }));
  }
  return r;
}
function catalogView(item, userRole, project) { const obj = item.toObject(); if (userRole === 'User') { delete obj.history; if (project) delete obj.members; } return obj; }
async function validateProject(body) {
  if (body.client && !await Client.exists({ _id: body.client, active: true })) fail(400, 'Choose an active client');
  if (body.members) { body.members = [...new Set(body.members)]; if (await User.countDocuments({ _id: { $in: body.members }, disabled: false }) !== body.members.length) fail(400, 'One or more assigned users are unavailable'); }
}
