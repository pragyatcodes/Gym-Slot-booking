// Browser regression: run `npm install --no-save playwright`,
// `npx playwright install chromium`, start python app.py, then run:
// node tests/demo_login.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    for (const [blockStorage, stripAuthorization] of [[false, false], [true, false], [false, true], [true, true]]) {
      const context = await browser.newContext();
      if (blockStorage) {
        await context.addInitScript(() => {
          for (const name of ['localStorage', 'sessionStorage']) {
            Object.defineProperty(window, name, {
              get() { throw new DOMException('Storage denied', 'SecurityError'); },
            });
          }
        });
      }
      const page = await context.newPage();
      if (stripAuthorization) {
        await page.route('**/api/**', async route => {
          const headers = { ...route.request().headers() };
          delete headers.authorization;
          await route.continue({ headers });
        });
      }
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto((process.env.BASE_URL || 'http://localhost:3000') + '/login');
      let documentLoads = 0;
      page.on('domcontentloaded', () => documentLoads++);
      await page.locator('#demoMember').click();
      await page.waitForSelector('#sessionCards');
      assert.equal(await page.locator('.profile strong').innerText(), 'Alex Morgan');
      await page.locator('#topLogout').click();
      await page.waitForSelector('#demoAdmin');
      await page.locator('#demoAdmin svg').click();
      await page.waitForSelector('#createForm');
      assert.equal(await page.locator('.profile strong').innerText(), 'Studio Admin');
      assert.equal(documentLoads, 0, 'Demo switches must not reload the document');
      await page.locator('a[href="/sessions"]').click();
      await page.waitForSelector('#sessionCards');
      await page.goBack();
      await page.waitForSelector('#createForm');
      if (!blockStorage) {
        await page.reload();
        await page.waitForSelector('#createForm');
      }
      assert.deepEqual(errors, []);
      console.log(`PASS: member/admin login, icon click, no reload, back navigation${blockStorage ? ', storage denied' : ', persisted login'}${stripAuthorization ? ', Authorization stripped by proxy' : ''}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
