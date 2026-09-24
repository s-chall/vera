/* Accounts are required. Verifies that nothing is readable without one, that
   anonymous sessions are refused, and that the admin account works. */
const BASE = process.env.VERA_URL || 'http://127.0.0.1:54321';
const KEY = process.env.VERA_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const ADMIN = { email: 'admin@vera.test', password: 'vera-admin-2026' };

const results = [];
const check = (n, c, e) => results.push([c ? 'PASS' : 'FAIL', n, c ? '' : String(e ?? '')]);

async function api(path, { token, method = 'GET', body, prefer } = {}) {
  const headers = { apikey: KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

const password = async (email, pw) =>
  api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: pw } });

const newAccount = async () => {
  const email = `check-${Date.now().toString(36)}-${Math.floor(Math.random() * 999)}@vera.test`;
  const r = await api('/auth/v1/signup', { method: 'POST', body: { email, password: 'test-password' } });
  return { email, token: r.data?.access_token, user: r.data?.user, raw: r };
};

const profileOf = async (token, userId) => {
  for (let i = 0; i < 6; i += 1) {
    const r = await api('/rest/v1/journalists?select=*&owner_user_id=eq.' + userId, { token });
    if (r.data?.[0]) return r.data[0];
    await new Promise((res) => setTimeout(res, 250));
  }
  return null;
};

(async () => {
  // ---- closed to anyone without an account
  const anonBylines = await api('/rest/v1/bylines?select=*');
  check('bylines unreadable without an account', anonBylines.status >= 400, anonBylines.status + ' ' + JSON.stringify(anonBylines.data).slice(0, 90));
  const anonArticles = await api('/rest/v1/articles?select=*');
  check('articles unreadable without an account',
    anonArticles.status >= 400 || (Array.isArray(anonArticles.data) && anonArticles.data.length === 0),
    anonArticles.status + ' n=' + (anonArticles.data?.length));
  const anonLedger = await api('/rest/v1/public_payout_ledger?select=*');
  check('payout ledger unreadable without an account', anonLedger.status >= 400, anonLedger.status);

  // ---- anonymous sessions are gone
  const anonSignup = await api('/auth/v1/signup', { method: 'POST', body: {} });
  check('anonymous sign-in refused', anonSignup.status >= 400 && anonSignup.data?.error_code === 'anonymous_provider_disabled',
    anonSignup.status + ' ' + JSON.stringify(anonSignup.data).slice(0, 110));

  // ---- the admin account
  const admin = await password(ADMIN.email, ADMIN.password);
  check('admin can sign in', Boolean(admin.data?.access_token), JSON.stringify(admin.data).slice(0, 140));
  if (!admin.data?.access_token) return report();
  const adminToken = admin.data.access_token;

  const wrongPw = await password(ADMIN.email, 'not-the-password');
  check('admin rejects a wrong password', wrongPw.status >= 400, wrongPw.status);

  const adminProfile = await profileOf(adminToken, admin.data.user.id);
  check('admin has a byline', adminProfile?.public_alias === 'Vera Desk', adminProfile?.public_alias);
  check('admin is flagged as admin', adminProfile?.is_admin === true, String(adminProfile?.is_admin));

  const adminSees = await api('/rest/v1/bylines?select=public_alias', { token: adminToken });
  check('a signed-in account can read bylines', adminSees.status === 200 && adminSees.data.length >= 5,
    adminSees.status + ' n=' + (adminSees.data?.length));
  const adminArticles = await api('/rest/v1/articles?select=slug', { token: adminToken });
  check('a signed-in account can read articles', adminArticles.data?.length === 4, 'n=' + adminArticles.data?.length);

  // ---- an ordinary signup
  const a = await newAccount();
  check('email signup works', Boolean(a.token), JSON.stringify(a.raw.data).slice(0, 140));
  if (!a.token) return report();
  const mine = await profileOf(a.token, a.user.id);
  check('signup mints a byline', Boolean(mine), JSON.stringify(mine));
  check('new account is unverified', mine.verified_at === null, String(mine.verified_at));
  check('new account is not admin', mine.is_admin === false, String(mine.is_admin));

  const wanted = 'Salt Beacon ' + Math.floor(Math.random() * 8999 + 1000);
  const claim = await api('/rest/v1/journalists?id=eq.' + mine.id, { token: a.token, method: 'PATCH',
    prefer: 'return=representation', body: { public_alias: wanted, seal: 'seal-c' } });
  check('can claim an alias', claim.data?.[0]?.public_alias === wanted, claim.status + ' ' + JSON.stringify(claim.data).slice(0, 120));

  const dupe = await api('/rest/v1/journalists?id=eq.' + mine.id, { token: a.token, method: 'PATCH', body: { public_alias: 'Northstar' } });
  check('a taken alias is refused', dupe.status >= 400, dupe.status);

  // ---- privilege boundaries
  const selfVerify = await api('/rest/v1/journalists?id=eq.' + mine.id, { token: a.token, method: 'PATCH',
    body: { verified_at: new Date().toISOString() } });
  check('an ordinary account cannot self-verify', selfVerify.status >= 400, selfVerify.status + ' ' + JSON.stringify(selfVerify.data).slice(0, 110));

  const selfPromote = await api('/rest/v1/journalists?id=eq.' + mine.id, { token: a.token, method: 'PATCH',
    body: { is_admin: true } });
  check('an ordinary account cannot make itself admin', selfPromote.status >= 400, selfPromote.status + ' ' + JSON.stringify(selfPromote.data).slice(0, 110));
  const stillPlain = await api('/rest/v1/journalists?select=is_admin&id=eq.' + mine.id, { token: a.token });
  check('is_admin unchanged after the attempt', stillPlain.data?.[0]?.is_admin === false, JSON.stringify(stillPlain.data));

  // ---- the admin can do what nobody else can
  const notAdminVerify = await api('/rest/v1/rpc/set_verified', { token: a.token, method: 'POST',
    body: { target: mine.id, verified: true } });
  check('a non-admin cannot call set_verified', notAdminVerify.status >= 400,
    notAdminVerify.status + ' ' + JSON.stringify(notAdminVerify.data).slice(0, 110));

  const verify = await api('/rest/v1/rpc/set_verified', { token: adminToken, method: 'POST',
    body: { target: mine.id, verified: true } });
  check('admin can verify a reporter', verify.status === 200, verify.status + ' ' + JSON.stringify(verify.data).slice(0, 120));
  const nowVerified = await api('/rest/v1/bylines?select=verified_at&id=eq.' + mine.id, { token: a.token });
  check('verification is visible on the byline', Boolean(nowVerified.data?.[0]?.verified_at), JSON.stringify(nowVerified.data));

  const unverify = await api('/rest/v1/rpc/set_verified', { token: adminToken, method: 'POST',
    body: { target: mine.id, verified: false } });
  check('admin can remove verification', unverify.status === 200, unverify.status);
  const nowPlain = await api('/rest/v1/bylines?select=verified_at&id=eq.' + mine.id, { token: a.token });
  check('verification removal is visible', nowPlain.data?.[0]?.verified_at === null, JSON.stringify(nowPlain.data));

  const adminWallet = await api('/rest/v1/journalists?select=payout_address&id=eq.' + mine.id, { token: adminToken });
  check('an admin still cannot read another reporter\'s wallet row',
    Array.isArray(adminWallet.data) && adminWallet.data.length === 0, JSON.stringify(adminWallet.data).slice(0, 110));

  // ---- isolation between accounts still holds
  const b = await newAccount();
  if (!b.token) { check('second account for isolation checks', false, 'signup failed'); return report(); }
  const mineB = await profileOf(b.token, b.user.id);
  const northstar = (adminSees.data || []).find((x) => x.public_alias === 'Northstar');
  const nsId = (await api('/rest/v1/bylines?select=id&public_alias=eq.Northstar', { token: a.token })).data?.[0]?.id;
  check('seeded reporters visible to members', Boolean(nsId && northstar));

  await api('/rest/v1/follows', { token: a.token, method: 'POST', body: { follower_id: mine.id, author_id: nsId } });
  const followsB = await api('/rest/v1/follows?select=*', { token: b.token });
  check('one account cannot see another\'s follows', followsB.data?.length === 0, JSON.stringify(followsB.data));

  // Publishing needs a verified journalist account, so a fresh signup is refused.
  const post = await api('/rest/v1/articles', { token: a.token, method: 'POST', prefer: 'return=representation',
    body: { journalist_id: mine.id, slug: 'members-only-check-' + Date.now().toString(36), title: 'Members only check',
            dek: 'From the suite.', body: ['One paragraph.'], art: 'paper', category: 'Filed', read_mins: 1,
            published_at: new Date().toISOString() } });
  check('an unverified account cannot publish', post.status === 403, post.status + ' ' + JSON.stringify(post.data).slice(0, 110));

  // The seeded, verified journalist can.
  const verified = await password('journalist@vera.test', 'vera-demo-2026');
  const verifiedId = (await api('/rest/v1/journalists?select=id', { token: verified.data.access_token })).data?.[0]?.id;
  const okPost = await api('/rest/v1/articles', { token: verified.data.access_token, method: 'POST', prefer: 'return=representation',
    body: { journalist_id: verifiedId, slug: 'verified-check-' + Date.now().toString(36), title: 'Verified check',
            dek: 'From the suite.', body: ['One paragraph.'], read_mins: 1, published_at: new Date().toISOString() } });
  check('a verified journalist can publish', okPost.status === 201, okPost.status + ' ' + JSON.stringify(okPost.data).slice(0, 110));
  if (okPost.data?.[0]?.id) {
    await api('/rest/v1/articles?id=eq.' + okPost.data[0].id, { token: verified.data.access_token, method: 'DELETE' });
  }

  const forge = await api('/rest/v1/articles', { token: b.token, method: 'POST',
    body: { journalist_id: mineB.id === mine.id ? mineB.id : mine.id, slug: 'forge-' + Date.now().toString(36), title: 'Forged', read_mins: 1 } });
  check('cannot publish under another byline', forge.status >= 400, forge.status);

  const anonArticleAfter = await api('/rest/v1/articles?select=slug');
  check('published work still invisible to non-members',
    anonArticleAfter.status >= 400 || anonArticleAfter.data?.length === 0, 'n=' + anonArticleAfter.data?.length);

  report();
})().catch((e) => { console.error(e); report(); });

function report() {
  console.log(results.map((r) => r[0].padEnd(5) + r[1] + (r[2] ? '\n       ' + r[2] : '')).join('\n'));
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
  process.exit(failed ? 1 : 0);
}
