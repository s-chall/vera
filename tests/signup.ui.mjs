/* Drives the real /signup page in a browser against the local stack, once per
   account type, plus sign-in. */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';

if (existsSync(new URL('../.env.test', import.meta.url))) {
  for (const line of readFileSync(new URL('../.env.test', import.meta.url), 'utf8').split('\n')) {
    const [k, v] = line.split('=');
    if (k && v && !process.env[k.trim()]) process.env[k.trim()] = v.trim();
  }
}

const BASE = process.env.VERA_APP || 'http://localhost:3000';
const results = [];
const check = (n, c, e) => results.push([c ? 'PASS' : 'FAIL', n, c ? '' : String(e ?? '')]);
const uniq = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 999)}`;


const finish = () => {
  console.log(results.map((r) => r[0].padEnd(5) + r[1] + (r[2] ? '\n       ' + r[2] : '')).join('\n'));
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
  process.exit(failed ? 1 : 0);
};

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
    check('prompt asks for a cédula, not a document',
      (await page.isVisible('#cedula')) && (await page.locator('input[type=file]').count()) === 0);
    check('prompt says the cédula is not stored',
      (await page.textContent('.auth-card'))?.includes('never stored'), '');
    check('verification cannot be skipped',
      !(await page.textContent('.auth-card'))?.toLowerCase().includes('do this later'));
    check('signing out is the only way past it',
      (await page.textContent('.auth-alt button'))?.includes('Sign out'),
      await page.textContent('.auth-alt button'));

    await page.fill('#cnp', '12345');
    await page.fill('#cedula', 'nonsense');
    await page.click('.auth-submit');
    await page.waitForTimeout(600);
    check('a malformed cédula is caught before any request',
      (await page.textContent('.auth-message'))?.includes('V12345678'), await page.textContent('.auth-message'));

    // a pair the register will not recognise
    await page.fill('#cnp', '99999');
    await page.fill('#cedula', 'V00000000');
    await page.click('.auth-submit');
    await page.waitForTimeout(6000);
    check('the register refuses an unknown pair',
      (await page.textContent('.auth-message'))?.includes('do not match'), await page.textContent('.auth-message'));
    check('still prompted after a refusal', await page.isVisible('#cnp'));
    check('a refusal is explained',
      (await page.textContent('.auth-card'))?.includes('not recognised')
      || (await page.textContent('.auth-card'))?.includes('did not match'),
      (await page.textContent('h1')));

    // an unverified journalist cannot reach the app by navigating around it
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    check('an unverified journalist cannot reach the news page', await page.isVisible('#cnp'), page.url());
    await page.goto(BASE + '/write', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    check('an unverified journalist cannot reach the editor', await page.isVisible('#cnp'), page.url());

    const realCnp = process.env.VERA_TEST_CNP;
    const realCedula = process.env.VERA_TEST_CEDULA;
    if (!realCnp || !realCedula) {
      console.log('  (skipping the live match: set VERA_TEST_CNP and VERA_TEST_CEDULA in .env.test)');
      await context.close();
      return finish();
    }
    await page.fill('#cnp', realCnp);
    await page.fill('#cedula', realCedula);
    await page.click('.auth-submit');
    await page.waitForSelector('#cnp', { state: 'detached', timeout: 30000 });
    check('verification prompt clears once submitted', !(await page.isVisible('#cnp')));

    // A verified journalist must land in the app, not back on the signup form.
    await page.waitForURL((url) => !url.pathname.startsWith('/signup'), { timeout: 20000 });
    await page.waitForSelector('.site-header', { timeout: 20000 });
    check('verifying leaves the signup route', !page.url().includes('/signup'), page.url());
    check('the signup form is not shown again', !(await page.isVisible('.signup-role-grid')));
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

  // ------------------------------------------------- errors read as errors
  {
    const { context, page } = await fresh();
    const RED = 'rgb(193, 39, 29)';
    const GREEN = 'rgb(23, 107, 80)';
    const colour = (sel) => page.$eval(sel, (el) => getComputedStyle(el).color);

    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#email', { timeout: 15000 });
    await page.click('.auth-submit');
    await page.waitForSelector('.auth-message', { timeout: 8000 });
    check('sign-in validation error is red', (await colour('.auth-message')) === RED, await colour('.auth-message'));

    await page.fill('#email', 'journalist@vera.test');
    await page.fill('#password', 'definitely-wrong');
    await page.click('.auth-submit');
    await page.waitForTimeout(3000);
    check('a rejected sign-in is red', (await colour('.auth-message')) === RED, await colour('.auth-message'));

    await page.goto(BASE + '/signup', { waitUntil: 'networkidle' });
    await page.waitForSelector('.signup-role-grid', { timeout: 15000 });
    await page.locator('.signup-role-grid button').nth(1).click();
    await page.fill('input[type=email]', 'someone@gmail.com');
    await page.waitForTimeout(1600);
    check('an unrecognised outlet is red', (await colour('.signup-bad')) === RED, await colour('.signup-bad'));
    await page.fill('input[type=email]', 'desk@nytimes.com');
    await page.waitForTimeout(1600);
    check('a recognised outlet is green', (await colour('.signup-ok')) === GREEN, await colour('.signup-ok'));

    await page.fill('input[type=password]', 'a-long-enough-password');
    await page.fill('input[type=email]', 'someone@gmail.com');
    await page.waitForTimeout(1200);
    await page.click('.signup-next');
    await page.waitForTimeout(1200);
    check('a refused signup is red', (await colour('.signup-message')) === RED, await colour('.signup-message'));

    // and a success is not red
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#email', { timeout: 15000 });
    await page.fill('#email', 'funder@vera.test');
    await page.fill('#password', 'vera-demo-2026');
    await page.click('.auth-submit');
    await page.waitForSelector('.site-header', { timeout: 25000 });
    await page.goto(BASE + '/profile', { waitUntil: 'networkidle' });
    await page.click('.journalist-settings');
    await page.waitForSelector('.auth-message', { timeout: 15000 });
    check('a success message is green, not red', (await colour('.auth-message')) === GREEN, await colour('.auth-message'));
    await context.close();
  }

  // ---------------------------------------------------------- profile page
  for (const [email, alias, type, hasArticles] of [
    ['journalist@vera.test', 'Ash Meridian', 'Journalist', true],
    ['desk@nytimes.com', 'Times Desk', 'Media organisation', true],
    ['funder@vera.test', 'Quiet Backer', 'Funder', false],
  ]) {
    const { context, page } = await fresh();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#email', { timeout: 15000 });
    await page.fill('#email', email);
    await page.fill('#password', 'vera-demo-2026');
    await page.click('.auth-submit');
    await page.waitForSelector('.site-header', { timeout: 25000 });
    await page.goto(BASE + '/profile', { waitUntil: 'networkidle' });
    await page.waitForSelector('.journalist-profile-header', { timeout: 15000 });

    check(`profile shows the signed-in alias (${type})`,
      (await page.textContent('.journalist-name-line h1'))?.trim() === alias,
      await page.textContent('.journalist-name-line h1'));
    check(`profile shows the account type (${type})`,
      (await page.textContent('.journalist-handle'))?.includes(type),
      await page.textContent('.journalist-handle'));
    check(`profile shows the sign-in email (${type})`,
      (await page.textContent('.profile-email'))?.trim() === email,
      await page.textContent('.profile-email'));
    check(`profile has no dummy BTC balance (${type})`,
      !(await page.textContent('.profile-summary'))?.includes('BTC'),
      (await page.textContent('.profile-summary'))?.slice(0, 80));
    check(`articles section matches the type (${type})`,
      (await page.isVisible('.profile-work')) === hasArticles);
    check(`profile offers sign out (${type})`,
      (await page.textContent('.journalist-settings'))?.includes('Sign out'));
    if (type !== 'Journalist') {
      check(`no verification badge for a ${type}`,
        !(await page.textContent('.journalist-name-line'))?.includes('Not verified'),
        await page.textContent('.journalist-name-line'));
    }
    await context.close();
  }

  // ------------------------------------------- signed in, visiting /signup
  {
    const { context, page } = await fresh();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#email', { timeout: 15000 });
    await page.fill('#email', 'funder@vera.test');
    await page.fill('#password', 'vera-demo-2026');
    await page.click('.auth-submit');
    await page.waitForSelector('.site-header', { timeout: 25000 });
    await page.goto(BASE + '/signup', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    check('an existing account is redirected away from signup',
      !page.url().includes('/signup') && !(await page.isVisible('.signup-role-grid')), page.url());
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
