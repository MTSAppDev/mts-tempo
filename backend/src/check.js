import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const folder of ['src', 'test']) {
  for (const file of readdirSync(folder).filter(f => f.endsWith('.js'))) {
    const result = spawnSync(process.execPath, ['--check', `${folder}/${file}`], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log('All backend source and test files passed syntax checks.');
