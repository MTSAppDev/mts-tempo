import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// Interactive local bootstrap. Password is hidden and sent to the bootstrap child via stdin.
if (!process.stdin.isTTY) throw new Error('Run setup in an interactive terminal, or use npm run admin:create with JSON on stdin.');
const rl = createInterface({ input: process.stdin, output: process.stdout });
const name = await rl.question('Admin name: ');
const email = await rl.question('Admin email: ');
rl.close();
function hiddenPassword(prompt) {
  return new Promise(resolve => {
    process.stdout.write(prompt); process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
    let value = '';
    const read = chunk => {
      for (const character of chunk) {
        if (character === '\u0003') { process.stdin.setRawMode(false); process.stdout.write('\n'); process.exit(130); }
        if (character === '\r' || character === '\n') { process.stdin.off('data', read); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); resolve(value); return; }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (character >= ' ') value += character;
      }
    };
    process.stdin.on('data', read);
  });
}
const password = await hiddenPassword('Admin password (12–128 characters, hidden): ');
const confirmation = await hiddenPassword('Confirm password (hidden): ');
if (password !== confirmation) throw new Error('Passwords do not match. No account created.');
const child = spawn(process.execPath, [fileURLToPath(new URL('./create-admin.js', import.meta.url))], { stdio: ['pipe', 'inherit', 'inherit'] });
child.stdin.end(JSON.stringify({ name, email, password }));
child.on('exit', code => process.exit(code ?? 1));
