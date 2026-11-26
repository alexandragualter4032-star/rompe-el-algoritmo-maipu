import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { QUESTIONS } from '../src/data/questions.js';

const dataDir = mkdtempSync(join(tmpdir(), 'rompe-flow-'));
const base = 'http://127.0.0.1:5184';
let server;
let browser;

beforeAll(async () => {
  server = Bun.spawn(['bun', 'server.ts'], {
    cwd: join(import.meta.dir, '..'),
    env: { ...Bun.env, PORT: '5184', DATA_DIR: dataDir, ADMIN_KEY: 'test-admin-secret' },
    stdout: 'ignore', stderr: 'ignore',
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`${base}/api/me`)).ok) break; } catch { /* espera */ }
    await Bun.sleep(50);
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/chromium',
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});

afterAll(async () => {
  await browser?.close();
  server?.kill();
  await server?.exited;
  rmSync(dataDir, { recursive: true, force: true });
});

test('docente genera código; estudiante retoma pregunta 2', async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(4000);
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Docente / administración' }).click();
  await page.getByLabel('Código de administración').fill('test-admin-secret');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('heading', { name: 'Panel docente' }).waitFor();

  await page.getByLabel('Cantidad').fill('1');
  await page.getByRole('button', { name: 'Generar códigos' }).click();
  const code = await page.locator('.created-codes code').first().textContent();
  expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);

  await page.getByRole('button', { name: 'Probar nivel' }).click();
  await page.getByRole('button', { name: 'Iniciar nivel' }).click();
  expect(await page.locator('.option-btn').count()).toBe(4);
  await page.getByRole('button', { name: /Menú/ }).click();
  await page.getByRole('button', { name: /Volver al panel/ }).click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();

  await page.getByLabel('Código individual de estudiante').fill(code);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('button', { name: /Jugar nivel 1/ }).click();
  await page.getByRole('button', { name: 'Iniciar nivel' }).click();
  await page.getByRole('button', { name: /Porque demuestra que el talento urbano/ }).click();
  await page.getByText('Desafío 2 de 5').waitFor();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Retomar AKRIILA/ }).click();
  await page.getByRole('button', { name: 'Seguir jugando' }).click();
  expect(await page.getByText('Desafío 2 de 5').count()).toBe(1);
  expect(QUESTIONS.akrilla).toHaveLength(5);
  await page.close();
});
