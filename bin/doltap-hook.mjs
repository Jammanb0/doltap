#!/usr/bin/env node
// Optional Stop-hook adapter. Never installed by init or migrate.
import { fullCheck } from '../lib/runtime.mjs';
import { format } from '../lib/check.mjs';
let text = '';
for await (const chunk of process.stdin) {
  text += chunk;
  if (text.length > 1_000_000) throw new Error('Hook input is too large');
}
try {
  const input = JSON.parse(text || '{}');
  if (input.stop_hook_active) process.stdout.write('{}\n');
  else {
    const result = fullCheck(input.cwd || process.cwd());
    process.stdout.write(JSON.stringify(result.problems.length ? { decision: 'block', reason: format(result) } : {}) + '\n');
  }
} catch (error) {
  process.stderr.write(error.message + '\n');
  process.exitCode = 2;
}
