import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'rompe-api-'));
const port = 5182;
const base = `http://127.0.0.1:${port}`;
let server;

beforeAll(async () => {
  server = Bun.spawn(['bun', 'server.ts'], {
    cwd: join(import.meta.dir, '..'),
    env: { ...Bun.env, PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: 'test-admin-secret' },
    stdout: 'ignore', stderr: 'ignore',
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`${base}/api/me`)).ok) return; } catch { /* espera inicio */ }
    await Bun.sleep(50);
  }
  throw new Error('El servidor de prueba no inició.');
});

afterAll(() => {
  server?.kill();
  rmSync(dataDir, { recursive: true, force: true });
});

async function post(path, payload, cookie = '') {
  return fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(payload),
  });
}

test('códigos individuales, guardado y expiración de sesiones', async () => {
  const adminLogin = await post('/api/admin/login', { key: 'test-admin-secret' });
  expect(adminLogin.status).toBe(200);
  const adminCookie = adminLogin.headers.get('set-cookie').split(';')[0];

  const create = await post('/api/admin/codes', { count: 1, days: 10, prefix: 'Prueba' }, adminCookie);
  expect(create.status).toBe(201);
  const { created } = await create.json();
  expect(created).toHaveLength(1);

  const studentLogin = await post('/api/student/login', { code: created[0].code });
  expect(studentLogin.status).toBe(200);
  const studentCookie = studentLogin.headers.get('set-cookie').split(';')[0];

  const progress = {
    maxUnlockedIdx: 0, campaignCompleted: false, discoveredIds: [], bestInfiniteStreak: 0,
    checkpoint: { levelIdx: 0, stage: 'questions', questionIndex: 3, visibility: 270 }, scores: {},
  };
  const save = await fetch(`${base}/api/progress`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', cookie: studentCookie },
    body: JSON.stringify({ progress }),
  });
  expect(save.status).toBe(200);
  const me = await fetch(`${base}/api/me`, { headers: { cookie: studentCookie } });
  expect((await me.json()).progress.checkpoint.questionIndex).toBe(3);

  const expire = await post(`/api/admin/students/${created[0].id}/expire-sessions`, {}, adminCookie);
  expect(expire.status).toBe(200);
  const expiredMe = await fetch(`${base}/api/me`, { headers: { cookie: studentCookie } });
  expect((await expiredMe.json()).role).toBe('guest');

  const loginAgain = await post('/api/student/login', { code: created[0].code });
  expect(loginAgain.status).toBe(200);
  expect((await loginAgain.json()).progress.checkpoint.questionIndex).toBe(3);

  await post(`/api/admin/students/${created[0].id}/revoke`, {}, adminCookie);
  const rejected = await post('/api/student/login', { code: created[0].code });
  expect(rejected.status).toBe(401);
});
