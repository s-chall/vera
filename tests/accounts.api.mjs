/* Three account types, the media-domain gate, journalist verification, and
   the visibility rules that follow from account type. */
const BASE = process.env.VERA_URL || 'http://127.0.0.1:54321';
const KEY = process.env.VERA_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const ADMIN = { email: 'admin@vera.test', password: 'vera-admin-2026' };

const results = [];
const check = (n, c, e) => results.push([c ? 'PASS' : 'FAIL', n, c ? '' : String(e ?? '')]);

async function api(path, { token, method = 'GET', body, prefer, raw, contentType } = {}) {
  const headers = { apikey: KEY };
  if (contentType !== null) headers['Content-Type'] = contentType || 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

const signUp = (email, accountType) =>
  api('/auth/v1/signup', { method: 'POST', body: { email, password: 'test-password-long', data: { account_type: accountType } } });
const password = (email, pw) =>
  api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: pw } });
const uniq = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 999)}`;

const profileOf = async (token, userId) => {
  for (let i = 0; i < 8; i += 1) {
    const r = await api('/rest/v1/journalists?select=*&owner_user_id=eq.' + userId, { token });
    if (r.data?.[0]) return r.data[0];
    await new Promise((res) => setTimeout(res, 250));
  }
  return null;
};

(async () => {
  // ---------- media organisation gate
  const badOrg = await signUp(`${uniq('desk')}@gmail.com`, 'media_org');
  check('media_org rejected from a non-outlet domain',
    badOrg.status >= 400 && /recognised outlet/i.test(JSON.stringify(badOrg.data)),
    badOrg.status + ' ' + JSON.stringify(badOrg.data).slice(0, 120));

  const orgEmail = `${uniq('desk')}@nytimes.com`;
  const org = await signUp(orgEmail, 'media_org');
  check('media_org accepted from an allowlisted domain', Boolean(org.data?.access_token),
    JSON.stringify(org.data).slice(0, 130));
  const orgProfile = org.data?.access_token ? await profileOf(org.data.access_token, org.data.user.id) : null;
  check('media_org account carries the right type', orgProfile?.account_type === 'media_org', orgProfile?.account_type);

  const domainCheck = await api('/rest/v1/rpc/domain_is_media', { method: 'POST', body: { address: 'x@theguardian.com' } });
  check('domain_is_media recognises a seeded outlet', domainCheck.data === true, JSON.stringify(domainCheck.data));

  // ---------- funder
  const funder = await signUp(`${uniq('backer')}@example.com`, 'funder');
  check('funder can create an account', Boolean(funder.data?.access_token));
  const funderProfile = await profileOf(funder.data.access_token, funder.data.user.id);
  check('funder starts unfunded', funderProfile?.funding_confirmed_at === null, String(funderProfile?.funding_confirmed_at));
  const active = await api('/rest/v1/rpc/account_is_active', { token: funder.data.access_token, method: 'POST', body: { target: funderProfile.id } });
  check('funder account is inactive until funded', active.data === false, JSON.stringify(active.data));

  const selfFund = await api('/rest/v1/journalists?id=eq.' + funderProfile.id, {
    token: funder.data.access_token, method: 'PATCH', body: { funding_confirmed_at: new Date().toISOString() } });
  check('a funder cannot confirm their own funding', selfFund.status >= 400, selfFund.status);

  const selfPromote = await api('/rest/v1/journalists?id=eq.' + funderProfile.id, {
    token: funder.data.access_token, method: 'PATCH', body: { account_type: 'journalist' } });
  check('account_type cannot be changed after signup', selfPromote.status >= 400, selfPromote.status);

  // ---------- journalist + verification
  const jr = await signUp(`${uniq('reporter')}@example.com`, 'journalist');
  check('journalist can create an account', Boolean(jr.data?.access_token));
  const jrToken = jr.data.access_token;
  const jrProfile = await profileOf(jrToken, jr.data.user.id);
  check('journalist starts unverified', jrProfile?.verified_at === null, String(jrProfile?.verified_at));

  const docPath = `${jrProfile.id}/id-${Date.now().toString(36)}.png`;
  const upload = await api(`/storage/v1/object/verification-documents/${docPath}`, {
    token: jrToken, method: 'POST', contentType: 'image/png',
    raw: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  });
  check('journalist can upload to their own folder', upload.status === 200, upload.status + ' ' + JSON.stringify(upload.data).slice(0, 110));

  const foreign = await api(`/storage/v1/object/verification-documents/${orgProfile.id}/stolen.png`, {
    token: jrToken, method: 'POST', contentType: 'image/png', raw: new Uint8Array([1, 2, 3]) });
  check('cannot upload into another account\'s folder', foreign.status >= 400, foreign.status);

  const submit = await api('/functions/v1/submit-verification', {
    token: jrToken, method: 'POST', body: { cnpNumber: '24165', documentPath: docPath } });
  check('verification submitted', submit.status === 200, submit.status + ' ' + JSON.stringify(submit.data).slice(0, 130));

  const mine = await api('/rest/v1/verification_requests?select=*', { token: jrToken });
  check('applicant sees their own request', mine.data?.length === 1, JSON.stringify(mine.data).slice(0, 120));
  check('no legal name or cedula column exists',
    mine.data?.[0] && !('legal_name' in mine.data[0]) && !('cedula' in mine.data[0]),
    Object.keys(mine.data?.[0] || {}).join(','));
  check('CNP stored only as a fingerprint',
    typeof mine.data?.[0]?.cnp_fingerprint === 'string' && !mine.data[0].cnp_fingerprint.includes('24165'),
    String(mine.data?.[0]?.cnp_fingerprint).slice(0, 40));

  const otherSees = await api('/rest/v1/verification_requests?select=*', { token: funder.data.access_token });
  check('another account cannot see the request', otherSees.data?.length === 0, JSON.stringify(otherSees.data));

  const notAdminQueue = await api('/rest/v1/rpc/pending_verifications', { token: jrToken, method: 'POST', body: {} });
  check('a non-admin sees an empty review queue',
    Array.isArray(notAdminQueue.data) && notAdminQueue.data.length === 0, JSON.stringify(notAdminQueue.data).slice(0, 110));

  const notAdminDecide = await api('/functions/v1/review-verification', {
    token: jrToken, method: 'POST', body: { requestId: mine.data[0].id, approve: true } });
  check('a non-admin cannot decide', notAdminDecide.status >= 400, notAdminDecide.status);

  const rpcDirect = await api('/rest/v1/rpc/decide_verification', {
    token: jrToken, method: 'POST', body: { request_id: mine.data[0].id, approve: true } });
  check('decide_verification is not callable from a client', rpcDirect.status >= 400, rpcDirect.status);

  // ---------- admin review
  const admin = await password(ADMIN.email, ADMIN.password);
  const adminToken = admin.data.access_token;
  const queue = await api('/rest/v1/rpc/pending_verifications', { token: adminToken, method: 'POST', body: {} });
  check('admin sees the pending request', queue.data?.some((r) => r.journalist_id === jrProfile.id),
    JSON.stringify(queue.data).slice(0, 140));

  const adminReadsDoc = await api(`/storage/v1/object/verification-documents/${docPath}`, { token: adminToken });
  check('admin can read the document while pending', adminReadsDoc.status === 200, adminReadsDoc.status);

  const decide = await api('/functions/v1/review-verification', {
    token: adminToken, method: 'POST', body: { requestId: mine.data[0].id, approve: true } });
  check('admin approves', decide.status === 200, decide.status + ' ' + JSON.stringify(decide.data).slice(0, 130));

  const after = await api('/rest/v1/verification_requests?select=status,document_path', { token: jrToken });
  check('request is approved', after.data?.[0]?.status === 'approved', JSON.stringify(after.data));
  check('document reference is cleared', after.data?.[0]?.document_path === null, JSON.stringify(after.data));

  const docGone = await api(`/storage/v1/object/verification-documents/${docPath}`, { token: adminToken });
  check('the document itself is deleted', docGone.status >= 400, docGone.status);

  const nowVerified = await api('/rest/v1/bylines?select=verified_at&id=eq.' + jrProfile.id, { token: jrToken });
  check('journalist is now verified', Boolean(nowVerified.data?.[0]?.verified_at), JSON.stringify(nowVerified.data));

  // ---------- visibility follows account type
  const post = await api('/rest/v1/articles', { token: jrToken, method: 'POST', prefer: 'return=representation',
    body: { journalist_id: jrProfile.id, slug: uniq('filed'), title: 'Filed by a journalist',
            dek: 'Sensitive.', body: ['One paragraph.'], read_mins: 1, published_at: new Date().toISOString() } });
  check('journalist publishes', post.status === 201, post.status + ' ' + JSON.stringify(post.data).slice(0, 120));
  check('journalist work defaults to media_only', post.data?.[0]?.visibility === 'media_only', post.data?.[0]?.visibility);

  const slug = post.data?.[0]?.slug;
  const funderSees = await api('/rest/v1/articles?select=slug&slug=eq.' + slug, { token: funder.data.access_token });
  check('a funder cannot read journalist-only work', funderSees.data?.length === 0, JSON.stringify(funderSees.data));

  const orgSees = await api('/rest/v1/articles?select=slug&slug=eq.' + slug, { token: org.data.access_token });
  check('a media organisation can read it', orgSees.data?.length === 1, JSON.stringify(orgSees.data));

  const authorSees = await api('/rest/v1/articles?select=slug&slug=eq.' + slug, { token: jrToken });
  check('the author can read their own', authorSees.data?.length === 1, JSON.stringify(authorSees.data));

  // A media organisation's own piece is members-visible, so everyone sees it.
  const orgPost = await api('/rest/v1/articles', { token: org.data.access_token, method: 'POST', prefer: 'return=representation',
    body: { journalist_id: orgProfile.id, slug: uniq('desk'), title: 'From the desk',
            dek: 'Open to members.', body: ['One paragraph.'], read_mins: 1, published_at: new Date().toISOString() } });
  check('media_org work defaults to members', orgPost.data?.[0]?.visibility === 'members', orgPost.data?.[0]?.visibility);

  const funderSeesOrg = await api('/rest/v1/articles?select=slug&slug=eq.' + orgPost.data?.[0]?.slug, { token: funder.data.access_token });
  check('a funder sees members-visible work', funderSeesOrg.data?.length === 1, JSON.stringify(funderSeesOrg.data));

  // Consequence of the current rules, stated as a test so it cannot drift
  // unnoticed: every seeded reporter is a journalist, so a funder's feed is empty.
  const funderFeed = await api('/rest/v1/articles?select=slug', { token: funder.data.access_token });
  check('funders currently see only non-journalist work', funderFeed.data?.length === 1,
    'funder sees ' + funderFeed.data?.length + ' of ' + 6);

  report();
})().catch((e) => { console.error(e); report(); });

function report() {
  console.log(results.map((r) => r[0].padEnd(5) + r[1] + (r[2] ? '\n       ' + r[2] : '')).join('\n'));
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
  process.exit(failed ? 1 : 0);
}
