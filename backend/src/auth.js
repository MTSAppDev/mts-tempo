import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { User, Session } from './models.js';
import { z, email, password, parse } from './validation.js';
import { asyncRoute as wrap, authenticate, checkPassword, hashPassword, issueSession, fail, digest, publicUser, token, cookieOptions } from './security.js';
export function authRouter() {
  const r = Router();
  const throttle = rateLimit({ windowMs: 15 * 60000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Try again later.' } });
  r.post('/login', throttle, wrap(async (req, res) => {
    const body = parse(z.object({ email, password: z.string().min(1).max(128) }).strict(), req.body);
    const user = await User.findOne({ email: body.email }).select('+passwordHash');
    const matches = await checkPassword(body.password, user?.passwordHash);
    if (!matches || !user.active || user.disabled) fail(401, 'Invalid credentials or inactive account');
    res.json(await issueSession(user, res));
  }));
  r.post('/accept-invitation', throttle, wrap(async (req, res) => {
    const body = parse(z.object({ token: z.string().min(32).max(100), temporaryPassword: z.string().min(1).max(128) }).strict(), req.body);
    const user = await User.findOne({ invitationTokenHash: digest(body.token), invitationExpiresAt: { $gt: new Date() }, active: false, disabled: false }).select('+passwordHash +invitationTokenHash');
    if (!await checkPassword(body.temporaryPassword, user?.passwordHash) || !user) fail(400, 'Invalid or expired invitation');
    user.active = true; user.invitationTokenHash = undefined; user.invitationExpiresAt = undefined;
    user.history.push({ action: 'invitation-accepted', actor: user._id }); await user.save();
    res.json(await issueSession(user, res));
  }));
  r.post('/reset-password', throttle, wrap(async (req, res) => {
    const body = parse(z.object({ token: z.string().min(32).max(100), newPassword: password }).strict(), req.body);
    const user = await User.findOne({ resetTokenHash: digest(body.token), resetExpiresAt: { $gt: new Date() }, active: true, disabled: false }).select('+passwordHash +resetTokenHash');
    if (!user) fail(400, 'Invalid or expired reset token');
    user.passwordHash = await hashPassword(body.newPassword); user.resetTokenHash = undefined; user.resetExpiresAt = undefined; user.authVersion++;
    user.history.push({ action: 'password-reset', actor: user._id }); await user.save(); await Session.deleteMany({ user: user._id });
    res.clearCookie('tempo_session', cookieOptions()); res.json({ message: 'Password reset. Sign in again.' });
  }));
  r.use(authenticate);
  r.get('/me', wrap(async (req, res) => res.json({ user: publicUser(req.user) })));
  r.get('/csrf', wrap(async (req, res) => { const csrfToken = token(); req.session.csrfHash = digest(csrfToken); await req.session.save(); res.json({ csrfToken }); }));
  r.post('/logout', wrap(async (req, res) => { await Session.deleteOne({ _id: req.session._id }); res.clearCookie('tempo_session', cookieOptions()); res.json({ message: 'Signed out' }); }));
  r.post('/change-password', throttle, wrap(async (req, res) => {
    const body = parse(z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }).strict(), req.body);
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!await checkPassword(body.currentPassword, user.passwordHash)) fail(400, 'Current password is incorrect');
    user.passwordHash = await hashPassword(body.newPassword); user.authVersion++; user.resetTokenHash = undefined; user.resetExpiresAt = undefined;
    user.history.push({ action: 'password-changed', actor: user._id }); await user.save(); await Session.deleteMany({ user: user._id });
    res.clearCookie('tempo_session', cookieOptions()); res.json({ message: 'Password changed. Sign in again.' });
  }));
  return r;
}
