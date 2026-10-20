import mongoose from 'mongoose';
import { validDate, addDays, isMonday } from './time.js';
const { Schema, model } = mongoose;
const options = { timestamps: true, optimisticConcurrency: true };
const reference = name => ({ type: Schema.Types.ObjectId, ref: name, required: true });
const audit = new Schema({ action: String, actor: reference('User'), at: { type: Date, default: Date.now }, detail: String, revision: Number, changes: Schema.Types.Mixed }, { _id: false });
export const User = model('User', new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 }, email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  role: { type: String, enum: ['Admin', 'Manager', 'User'], default: 'User' }, passwordHash: { type: String, required: true, select: false },
  active: { type: Boolean, default: false }, disabled: { type: Boolean, default: false }, authVersion: { type: Number, default: 0 },
  // Timesheet eligibility (IST calendar dates, inclusive). A week is expected only when it lies fully inside this range.
  trackingStart: { type: String, validate: v => v == null || validDate(v) }, trackingEnd: { type: String, validate: v => v == null || validDate(v) },
  invitationTokenHash: { type: String, select: false }, invitationExpiresAt: Date, resetTokenHash: { type: String, select: false }, resetExpiresAt: Date, history: [audit],
}, options));
export const Session = model('Session', new Schema({ tokenHash: { type: String, unique: true, required: true }, user: reference('User'), csrfHash: { type: String, required: true }, authVersion: { type: Number, required: true }, expiresAt: { type: Date, required: true, expires: 0 } }, { timestamps: true }));
const catalog = { name: { type: String, required: true, trim: true, maxlength: 160 }, active: { type: Boolean, default: true }, history: [audit] };
export const Client = model('Client', new Schema({ ...catalog }, options));
export const Task = model('Task', new Schema({ ...catalog }, options));
export const Project = model('Project', new Schema({ ...catalog, client: reference('Client'), members: [{ type: Schema.Types.ObjectId, ref: 'User' }] }, options));
const entry = new Schema({ date: { type: String, required: true, validate: validDate }, project: reference('Project'), task: reference('Task'), description: { type: String, required: true, trim: true, maxlength: 2000 }, hours: { type: Number, required: true, min: 0.01, validate: Number.isFinite } });
// Approved revisions: append-only, copied verbatim from the entries at approval time.
const snapshotEntry = new Schema({ entryId: Schema.Types.ObjectId, date: { type: String, required: true }, project: reference('Project'), projectName: String, client: { type: Schema.Types.ObjectId, ref: 'Client' }, clientName: String, task: reference('Task'), taskName: String, description: String, hours: { type: Number, required: true } }, { _id: false });
const approval = new Schema({ revision: { type: Number, required: true, min: 1 }, entries: [snapshotEntry], totalHours: { type: Number, required: true }, entryCount: { type: Number, required: true }, approvedBy: reference('User'), approvedByName: String, approvedAt: { type: Date, required: true }, submittedAt: Date, late: Boolean, migrated: Boolean }, { _id: false });
const sheetSchema = new Schema({ user: reference('User'), weekStart: { type: String, required: true, validate: isMonday }, status: { type: String, enum: ['Draft', 'Submitted', 'Rejected', 'Approved'], default: 'Draft' }, entries: [entry],
  revision: { type: Number, default: 1, min: 1 }, approvals: [approval], lastApproved: { type: approval, default: undefined }, submittedAt: Date, reviewedAt: Date, reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' }, rejectionReason: String, late: { type: Boolean, default: false }, history: [audit] }, options);
sheetSchema.index({ user: 1, weekStart: 1 }, { unique: true }); sheetSchema.index({ status: 1, weekStart: 1 });
sheetSchema.pre('validate', function () { if (isMonday(this.weekStart) && this.entries.some(e => !validDate(e.date) || e.date < this.weekStart || e.date > addDays(this.weekStart, 6))) this.invalidate('entries', 'Entries must fall within this Monday–Sunday week'); });
sheetSchema.index({ 'lastApproved.revision': 1, weekStart: 1 });
// Immutability guard. Existing approvals may never change or disappear; at most one may be appended per save,
// and lastApproved must equal the newest approval. The append and the status change go out in one atomic update.
const canonical = value => JSON.stringify(value, (_k, v) => v && typeof v === 'object' && !Array.isArray(v) && v.constructor === Object ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const plain = sub => canonical(sub?.toObject ? sub.toObject({ depopulate: true, virtuals: false, getters: false }) : sub);
const freeze = doc => (doc.approvals || []).map(plain);
sheetSchema.post('init', function () { this.$locals.approvals = freeze(this); });
sheetSchema.post('save', function () { this.$locals.approvals = freeze(this); });
sheetSchema.pre('validate', function () {
  const before = this.isNew ? [] : this.$locals.approvals || [], now = freeze(this);
  if (this.isNew && now.length) return this.invalidate('approvals', 'New timesheets cannot contain approvals');
  if (now.length < before.length || now.length - before.length > 1 || before.some((a, i) => a !== now[i])) return this.invalidate('approvals', 'Approved revisions are immutable');
  if (this.approvals.some((a, i) => i > 0 && a.revision <= this.approvals[i - 1].revision)) return this.invalidate('approvals', 'Approved revisions must increase');
  const last = now.at(-1), current = this.lastApproved ? plain(this.lastApproved) : undefined;
  if (last !== current) this.invalidate('lastApproved', 'Approved revisions are immutable');
});
const protectedPath = /^(approvals|lastApproved)(\.|$)/;
const touchesProtected = update => !!update && (Array.isArray(update) || Object.entries(update).some(([k, v]) => k.startsWith('$') ? v && typeof v === 'object' && Object.keys(v).some(p => protectedPath.test(p)) : protectedPath.test(k)));
const immutable = () => Object.assign(new Error('Approved revisions are immutable'), { status: 409 });
sheetSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function () { if (touchesProtected(this.getUpdate())) throw immutable(); });
sheetSchema.pre(['replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'], function () { throw immutable(); });
sheetSchema.pre('deleteOne', { document: true, query: false }, function () { throw immutable(); });
export const Timesheet = model('Timesheet', sheetSchema);
