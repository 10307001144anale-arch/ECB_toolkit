// Creates an administrator (or resets an existing admin's password).
// Usage: npm run create-admin -- admin@example.org "Full Name"
// The password is asked for interactively so it never appears in shell history.

import dotenv from 'dotenv';
import readline from 'node:readline';

dotenv.config();
const { db, initDb, closeDb, logActivity } = await import('../db.ts');
await initDb();
const { createUser, hashPassword, passwordProblem } = await import('../auth.ts');

const [email, ...nameParts] = process.argv.slice(2);
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: npm run create-admin -- admin@example.org "Full Name"');
  process.exit(1);
}
const name = nameParts.join(' ').trim() || 'Administrator';

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (a) => {
      rl.close();
      resolve(a);
    })
  );
}

const password = process.env.NEW_ADMIN_PASSWORD || (await ask('Password (min 10 chars, letters + numbers): '));
const problem = passwordProblem(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}

const existing = await db.one('SELECT id, role FROM users WHERE lower(email) = ?', [email.toLowerCase()]);
if (existing) {
  if (existing.role !== 'admin') {
    console.error('That email belongs to a client account. Use a different email.');
    process.exit(1);
  }
  await db.run('UPDATE users SET password_hash = ?, active = 1, updated_at = ? WHERE id = ?', [hashPassword(password), Date.now(), existing.id]);
  await db.run('DELETE FROM sessions WHERE user_id = ?', [existing.id]);
  console.log(`Password reset for administrator ${email}.`);
} else {
  const u = await createUser({ email: email.toLowerCase(), name, password, role: 'admin' });
  await logActivity(u.id, 'admin_created_cli', email);
  console.log(`Administrator ${email} created.`);
}
await closeDb();
