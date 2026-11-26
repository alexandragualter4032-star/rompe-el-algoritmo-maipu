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

test('separación de cursos, modo sin guardado, colisión de alias y borrado completo', async () => {
  const adminLogin = await post('/api/admin/login', { key: 'test-admin-secret' });
  expect(adminLogin.status).toBe(200);
  const adminCookie = adminLogin.headers.get('set-cookie').split(';')[0];

  // Crear curso en modo sin guardado
  const createNoSave = await post('/api/admin/courses', {
    alias: '7B-SIN-GUARDAR-2026',
    saveMode: 'no_save',
    expireDays: 30,
    deleteDays: 45,
  }, adminCookie);
  expect(createNoSave.status).toBe(201);
  const { course: noSaveCourse } = await createNoSave.json();
  expect(noSaveCourse.saveMode).toBe('no_save');

  // Colisión de alias duplicado debe devolver 409
  const duplicateCourse = await post('/api/admin/courses', {
    alias: '7B-SIN-GUARDAR-2026',
    saveMode: 'no_save',
  }, adminCookie);
  expect(duplicateCourse.status).toBe(409);

  // Intentar generar códigos en un curso sin guardado debe fallar con 400
  const blockedCodes = await post('/api/admin/codes', {
    courseId: noSaveCourse.id,
    count: 2,
  }, adminCookie);
  expect(blockedCodes.status).toBe(400);

  // Activar guardado en el curso y generar códigos con etiqueta neutra forzada
  const enableSave = await post(`/api/admin/courses/${noSaveCourse.id}/mode`, {
    saveMode: 'save_to_resume',
  }, adminCookie);
  expect(enableSave.status).toBe(200);

  // Aunque envíen un nombre propio en prefix, el servidor lo sanitiza a 'Estudiante'
  const gen1 = await post('/api/admin/codes', {
    courseId: noSaveCourse.id,
    count: 2,
    prefix: 'Juan Perez',
  }, adminCookie);
  expect(gen1.status).toBe(201);
  const { created: batch1 } = await gen1.json();
  expect(batch1[0].label).toBe('Estudiante 1');
  expect(batch1[1].label).toBe('Estudiante 2');

  // Si se borra Estudiante 1 y se genera otro código, la secuencia sigue en Estudiante 3 sin repetir etiqueta
  await post(`/api/admin/students/${batch1[0].id}/delete`, {}, adminCookie);
  const gen2 = await post('/api/admin/codes', {
    courseId: noSaveCourse.id,
    count: 1,
  }, adminCookie);
  const { created: batch2 } = await gen2.json();
  expect(batch2[0].label).toBe('Estudiante 3');

  // Borrar el curso completo elimina también sus códigos y sesiones
  const delCourse = await fetch(`${base}/api/admin/courses/${noSaveCourse.id}`, {
    method: 'DELETE',
    headers: { cookie: adminCookie },
  });
  expect(delCourse.status).toBe(200);

  const loginAfterDelete = await post('/api/student/login', { code: batch2[0].code });
  expect(loginAfterDelete.status).toBe(401);
});
