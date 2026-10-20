import { randomBytes, scrypt, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Session, User } from './models.js';
const derive = promisify(scrypt);
export const token = () => randomBytes(32).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password) { const salt = randomBytes(16).toString('hex'); const hash = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }); return `scrypt:${salt}:${hash.toString('hex')}`; }
export async function checkPassword(password, stored) { const [, salt, encoded] = (stored || '').split(':'); const hash = await derive(password, salt || 'missing-account-dummy-salt', 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }); return !!encoded && timingSafeEqual(hash, Buffer.from(encoded, 'hex')); }
export const publicUser = u => ({ id: String(u._id), name: u.name, email: u.email, role: u.role, active: u.active, disabled: u.disabled, trackingStart: u.trackingStart ?? null, trackingEnd: u.trackingEnd ?? null, version: u.__v, createdAt: u.createdAt });
export const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const roles = (...allowed) => (req, _res, next) => allowed.includes(req.user.role) ? next() : next(Object.assign(new Error('Insufficient permissions'), { status: 403 }));
export const cookieOptions = () => ({ httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/api' });
export async function issueSession(user, res) { const raw = token(), csrfToken = token(); await Session.create({ tokenHash: digest(raw), csrfHash: digest(csrfToken), user: user._id, authVersion: user.authVersion, expiresAt: new Date(Date.now() + 12 * 3600000) }); res.cookie('tempo_session', raw, { ...cookieOptions(), maxAge: 12 * 3600000 }); return { user: publicUser(user), csrfToken }; }
export const authenticate = asyncRoute(async (req, _res, next) => { const raw = req.cookies.tempo_session; if (!raw || typeof raw !== 'string') fail(401, 'Sign in required'); const session = await Session.findOne({ tokenHash: digest(raw), expiresAt: { $gt: new Date() } }); const user = session && await User.findById(session.user); if (!user || !user.active || user.disabled || user.authVersion !== session.authVersion) fail(401, 'Session expired or account unavailable'); req.user = user; req.session = session; if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) { const csrf = req.get('X-CSRF-Token'); if (!csrf || digest(csrf) !== session.csrfHash) fail(403, 'Invalid CSRF token'); } next(); });
