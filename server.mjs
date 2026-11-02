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
app.use(express.urlencoded({ extended: false, limit: '8kb' }));

const db = new sqlite3.Database(databasePath);
await new Promise((resolve, reject) => {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      disabled_at TEXT
    );
  `, error => error ? reject(error) : resolve());
});

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (error) { error ? reject(error) : resolve(this); });
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
});

const SQLiteStore = SQLiteStoreFactory(session);
app.use(session({
  name: 'moc1992.sid',
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.dirname(databasePath), concurrentDB: true }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000,
  },
}));

const { csrfSynchronisedProtection, generateToken } = csrfSync({
  getTokenFromRequest: request => request.body?._csrf,
});
app.use(csrfSynchronisedProtection);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Thử đăng nhập quá nhiều lần. Vui lòng đợi 15 phút rồi thử lại.',
});
const setupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
let firstAdminSetupInProgress = false;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function loginPage(request, message = '') {
  const csrfToken = generateToken(request, undefined);
  const messageHtml = message ? `<div class="message" role="alert">${escapeHtml(message)}</div>` : '';
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f7f7f4"><title>Đăng nhập · Mộc 1992 Analytics</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#f7f7f4;color:#25231f;font:15px/1.5 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;place-items:center;padding:22px}.card{width:min(420px,100%);background:#fff;border:1px solid #e9e7df;border-radius:18px;padding:32px;box-shadow:0 16px 50px #302b1e0d}.brand{display:flex;align-items:center;gap:12px;margin-bottom:30px}.mark{width:44px;height:44px;border-radius:14px;background:#436c4b;color:white;display:grid;place-items:center;font:24px Georgia,serif}.brand b{display:block;font-size:16px}.brand small{color:#77766f;font-size:12px}.eyebrow{color:#436c4b;font-size:10px;letter-spacing:1.2px;font-weight:750;text-transform:uppercase}h1{font-size:25px;letter-spacing:-.6px;margin:7px 0 5px}.intro{margin:0 0 23px;color:#77766f;font-size:13px}label{display:block;font-size:12px;font-weight:650;margin:14px 0 6px}input{width:100%;border:1px solid #deddd5;border-radius:9px;padding:12px 13px;font:inherit;outline:none}input:focus{border-color:#66836a;box-shadow:0 0 0 3px #66836a1a}button{width:100%;border:0;border-radius:9px;background:#436c4b;color:white;padding:12px;margin-top:20px;font:inherit;font-weight:650;cursor:pointer}button:hover{background:#365a3d}.message{border:1px solid #f0d1cc;background:#fff4f1;color:#9c473f;padding:10px 12px;border-radius:8px;font-size:12px;margin:0 0 14px}.hint{margin-top:17px;border-top:1px solid #efeee8;padding-top:14px;color:#89877f;font-size:11px}.foot{text-align:center;color:#aaa89f;font-size:10px;margin-top:23px}
</style></head><body><main class="card"><div class="brand"><div class="mark">M</div><div><b>Mộc 1992</b><small>TikTok Analytics</small></div></div><div class="eyebrow">KHU VỰC RIÊNG</div><h1>Đăng nhập</h1><p class="intro">Đăng nhập bằng tài khoản được quản trị viên cấp để xem dashboard.</p>${messageHtml}<form method="post" action="/login"><input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}"><label for="email">Email tài khoản</label><input id="email" name="email" type="email" autocomplete="username" required maxlength="254"><label for="password">Mật khẩu</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="128"><button type="submit">Đăng nhập</button></form><div class="hint">Chưa có tài khoản? Nhờ quản trị viên Mộc 1992 tạo tài khoản cho bạn.</div><div class="foot">© Mộc 1992 Analytics</div></main></body></html>`;
}

function setupPage(request, message = '') {
  const csrfToken = escapeHtml(generateToken(request));
  const messageHtml = message ? `<div class="message" role="alert">${escapeHtml(message)}</div>` : '';
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tạo tài khoản quản trị · Mộc 1992</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#f7f7f4;color:#25231f;font:15px/1.5 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;place-items:center;padding:22px}.card{width:min(440px,100%);background:#fff;border:1px solid #e9e7df;border-radius:18px;padding:30px;box-shadow:0 16px 50px #302b1e0d}.eyebrow{color:#436c4b;font-size:10px;letter-spacing:1.2px;font-weight:750;text-transform:uppercase}h1{font-size:24px;margin:7px 0}.intro,.hint{color:#77766f;font-size:12px;margin:0 0 18px}label{display:block;font-size:12px;font-weight:650;margin:13px 0 6px}input{width:100%;border:1px solid #deddd5;border-radius:9px;padding:12px;font:inherit}button{width:100%;border:0;border-radius:9px;background:#436c4b;color:#fff;padding:12px;margin-top:19px;font:inherit;font-weight:650;cursor:pointer}.message{background:#fff4f1;color:#9c473f;border:1px solid #f0d1cc;border-radius:8px;padding:10px;font-size:12px;margin-bottom:12px}.hint{margin-top:15px;margin-bottom:0}</style></head><body><main class="card"><div class="eyebrow">Khởi tạo lần đầu</div><h1>Tạo tài khoản quản trị</h1><p class="intro">Chỉ dùng một lần để tạo chủ sở hữu dashboard. Sau khi hoàn tất, trang này sẽ tự khóa.</p>${messageHtml}<form method="post" action="/setup"><input type="hidden" name="_csrf" value="${csrfToken}"><label for="setupKey">Mã khởi tạo</label><input id="setupKey" name="setupKey" type="password" autocomplete="off" required><label for="email">Email đăng nhập</label><input id="email" name="email" type="email" autocomplete="username" maxlength="254" required><label for="password">Mật khẩu (ít nhất 12 ký tự)</label><input id="password" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required><button type="submit">Tạo tài khoản và tiếp tục</button></form><p class="hint">Mã khởi tạo nằm trong phần biến môi trường của dịch vụ hosting. Không gửi mã này trong chat.</p></main></body></html>`;
}

function safeEqual(leftValue, rightValue) {
  if (!leftValue || !rightValue) return false;
  const left = Buffer.from(String(leftValue));
  const right = Buffer.from(String(rightValue));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function findUser(request) {
  if (!request.session.userId) return null;
  return get('SELECT id, email, role FROM users WHERE id = ? AND disabled_at IS NULL', [request.session.userId]);
}

app.get('/login', async (request, response) => {
  if (await findUser(request)) return response.redirect('/');
  response.type('html').send(loginPage(request));
});

app.get('/setup', async (request, response) => {
  const admin = await get("SELECT id FROM users WHERE role = 'admin' AND disabled_at IS NULL LIMIT 1");
  if (admin || !process.env.ADMIN_SETUP_KEY) return response.status(404).type('text').send('Không tìm thấy trang.');
  response.type('html').send(setupPage(request));
});

app.post('/setup', setupLimiter, async (request, response, next) => {
  if (!process.env.ADMIN_SETUP_KEY) return response.status(404).type('text').send('Không tìm thấy trang.');
  if (firstAdminSetupInProgress) return response.status(409).type('text').send('Đang khởi tạo tài khoản. Vui lòng thử lại.');
  firstAdminSetupInProgress = true;
  try {
    const admin = await get("SELECT id FROM users WHERE role = 'admin' AND disabled_at IS NULL LIMIT 1");
    if (admin) return response.status(404).type('text').send('Không tìm thấy trang.');
    const email = String(request.body.email || '').trim().toLowerCase();
    const password = String(request.body.password || '');
    if (!safeEqual(request.body.setupKey, process.env.ADMIN_SETUP_KEY)) return response.status(401).type('html').send(setupPage(request, 'Mã khởi tạo chưa đúng.'));
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 12 || password.length > 128) return response.status(400).type('html').send(setupPage(request, 'Kiểm tra email và mật khẩu (từ 12 đến 128 ký tự).'));
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await run('INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)', [crypto.randomUUID(), email, passwordHash, 'admin']);
    response.redirect(303, '/login');
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed')) return response.status(409).type('html').send(setupPage(request, 'Email này đã được dùng.'));
    next(error);
  } finally {
    firstAdminSetupInProgress = false;
  }
});

app.post('/login', loginLimiter, async (request, response, next) => {
  try {
    const email = String(request.body.email || '').trim().toLowerCase();
    const password = String(request.body.password || '');
    const user = await get('SELECT id, email, password_hash, role FROM users WHERE email = ? AND disabled_at IS NULL', [email]);
    const valid = await argon2.verify(user?.password_hash || dummyPasswordHash, password);
    if (!valid) return response.status(401).type('html').send(loginPage(request, 'Email hoặc mật khẩu chưa đúng.'));
    request.session.regenerate(error => {
      if (error) return next(error);
      request.session.userId = user.id;
      request.session.role = user.role;
      request.session.save(saveError => saveError ? next(saveError) : response.redirect('/'));
    });
  } catch (error) { next(error); }
});

app.post('/logout', (request, response, next) => {
  request.session.destroy(error => {
    if (error) return next(error);
    response.clearCookie('moc1992.sid', { httpOnly: true, secure: isProduction, sameSite: 'strict' });
    response.redirect('/login');
  });
});

app.use(async (request, response, next) => {
  try {
    const user = await findUser(request);
    if (!user) return response.redirect('/login');
    response.set('Cache-Control', 'no-store');
    response.locals.user = user;
    next();
  } catch (error) { next(error); }
});

app.get('/', (request, response) => {
  const filePath = path.join(__dirname, 'dashboard.html');
  fs.readFile(filePath, 'utf8', (error, html) => {
    if (error) return response.status(500).send('Dashboard chưa sẵn sàng.');
    const csrfToken = escapeHtml(generateToken(request));
    response.type('html').send(html
      .replaceAll('__CSRF_TOKEN__', csrfToken)
      .replaceAll('__USER_EMAIL__', escapeHtml(response.locals.user.email)));
  });
});

app.get('/api/session', (request, response) => {
  response.json({ user: { email: response.locals.user.email, role: response.locals.user.role } });
});

app.use((error, request, response, next) => {
  console.error('Request failed:', error.message);
  if (response.headersSent) return next(error);
  if (error.code === 'EBADCSRFTOKEN') return response.status(403).type('text').send('Phiên biểu mẫu đã hết hạn. Vui lòng tải lại trang và thử lại.');
  response.status(500).type('text').send('Có lỗi xảy ra. Vui lòng thử lại sau.');
});

app.listen(port, '0.0.0.0', () => console.log(`Mộc 1992 dashboard server listening on port ${port}`));
