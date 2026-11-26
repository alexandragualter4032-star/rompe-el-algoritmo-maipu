import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chromium } from 'playwright-core';

let browser;
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173';

beforeAll(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/chromium',
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});
afterAll(async () => { await browser?.close(); });

test('la prueba abre el nivel con retrato y reproductor oficial', async () => {
  const page = await browser.newPage();
  await page.goto(base);
  await page.getByRole('button', { name: /Probar el juego/ }).click();
  await page.getByRole('button', { name: /Jugar nivel 1/ }).click();
  await page.getByRole('button', { name: 'Iniciar nivel' }).click();
  expect(await page.locator('.option-btn').count()).toBe(4);
  expect(await page.locator('.dvd-face-img').getAttribute('src')).toContain('akrilla_retrato.jpg');
  expect(await page.locator('.album-cover-img').getAttribute('src')).toContain('akrilla_epistolares.jpg');
  const playerUrl = await page.locator('.level-media-player iframe').getAttribute('src');
  expect(playerUrl).toContain('-BDQEPBs7J0');
  expect(playerUrl).toContain('autoplay=1');
  await page.close();
});
