import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite3 from 'sqlite3';
import argon2 from 'argon2';
import passwordPrompt from 'password-prompt';

const databasePath = path.resolve(process.env.DATABASE_PATH || './data/moc-analytics.sqlite');
const email = String(process.argv[2] || '').trim().toLowerCase();
const role = process.argv[3] === 'admin' ? 'admin' : 'viewer';
if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
  console.error('Usage: npm run admin:create -- user@example.com [admin|viewer]');
  process.exit(1);
}

fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const db = new sqlite3.Database(databasePath);
await new Promise((resolve, reject) => db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    disabled_at TEXT
  );
`, error => error ? reject(error) : resolve()));
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (error) { error ? reject(error) : resolve(this); }));
try {
  const existing = await get('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) throw new Error('This email already has an account.');
  const password = await passwordPrompt('Tạo mật khẩu (tối thiểu 12 ký tự): ');
  if (password.length < 12) throw new Error('Password must contain at least 12 characters.');
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await run('INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)', [crypto.randomUUID(), email, passwordHash, role]);
  console.log(`Created ${role} account for ${email}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
