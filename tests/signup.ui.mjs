/* Drives the real sign-up screen in a browser against the local stack. */
import { chromium } from 'playwright';

const BASE = process.env.VERA_APP || 'http://localhost:3000';

const results = [];
const check = (n, c, e) => results.push([c ? 'PASS' : 'FAIL', n, c ? '' : String(e ?? '')]);

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });

  // ---- the gate
  await page.waitForSelector('#alias', { timeout: 15000 });
  check('signed-out visitor gets the signup screen', await page.isVisible('#alias'));
  check('no header until signed in', !(await page.isVisible('.site-header')));

  const first = await page.inputValue('#alias');
  check('an alias is proposed', /^[A-Z][a-z]+ [A-Z]/.test(first), first);

  // the bug I fixed: alias must not change when something else re-renders
  await page.click('.seal-option:nth-child(3)');
  const afterSeal = await page.inputValue('#alias');
  check('alias survives changing the seal', afterSeal === first, `${first} -> ${afterSeal}`);
  check('seal selection is shown', await page.isVisible('.seal-option.selected'));

  await page.click('button[aria-label="Suggest another alias"]');
  const suggested = await page.inputValue('#alias');
  check('suggest another changes it', suggested !== first, `${first} -> ${suggested}`);

  // preview reflects what will be claimed
  const wanted = 'Iron Thicket ' + Math.floor(Math.random() * 8999 + 1000);
  await page.fill('#alias', wanted);
  check('preview shows the typed alias', (await page.textContent('.alias-preview strong')) === wanted);

  // email and password are now required
  await page.click('.auth-submit');
  await page.waitForTimeout(500);
  check('signup refuses a missing email',
    (await page.textContent('.auth-message'))?.includes('email'), await page.textContent('.auth-message'));

  const email = `ui-${Date.now().toString(36)}@vera.test`;
  await page.fill('#signup-email', email);
  await page.fill('#signup-password', '123');
  await page.click('.auth-submit');
  await page.waitForTimeout(500);
  check('signup refuses a short password',
    (await page.textContent('.auth-message'))?.includes('6 characters'), await page.textContent('.auth-message'));

  await page.fill('#signup-password', 'test-password');

  // alias is validated last, once the credentials are in
  await page.fill('#alias', 'x');
  await page.click('.auth-submit');
  await page.waitForTimeout(500);
  check('signup refuses a too-short alias',
    (await page.textContent('.auth-message'))?.includes('3 to 64'), await page.textContent('.auth-message'));
  check('still on the signup screen', await page.isVisible('#alias'));
  await page.fill('#alias', wanted);

  // ---- create the account
  await page.click('.auth-submit');
  await page.waitForSelector('.site-header', { timeout: 20000 });
  check('claiming signs you in and reveals the app', await page.isVisible('.site-header'));
  check('header shows the chosen alias',
    (await page.textContent('.profile-pill strong')) === wanted, await page.textContent('.profile-pill strong'));
  check('briefing renders seeded reporting', (await page.locator('.feed-story h2').count()) === 1);
  check('three more reports listed', (await page.locator('.feed-note').count()) === 3);

  // ---- badge gating, the thing that was asserting something false before
  const verifiedOnFeed = await page.locator('.feed-story header svg').count();
  check('seeded reporter keeps its verified mark', verifiedOnFeed >= 1, String(verifiedOnFeed));

  await page.goto(BASE + '/profile', { waitUntil: 'networkidle' });
  check('own profile shows the alias', (await page.textContent('.profile-heading h1')) === wanted);
  check('own profile has no verified badge', (await page.locator('.profile-heading .status-badge').count()) === 0);
  check('profile explains why not verified',
    (await page.textContent('.unverified-note'))?.includes('Not verified'));
  check('account card shows the sign-in email',
    (await page.textContent('.account-card h2'))?.includes(email),
    (await page.textContent('.account-card h2')));
  check('ordinary account gets no admin panel', (await page.locator('.admin-panel').count()) === 0);

  // ---- session survives a reload
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.profile-heading h1', { timeout: 15000 });
  check('session survives a reload', (await page.textContent('.profile-heading h1')) === wanted);

  // ---- publishing as a brand new account
  await page.goto(BASE + '/write', { waitUntil: 'networkidle' });
  const headline = 'A first report from the signup check ' + Math.floor(Math.random() * 8999 + 1000);
  await page.fill('#headline', headline);
  await page.fill('#story', 'Opening paragraph of the filing.\n> A line worth pulling out.\nClosing paragraph.');
  await page.click('.publish-panel .button-accent');
  await page.waitForURL(/\/articles\//, { timeout: 20000 });
  check('publishing lands on the article', page.url().includes('/articles/'));
  check('article shows the headline',
    (await page.textContent('h1'))?.includes('A first report'), await page.textContent('h1'));
  check('slug derived from the headline', page.url().includes('a-first-report-from-the-signup-check'), page.url());
  check('pull quote rendered', (await page.locator('.article-body blockquote').count()) === 1);
  check('two paragraphs rendered', (await page.locator('.article-body p').count()) === 2);
  check('own article offers unpublish', await page.isVisible('.owner-actions'));
  check('new author has no badge on their article',
    (await page.locator('article header .status-badge').count()) === 0);

  // ---- following
  // go to a seeded reporter's article, not our own (ours is now the newest)
  await page.goto(BASE + '/articles/the-night-shift-keeping-the-city-online', { waitUntil: 'networkidle' });
  await page.waitForSelector('.follow-button', { timeout: 15000 });
  check('follow button offered on another byline', await page.isVisible('.follow-button'));
  await page.click('.follow-button');
  await page.waitForTimeout(1500);
  check('follow toggles to Following',
    (await page.textContent('.follow-button'))?.trim() === 'Following', await page.textContent('.follow-button'));

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.click('.feed-filter button:nth-child(3)');
  await page.waitForTimeout(700);
  const followingCount = await page.locator('.feed-story, .feed-note').count();
  check('Following filter narrows the feed', followingCount >= 1 && followingCount < 4, String(followingCount));

  // ---- sign out returns to the gate
  await page.goto(BASE + '/profile', { waitUntil: 'networkidle' });
  await page.click('.account-card .secondary-button');
  await page.waitForSelector('#alias', { timeout: 20000 });
  check('sign out returns to the signup screen', await page.isVisible('#alias'));
  check('header hidden again after sign out', !(await page.isVisible('.site-header')));

  // ---- the admin account signs in and can verify
  await page.click('.auth-alt button');            // switch to sign in
  await page.waitForSelector('#email', { timeout: 10000 });
  await page.fill('#email', 'admin@vera.test');
  await page.fill('#password', 'vera-admin-2026');
  await page.click('.auth-submit');
  await page.waitForSelector('.site-header', { timeout: 20000 });
  check('admin can sign in through the UI',
    (await page.textContent('.profile-pill strong')) === 'Vera Desk', await page.textContent('.profile-pill strong'));

  await page.goto(BASE + '/profile', { waitUntil: 'networkidle' });
  check('admin sees the admin panel', await page.isVisible('.admin-panel'));
  check('admin panel lists bylines', (await page.locator('.admin-panel .profile-report').count()) >= 5,
    String(await page.locator('.admin-panel .profile-report').count()));

  const target = page.locator('.admin-panel .profile-report', { hasText: wanted });
  check('the new reporter is listed as unverified',
    (await target.locator('span').first().textContent()) === 'Unverified',
    await target.locator('span').first().textContent());
  await target.locator('button').click();
  await page.waitForTimeout(2000);
  const retarget = page.locator('.admin-panel .profile-report', { hasText: wanted });
  check('admin verifying a reporter sticks',
    (await retarget.locator('span').first().textContent()) === 'Verified',
    await retarget.locator('span').first().textContent());

  // and it shows up on their byline
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.click('.feed-filter button:nth-child(2)');
  await page.waitForTimeout(700);
  check('verified mark now appears for that reporter',
    (await page.locator('.feed-story header svg, .feed-note svg').count()) >= 1);

  check('no uncaught errors in the browser', errors.length === 0, errors.slice(0, 3).join(' | '));

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
