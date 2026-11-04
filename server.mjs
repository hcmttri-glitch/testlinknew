import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import SQLiteStoreFactory from 'connect-sqlite3';
import sqlite3 from 'sqlite3';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { csrfSync } from 'csrf-sync';
import argon2 from 'argon2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
const databasePath = path.resolve(process.env.DATABASE_PATH || './data/moc-analytics.sqlite');
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret || sessionSecret.length < 32 || sessionSecret === 'replace-with-a-long-random-secret') {
  throw new Error('Set SESSION_SECRET to a random value with at least 32 characters.');
}
const dummyPasswordHash = await argon2.hash(crypto.randomBytes(32).toString('hex'), { type: argon2.argon2id });
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
app.set('trust proxy', process.env.TRUST_PROXY || (isProduction ? 1 : 0));
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '8kb' }));

const db = new sqlite3.Database(databasePath);
await new Promise((resolve, reject) => {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, disabled_at TEXT
    );
    CREATE TABLE IF NOT EXISTS social_accounts (
      id TEXT PRIMARY KEY, platform TEXT NOT NULL, handle TEXT NOT NULL COLLATE NOCASE,
      display_name TEXT NOT NULL, profile_url TEXT NOT NULL DEFAULT '', owner TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(platform, handle)
    );
    CREATE TABLE IF NOT EXISTS social_metrics (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
      report_date TEXT NOT NULL, followers INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0, reach INTEGER NOT NULL DEFAULT 0,
      likes INTEGER NOT NULL DEFAULT 0, comments INTEGER NOT NULL DEFAULT 0,
      shares INTEGER NOT NULL DEFAULT 0, saves INTEGER NOT NULL DEFAULT 0,
      posts INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(account_id, report_date)
    );
    CREATE TABLE IF NOT EXISTS social_posts (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
      post_url TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, published_at TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0, likes INTEGER NOT NULL DEFAULT 0,
      comments INTEGER NOT NULL DEFAULT 0, shares INTEGER NOT NULL DEFAULT 0,
      owner TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `, error => error ? reject(error) : resolve());
});

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (error) { error ? reject(error) : resolve(this); });
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
});
const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});
const SQLiteStore = SQLiteStoreFactory(session);
app.use(session({
  name: 'moc1992.sid',
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.dirname(databasePath), concurrentDB: true }),
  secret: sessionSecret, resave: false, saveUninitialized: false, rolling: true,
  cookie: { httpOnly: true, secure: isProduction, sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000 },
}));
const { csrfSynchronisedProtection, generateToken } = csrfSync({ getTokenFromRequest: request => request.body?._csrf || request.headers['x-csrf-token'] });
app.use(csrfSynchronisedProtection);
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false });
const setupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false });

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function loginPage(request, message = '') {
  const token = generateToken(request, undefined);
  const msg = message ? `<div class="message" role="alert">${escapeHtml(message)}</div>` : '';
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Đăng nhập · Mộc 1992 Social Hub</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#f7f7f4;color:#25231f;font:15px/1.5 Arial,sans-serif;display:grid;place-items:center;padding:22px}.card{width:min(420px,100%);background:white;border:1px solid #e9e7df;border-radius:18px;padding:32px}.mark{width:44px;height:44px;border-radius:14px;background:#436c4b;color:white;display:grid;place-items:center;font:24px Georgia,serif}h1{font-size:25px;margin:22px 0 5px}.muted{color:#77766f;font-size:13px}.message{background:#fff4f1;color:#9c473f;padding:10px;border-radius:8px;font-size:12px}label{display:block;font-size:12px;font-weight:bold;margin:14px 0 6px}input{width:100%;border:1px solid #deddd5;border-radius:9px;padding:12px;font:inherit}button{width:100%;border:0;border-radius:9px;background:#436c4b;color:white;padding:12px;margin-top:20px;font:inherit;font-weight:bold;cursor:pointer}</style></head><body><main class="card"><div class="mark">M</div><h1>Mộc 1992 Social Hub</h1><p class="muted">Đăng nhập vào hệ thống quản lý mạng xã hội.</p>${msg}<form method="post" action="/login"><input type="hidden" name="_csrf" value="${escapeHtml(token)}"><label>Email tài khoản</label><input name="email" type="email" autocomplete="username" required maxlength="254"><label>Mật khẩu</label><input name="password" type="password" autocomplete="current-password" required maxlength="128"><button>Đăng nhập</button></form><p class="muted">Nhờ quản trị viên cấp tài khoản nếu bạn chưa có quyền truy cập.</p></main></body></html>`;
}
function setupPage(request, message = '') {
  const token = escapeHtml(generateToken(request));
  const msg = message ? `<div class="message">${escapeHtml(message)}</div>` : '';
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Khởi tạo · Mộc 1992</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#f7f7f4;color:#25231f;font:15px/1.5 Arial,sans-serif;display:grid;place-items:center;padding:22px}.card{width:min(440px,100%);background:white;border:1px solid #e9e7df;border-radius:18px;padding:30px}h1{font-size:24px}.muted{color:#77766f;font-size:12px}label{display:block;font-size:12px;font-weight:bold;margin:13px 0 6px}input{width:100%;border:1px solid #deddd5;border-radius:9px;padding:12px;font:inherit}button{width:100%;border:0;border-radius:9px;background:#436c4b;color:white;padding:12px;margin-top:19px;font:inherit;font-weight:bold}.message{background:#fff4f1;color:#9c473f;padding:10px;border-radius:8px}</style></head><body><main class="card"><h1>Khởi tạo quản trị viên</h1><p class="muted">Trang chỉ dùng một lần, tự khóa sau khi tạo tài khoản admin.</p>${msg}<form method="post" action="/setup"><input type="hidden" name="_csrf" value="${token}"><label>Mã khởi tạo</label><input name="setupKey" type="password" required><label>Email</label><input name="email" type="email" maxlength="254" required><label>Mật khẩu (ít nhất 12 ký tự)</label><input name="password" type="password" minlength="12" maxlength="128" required><button>Tạo tài khoản</button></form></main></body></html>`;
}
function safeEqual(a, b) {
  if (!a || !b) return false;
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
async function findUser(request) {
  if (!request.session.userId) return null;
  return get('SELECT id,email,role FROM users WHERE id=? AND disabled_at IS NULL', [request.session.userId]);
}
app.get('/login', async (req, res) => {
  if (await findUser(req)) return res.redirect('/');
  res.type('html').send(loginPage(req));
});
app.get('/setup', async (req, res) => {
  const admin = await get("SELECT id FROM users WHERE role='admin' AND disabled_at IS NULL LIMIT 1");
  if (admin || !process.env.ADMIN_SETUP_KEY) return res.status(404).send('Không tìm thấy trang.');
  res.type('html').send(setupPage(req));
});
app.post('/setup', setupLimiter, async (req, res, next) => {
  try {
    const admin = await get("SELECT id FROM users WHERE role='admin' AND disabled_at IS NULL LIMIT 1");
    if (admin || !safeEqual(req.body.setupKey, process.env.ADMIN_SETUP_KEY)) return res.status(404).type('text').send('Không tìm thấy trang.');
    const email = String(req.body.email || '').trim().toLowerCase(), password = String(req.body.password || '');
    if (!/^\\S+@\\S+\\.\\S+$/.test(email) || password.length < 12 || password.length > 128) return res.status(400).type('html').send(setupPage(req, 'Kiểm tra email và mật khẩu.'));
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    await run('INSERT INTO users (id,email,password_hash,role) VALUES (?,?,?,?)', [crypto.randomUUID(), email, hash, 'admin']);
    res.redirect(303, '/login');
  } catch (e) { next(e); }
});
app.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase(), password = String(req.body.password || '');
    const user = await get('SELECT id,email,password_hash,role FROM users WHERE email=? AND disabled_at IS NULL', [email]);
    const valid = await argon2.verify(user?.password_hash || dummyPasswordHash, password);
    if (!valid) return res.status(401).type('html').send(loginPage(req, 'Email hoặc mật khẩu chưa đúng.'));
    req.session.regenerate(error => {
      if (error) return next(error);
      req.session.userId = user.id; req.session.role = user.role;
      req.session.save(saveError => saveError ? next(saveError) : res.redirect('/'));
    });
  } catch (e) { next(e); }
});
app.post('/logout', (req, res, next) => req.session.destroy(error => {
  if (error) return next(error);
  res.clearCookie('moc1992.sid', { httpOnly: true, secure: isProduction, sameSite: 'strict' });
  res.redirect('/login');
}));

app.use(async (req, res, next) => {
  try {
    const user = await findUser(req);
    if (!user) return req.path.startsWith('/api/') ? res.status(401).json({ error: 'Chưa đăng nhập.' }) : res.redirect('/login');
    res.set('Cache-Control', 'no-store');
    res.locals.user = user;
    next();
  } catch (e) { next(e); }
});

const platforms = ['TikTok','Facebook','Instagram','Threads','YouTube'];
app.get('/api/bootstrap', async (req, res, next) => {
  try {
    const accounts = await all(`SELECT a.*, (SELECT COUNT(*) FROM social_metrics m WHERE m.account_id=a.id) AS reports,
      (SELECT COALESCE(SUM(views),0) FROM social_metrics m WHERE m.account_id=a.id) AS recorded_views
      FROM social_accounts a ORDER BY a.created_at DESC`);
    const metrics = await all(`SELECT m.*, a.platform, a.handle, a.display_name FROM social_metrics m
      JOIN social_accounts a ON a.id=m.account_id ORDER BY m.report_date DESC, a.display_name ASC LIMIT 300`);
    const posts = await all(`SELECT p.*, a.platform, a.handle, a.display_name FROM social_posts p JOIN social_accounts a ON a.id=p.account_id ORDER BY p.published_at DESC LIMIT 100`);
    res.json({ user: { email: res.locals.user.email, role: res.locals.user.role }, platforms, accounts, metrics, posts });
  } catch (e) { next(e); }
});
app.post('/api/accounts', async (req, res, next) => {
  try {
    const platform = String(req.body.platform || ''), handle = String(req.body.handle || '').trim().replace(/^@/, '');
    const displayName = String(req.body.displayName || handle).trim();
    const profileUrl = String(req.body.profileUrl || '').trim(), owner = String(req.body.owner || '').trim();
    if (!platforms.includes(platform) || !handle || handle.length > 100 || displayName.length > 120 || profileUrl.length > 500 || owner.length > 120) return res.status(400).json({ error: 'Thông tin kênh không hợp lệ.' });
    if (profileUrl && !/^https:\/\//i.test(profileUrl)) return res.status(400).json({ error: 'Đường dẫn hồ sơ phải bắt đầu bằng https://.' });
    const id = crypto.randomUUID();
    await run('INSERT INTO social_accounts (id,platform,handle,display_name,profile_url,owner) VALUES (?,?,?,?,?,?)', [id, platform, handle, displayName, profileUrl, owner]);
    res.status(201).json({ id });
  } catch (e) {
    if (String(e.message).includes('UNIQUE constraint failed')) return res.status(409).json({ error: 'Tài khoản này đã được thêm.' });
    next(e);
  }
});
app.patch('/api/accounts/:id', async (req, res, next) => {
  try {
    const status = String(req.body.status || '');
    if (!['active','paused'].includes(status)) return res.status(400).json({ error: 'Trạng thái không hợp lệ.' });
    const result = await run('UPDATE social_accounts SET status=? WHERE id=?', [status, req.params.id]);
    if (!result.changes) return res.status(404).json({ error: 'Không tìm thấy kênh.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.delete('/api/accounts/:id', async (req, res, next) => {
  try {
    const account = await get('SELECT id FROM social_accounts WHERE id=?', [req.params.id]);
    if (!account) return res.status(404).json({ error: 'Không tìm thấy kênh.' });
    await run('DELETE FROM social_accounts WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.post('/api/metrics', async (req, res, next) => {
  try {
    const accountId = String(req.body.accountId || ''), date = String(req.body.reportDate || '');
    const account = await get('SELECT id FROM social_accounts WHERE id=?', [accountId]);
    if (!account) return res.status(404).json({ error: 'Kênh không tồn tại.' });
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return res.status(400).json({ error: 'Ngày báo cáo không hợp lệ.' });
    const fields = ['followers','views','reach','likes','comments','shares','saves','posts','clicks'];
    const values = fields.map(key => Number(req.body[key] || 0));
    if (values.some(n => !Number.isSafeInteger(n) || n < 0 || n > 1000000000000)) return res.status(400).json({ error: 'Chỉ số phải là số nguyên không âm hợp lệ.' });
    const notes = String(req.body.notes || '').slice(0, 1000);
    const id = crypto.randomUUID();
    await run(`INSERT INTO social_metrics (id,account_id,report_date,${fields.join(',')},notes) VALUES (?,?,?,${fields.map(()=>'?').join(',')},?)
      ON CONFLICT(account_id,report_date) DO UPDATE SET ${fields.map(f=>f+'=excluded.'+f).join(',')}, notes=excluded.notes, created_at=CURRENT_TIMESTAMP`,
      [id, accountId, date, ...values, notes]);
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});
app.post('/api/posts', async (req, res, next) => {
  try {
    const accountId = String(req.body.accountId || ''), title = String(req.body.title || '').trim();
    const account = await get('SELECT id FROM social_accounts WHERE id=?', [accountId]);
    const date = String(req.body.publishedAt || '');
    const url = String(req.body.postUrl || '').trim(), owner = String(req.body.owner || '').trim();
    const numbers = ['views','likes','comments','shares'].map(k=>Number(req.body[k]||0));
    if (!account || !title || title.length > 240 || !/^\\d{4}-\\d{2}-\\d{2}$/.test(date) || numbers.some(n=>!Number.isSafeInteger(n)||n<0) || (url && !/^https:\/\//i.test(url))) return res.status(400).json({ error: 'Kiểm tra lại thông tin bài đăng.' });
    await run('INSERT INTO social_posts (id,account_id,post_url,title,published_at,views,likes,comments,shares,owner) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [crypto.randomUUID(),accountId,url,title,date,...numbers,owner]);
    res.status(201).json({ ok: true });
  } catch(e) { next(e); }
});

app.get('/', async (req, res, next) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, 'dashboard.html'), 'utf8');
    res.type('html').send(html.replaceAll('__CSRF_TOKEN__', escapeHtml(generateToken(req))).replaceAll('__USER_EMAIL__', escapeHtml(res.locals.user.email)));
  } catch(e) { next(e); }
});
app.use((error, req, res, next) => {
  console.error('Request failed:', error.message);
  if (res.headersSent) return next(error);
  if (error.code === 'EBADCSRFTOKEN') return res.status(403).type('text').send('Phiên biểu mẫu đã hết hạn. Vui lòng tải lại trang.');
  res.status(500).json({ error: 'Có lỗi xảy ra. Vui lòng thử lại sau.' });
});
app.listen(port, '0.0.0.0', () => console.log(`Mộc 1992 Social Hub listening on port ${port}`));
