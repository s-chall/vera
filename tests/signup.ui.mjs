/* Drives the real /signup page in a browser against the local stack, once per
   account type, plus sign-in. */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.VERA_APP || 'http://localhost:3000';
const results = [];
const check = (n, c, e) => results.push([c ? 'PASS' : 'FAIL', n, c ? '' : String(e ?? '')]);
const uniq = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 999)}`;

// a tiny real PNG for the identity document upload
const DOC = join(tmpdir(), 'vera-id.png');
writeFileSync(DOC, Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'));

(async () => {
  const browser = await chromium.launch();

  async function fresh() {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    return { context, page, errors };
  }

  // ---------------------------------------------------------- signed out
  {
    const { context, page } = await fresh();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.auth-card', { timeout: 15000 });
    check('signed out lands on sign in', await page.isVisible('#email'));
    check('no header when signed out', !(await page.isVisible('.site-header')));
    await page.click('.auth-alt a');
    await page.waitForSelector('.signup-role-grid', { timeout: 10000 });
    check('sign in links to signup', page.url().includes('/signup'));
    check('three account types offered', (await page.locator('.signup-role-grid button').count()) === 3);
    const labels = await page.locator('.signup-role-grid strong').allTextContents();
    check('the three types are the right ones',
      labels.join(',') === 'Journalist,Media organisation,Funder', labels.join(','));
    await context.close();
  }

  // ---------------------------------------------------------- journalist
  let journalistAlias = '';
  {
    const { context, page, errors } = await fresh();
    await page.goto(BASE + '/signup', { waitUntil: 'networkidle' });
    await page.waitForSelector('.signup-role-grid', { timeout: 15000 });

    check('journalist is preselected',
      (await page.locator('.signup-role-grid button[aria-pressed="true"] strong').textContent()) === 'Journalist');
    check('journalist signup is two steps',
      (await page.textContent('.signup-progress span')) === 'Step 1 of 2',
      await page.textContent('.signup-progress span'));

    await page.fill('input[type=email]', `${uniq('reporter')}@example.com`);
    await page.fill('input[type=password]', 'short');
    await page.click('.signup-next');
    await page.waitForTimeout(400);
    // minLength=10 means the browser blocks submission before our handler runs
    const passwordValid = await page.$eval('input[type=password]', (el) => el.checkValidity());
    check('short password refused', passwordValid === false, 'field reported valid');
    check('short password keeps you on step one',
      (await page.textContent('.signup-progress span')) === 'Step 1 of 2',
      await page.textContent('.signup-progress span'));

    await page.fill('input[type=password]', 'a-long-enough-password');
    await page.click('.signup-next');
    await page.waitForSelector('.seal-picker', { timeout: 10000 });
    check('step two asks for a public alias', (await page.textContent('.signup-progress span')) === 'Step 2 of 2');

    journalistAlias = 'Dry Beacon ' + Math.floor(Math.random() * 8999 + 1000);
    await page.fill('.signup-step input[type=text]', journalistAlias);
    await page.click('.seal-option:nth-child(3)');
    await page.click('.signup-next');

    // Signing up signs you in, and the gate sends a journalist straight to
    // verification rather than through a dead-end confirmation screen.
    await page.waitForSelector('#cnp', { timeout: 30000 });
    check('journalist is prompted to verify right after signup', await page.isVisible('#cnp'));
    check('prompt says the document is deleted',
      (await page.textContent('.auth-card'))?.includes('deletes your document'), '');
    check('prompt says the cedula is not stored',
      (await page.textContent('.auth-card'))?.toLowerCase().includes('cédula'), '');
    check('verification can be skipped', await page.isVisible('.auth-alt button'));

    // a unique number per run, so repeated runs without a reset still work
    const cnp = String(20000 + Math.floor(Math.random() * 8000));
    await page.fill('#cnp', cnp);
    await page.setInputFiles('.signup-upload input[type=file]', DOC);
    await page.click('.auth-submit');
    // the prompt clears once the request is recorded
    await page.waitForSelector('#cnp', { state: 'detached', timeout: 30000 });
    check('verification prompt clears once submitted', !(await page.isVisible('#cnp')));

    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.site-header', { timeout: 20000 });
    check('journalist is in the app and no longer prompted',
      (await page.isVisible('.site-header')) && !(await page.isVisible('#cnp')), page.url());
    check('no uncaught errors during journalist signup', errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }

  // ---------------------------------------------------------- media org
  {
    const { context, page } = await fresh();
    await page.goto(BASE + '/signup', { waitUntil: 'networkidle' });
    await page.waitForSelector('.signup-role-grid', { timeout: 15000 });
    await page.locator('.signup-role-grid button').nth(1).click();
    check('media org flow is two steps',
      (await page.textContent('.signup-progress span')) === 'Step 1 of 2',
      await page.textContent('.signup-progress span'));

    await page.fill('input[type=email]', `${uniq('desk')}@gmail.com`);
    await page.waitForTimeout(1200);
    check('an unrecognised domain is flagged live', await page.isVisible('.signup-bad'),
      await page.textContent('.signup-field'));

    await page.fill('input[type=email]', `${uniq('desk')}@nytimes.com`);
    await page.waitForTimeout(1200);
    check('a recognised outlet is confirmed live', await page.isVisible('.signup-ok'));

    await page.fill('input[type=password]', 'a-long-enough-password');
    await page.click('.signup-next');
    await page.waitForSelector('.seal-picker', { timeout: 10000 });
    await page.fill('.signup-step input[type=text]', 'Desk ' + Math.floor(Math.random() * 8999 + 1000));
    await page.click('.signup-next');
    await page.waitForSelector('.signup-complete', { timeout: 30000 });
    check('media org account created', await page.isVisible('.signup-complete'));
    await page.click('.signup-complete button');
    await page.waitForTimeout(2500);
    check('a media org is never asked to verify a CNP', !(await page.isVisible('#cnp')));
    await context.close();
  }

  // ---------------------------------------------------------- funder
  {
    const { context, page } = await fresh();
    await page.goto(BASE + '/signup', { waitUntil: 'networkidle' });
    await page.waitForSelector('.signup-role-grid', { timeout: 15000 });
    await page.locator('.signup-role-grid button').nth(2).click();
    await page.fill('input[type=email]', `${uniq('backer')}@example.com`);
    await page.fill('input[type=password]', 'a-long-enough-password');
    await page.click('.signup-next');
    await page.waitForSelector('.seal-picker', { timeout: 10000 });
    await page.fill('.signup-step input[type=text]', 'Backer ' + Math.floor(Math.random() * 8999 + 1000));
    await page.click('.signup-next');
    await page.waitForSelector('.signup-complete', { timeout: 30000 });
    check('funder account created', await page.isVisible('.signup-complete'));
    check('funder is told the account is not active yet',
      (await page.textContent('.signup-complete p'))?.includes('contribution'),
      await page.textContent('.signup-complete p'));
    await context.close();
  }

  // ---------------------------------------------------------- sign in
  {
    const { context, page } = await fresh();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#email', { timeout: 15000 });
    await page.fill('#email', 'admin@vera.test');
    await page.fill('#password', 'vera-admin-2026');
    await page.click('.auth-submit');
    await page.waitForSelector('.site-header', { timeout: 25000 });
    check('admin can sign in', await page.isVisible('.site-header'));
    await context.close();
  }

  await browser.close();
  console.log(results.map((r) => r[0].padEnd(5) + r[1] + (r[2] ? '\n       ' + r[2] : '')).join('\n'));
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log(results.map((r) => r[0].padEnd(5) + r[1] + (r[2] ? '\n       ' + r[2] : '')).join('\n'));
  console.error('\nHARNESS ERROR after ' + results.length + ' checks: ' + e.message.split('\n')[0]);
  process.exit(1);
});
