/* Three account types, the media-domain gate, journalist verification, and
   the visibility rules that follow from account type. */
import { api, uniq, newAccount, profileOf, passwordGrant } from './helpers.mjs';

const ADMIN = { email: 'admin@vera.test', password: 'vera-admin-2026' };

const results = [];
const check = (n, c, e) => results.push([c ? 'PASS' : 'FAIL', n, c ? '' : String(e ?? '')]);


(async () => {
  // ---------- media organisation gate
  const badOrg = (await newAccount('media_org', { domain: 'gmail.com' })).signup;
  check('media_org rejected from a non-outlet domain',
    badOrg.status >= 400 && /recognised outlet/i.test(JSON.stringify(badOrg.data)),
    badOrg.status + ' ' + JSON.stringify(badOrg.data).slice(0, 120));

  const org = await newAccount('media_org', { domain: 'nytimes.com' });
  check('media_org accepted from an allowlisted domain', Boolean(org.token),
    JSON.stringify(org.signup.data).slice(0, 130));
  const orgProfile = org.token ? await profileOf(org.token, org.user.id) : null;
  check('media_org account carries the right type', orgProfile?.account_type === 'media_org', orgProfile?.account_type);

  const domainCheck = await api('/rest/v1/rpc/domain_is_media', { method: 'POST', body: { address: 'x@theguardian.com' } });
  check('domain_is_media recognises a seeded outlet', domainCheck.data === true, JSON.stringify(domainCheck.data));

  // ---------- funder
  const funder = await newAccount('funder');
  check('funder can create an account', Boolean(funder.token));
  const funderProfile = await profileOf(funder.token, funder.user.id);
  check('funder starts unfunded', funderProfile?.funding_confirmed_at === null, String(funderProfile?.funding_confirmed_at));
  const active = await api('/rest/v1/rpc/account_is_active', { token: funder.token, method: 'POST', body: { target: funderProfile.id } });
  check('funder account is inactive until funded', active.data === false, JSON.stringify(active.data));

  const selfFund = await api('/rest/v1/journalists?id=eq.' + funderProfile.id, {
    token: funder.token, method: 'PATCH', body: { funding_confirmed_at: new Date().toISOString() } });
  check('a funder cannot confirm their own funding', selfFund.status >= 400, selfFund.status);

  const selfPromote = await api('/rest/v1/journalists?id=eq.' + funderProfile.id, {
    token: funder.token, method: 'PATCH', body: { account_type: 'journalist' } });
  check('account_type cannot be changed after signup', selfPromote.status >= 400, selfPromote.status);

  // ---------- journalist + verification
  const jr = await newAccount('journalist');
  check('journalist can create an account', Boolean(jr.token));
  const jrToken = jr.token;
  const jrProfile = await profileOf(jrToken, jr.user.id);
  check('journalist starts unverified', jrProfile?.verified_at === null, String(jrProfile?.verified_at));

  // ---- CNP lookup against the live register
  const bogus = await api('/functions/v1/submit-verification', {
    token: jrToken, method: 'POST', body: { cnpNumber: '99999', cedula: 'V00000000' } });
  check('an invalid pair is refused by the register', bogus.status === 422 && bogus.data?.outcome === 'no_match',
    bogus.status + ' ' + JSON.stringify(bogus.data).slice(0, 130));

  const stillUnverified = await api('/rest/v1/bylines?select=verified_at&id=eq.' + jrProfile.id, { token: jrToken });
  check('a refused lookup leaves the byline unverified', stillUnverified.data?.[0]?.verified_at === null,
    JSON.stringify(stillUnverified.data));

  const malformed = await api('/functions/v1/submit-verification', {
    token: jrToken, method: 'POST', body: { cnpNumber: '12345', cedula: 'not-a-cedula' } });
  check('a malformed cédula is rejected before any request', malformed.status === 400, malformed.status);

  const notJournalist = await api('/functions/v1/submit-verification', {
    token: funder.token, method: 'POST', body: { cnpNumber: '12345', cedula: 'V12345678' } });
  check('a funder cannot submit CNP verification', notJournalist.status >= 400, notJournalist.status);

  // The real pair lives in .env.test, which is gitignored.
  const realCnp = process.env.VERA_TEST_CNP;
  const realCedula = process.env.VERA_TEST_CEDULA;
  if (realCnp && realCedula) {
    const second = await newAccount('journalist');
    const secondProfile = await profileOf(second.token, second.user.id);
    const good = await api('/functions/v1/submit-verification', {
      token: second.token, method: 'POST', body: { cnpNumber: realCnp, cedula: realCedula } });
    check('a real pair verifies against the register', good.status === 200 && good.data?.outcome === 'match',
      good.status + ' ' + JSON.stringify(good.data).slice(0, 130));
    const nowVerified = await api('/rest/v1/bylines?select=verified_at&id=eq.' + secondProfile.id, { token: second.token });
    check('a matched lookup verifies the byline', Boolean(nowVerified.data?.[0]?.verified_at),
      JSON.stringify(nowVerified.data));
    check('the affiliate name is never returned to the client',
      !JSON.stringify(good.data).match(/Nombre|Apellido/i), JSON.stringify(good.data).slice(0, 120));
  } else {
    console.log('  (skipping the live match test: set VERA_TEST_CNP and VERA_TEST_CEDULA in .env.test)');
  }

  const mine = await api('/rest/v1/verification_requests?select=*', { token: jrToken });
  check('applicant sees their own request', mine.data?.length === 1, JSON.stringify(mine.data).slice(0, 120));
  check('no cédula or legal name is stored',
    mine.data?.[0] && !('cedula' in mine.data[0]) && !('legal_name' in mine.data[0])
      && mine.data[0].document_path === null,
    Object.keys(mine.data?.[0] || {}).join(','));
  check('CNP stored only as a fingerprint',
    typeof mine.data?.[0]?.cnp_fingerprint === 'string' && !mine.data[0].cnp_fingerprint.includes('24165'),
    String(mine.data?.[0]?.cnp_fingerprint).slice(0, 40));

  const otherSees = await api('/rest/v1/verification_requests?select=*', { token: funder.token });
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
  const admin = await passwordGrant(ADMIN.email, ADMIN.password);
  const adminToken = admin.data.access_token;
  // With a decisive lookup, nothing waits for a human. The queue only fills
  // when the register is unreachable or answers in a shape we do not recognise.
  const queue = await api('/rest/v1/rpc/pending_verifications', { token: adminToken, method: 'POST', body: {} });
  check('a decisive lookup leaves nothing for a reviewer',
    Array.isArray(queue.data) && queue.data.length === 0, JSON.stringify(queue.data).slice(0, 140));

  const rejected = await api('/rest/v1/verification_requests?select=status,lookup_outcome,rejection_reason', { token: jrToken });
  check('the refused request records why', rejected.data?.[0]?.status === 'rejected'
    && rejected.data[0].lookup_outcome === 'no_match'
    && /did not match/i.test(rejected.data[0].rejection_reason || ''),
    JSON.stringify(rejected.data).slice(0, 160));

  // An admin can still verify by hand, for someone the register cannot settle.
  const byHand = await api('/rest/v1/rpc/set_verified', {
    token: adminToken, method: 'POST', body: { target: jrProfile.id, verified: true } });
  check('admin can still verify by hand', byHand.status === 200, byHand.status + ' ' + JSON.stringify(byHand.data).slice(0, 110));
  const handChecked = await api('/rest/v1/bylines?select=verified_at&id=eq.' + jrProfile.id, { token: jrToken });
  check('manual verification shows on the byline', Boolean(handChecked.data?.[0]?.verified_at), JSON.stringify(handChecked.data));

  const adminWallet = await api('/rest/v1/journalists?select=payout_address&id=eq.' + jrProfile.id, { token: adminToken });
  check('an admin still cannot read another reporter\'s wallet row',
    Array.isArray(adminWallet.data) && adminWallet.data.length === 0, JSON.stringify(adminWallet.data).slice(0, 110));

  // ---------- visibility follows account type
  const post = await api('/rest/v1/articles', { token: jrToken, method: 'POST', prefer: 'return=representation',
    body: { journalist_id: jrProfile.id, slug: uniq('filed'), title: 'Filed by a journalist',
            dek: 'Sensitive.', body: ['One paragraph.'], read_mins: 1, published_at: new Date().toISOString() } });
  check('journalist publishes', post.status === 201, post.status + ' ' + JSON.stringify(post.data).slice(0, 120));
  check('journalist work defaults to media_only', post.data?.[0]?.visibility === 'media_only', post.data?.[0]?.visibility);

  const slug = post.data?.[0]?.slug;
  const funderSees = await api('/rest/v1/articles?select=slug&slug=eq.' + slug, { token: funder.token });
  check('a funder cannot read journalist-only work', funderSees.data?.length === 0, JSON.stringify(funderSees.data));

  const orgSees = await api('/rest/v1/articles?select=slug&slug=eq.' + slug, { token: org.token });
  check('a media organisation can read it', orgSees.data?.length === 1, JSON.stringify(orgSees.data));

  const authorSees = await api('/rest/v1/articles?select=slug&slug=eq.' + slug, { token: jrToken });
  check('the author can read their own', authorSees.data?.length === 1, JSON.stringify(authorSees.data));

  // A media organisation's own piece is members-visible, so everyone sees it.
  const orgPost = await api('/rest/v1/articles', { token: org.token, method: 'POST', prefer: 'return=representation',
    body: { journalist_id: orgProfile.id, slug: uniq('desk'), title: 'From the desk',
            dek: 'Open to members.', body: ['One paragraph.'], read_mins: 1, published_at: new Date().toISOString() } });
  check('media_org work defaults to members', orgPost.data?.[0]?.visibility === 'members', orgPost.data?.[0]?.visibility);

  const funderSeesOrg = await api('/rest/v1/articles?select=slug&slug=eq.' + orgPost.data?.[0]?.slug, { token: funder.token });
  check('a funder sees members-visible work', funderSeesOrg.data?.length === 1, JSON.stringify(funderSeesOrg.data));

  // Consequence of the current rules, stated as a test so it cannot drift
  // unnoticed: every seeded reporter is a journalist, so a funder's feed is empty.
  const funderFeed = await api('/rest/v1/articles?select=slug', { token: funder.token });
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
