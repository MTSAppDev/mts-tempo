import { User } from './models.js';
import { hashPassword, publicUser } from './security.js';
import { z, name, email, password, parse } from './validation.js';
export async function bootstrapAdmin(input) {
  const body = parse(z.object({ name: name.max(120), email, password }).strict(), input);
  await User.init();
  if (await User.exists({ role: 'Admin' })) throw new Error('An administrator already exists. Use the authenticated user management API.');
  // Fixed bootstrap ID prevents two concurrent initial administrators.
  const user = await User.create({ _id: '000000000000000000000001', name: body.name, email: body.email, passwordHash: await hashPassword(body.password), role: 'Admin', active: true });
  return publicUser(user);
}
