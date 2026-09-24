/* Shared test helpers.

   Email confirmation is currently off, so signup returns a session directly.
   If it is turned back on in config.toml, newAccount() collects the real
   confirmation mail from Mailpit and follows the link, so the suites keep
   working without edits. */
export const BASE = process.env.VERA_URL || 'http://127.0.0.1:54321';
export const KEY = process.env.VERA_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
export const MAIL = process.env.VERA_MAIL || 'http://127.0.0.1:54324';

export async function api(path, { token, method = 'GET', body, prefer, raw, contentType } = {}) {
  const headers = { apikey: KEY };
  if (contentType !== null) headers['Content-Type'] = contentType || 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(BASE + path, {
    method, headers,
    body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

export const uniq = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 9999)}`;

/** Pull the confirmation link GoTrue mailed to this address and follow it. */
export async function confirmEmail(address) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const list = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent('to:' + address)}`)
      .then((r) => r.json()).catch(() => null);
    const message = list?.messages?.[0];
    if (message) {
      const full = await fetch(`${MAIL}/api/v1/message/${message.ID}`).then((r) => r.json());
      const source = `${full.Text || ''} ${full.HTML || ''}`;
      const link = source.match(/https?:\/\/[^\s"'<>]*\/auth\/v1\/verify[^\s"'<>]*/);
      if (!link) throw new Error('confirmation mail had no verify link');
      const url = link[0].replace(/&amp;/g, '&');
      await fetch(url, { redirect: 'manual' });
      return true;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no confirmation mail arrived for ${address}`);
}

export const passwordGrant = (email, password) =>
  api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });

/** Sign up, confirm the mailbox, then sign in. Returns the session. */
export async function newAccount(accountType, { domain = 'example.com', password = 'a-long-enough-password' } = {}) {
  const email = `${uniq(accountType)}@${domain}`;
  const signup = await api('/auth/v1/signup', {
    method: 'POST',
    body: { email, password, data: { account_type: accountType } },
  });
  if (signup.status >= 400) return { email, signup, token: null };

  if (signup.data?.access_token) {
    return { email, signup, token: signup.data.access_token, user: signup.data.user, session: signup };
  }

  await confirmEmail(email);
  const session = await passwordGrant(email, password);
  return { email, signup, token: session.data?.access_token, user: session.data?.user, session };
}

export async function profileOf(token, userId) {
  for (let i = 0; i < 8; i += 1) {
    const r = await api('/rest/v1/journalists?select=*&owner_user_id=eq.' + userId, { token });
    if (r.data?.[0]) return r.data[0];
    await new Promise((res) => setTimeout(res, 250));
  }
  return null;
}
