/* ============================================================
   /api/auth/*  — registration and sign-in
   Three routes in: phone + passcode, verified email, Google.
   A buyer may register and browse freely, but cannot ORDER until
   Mirza Javaid Iqbal approves the account.
   Sellers never self-register — they redeem an invite code.
   ============================================================ */
import {
  pgGet, pgInsert, pgPatch, json, fail, configured,
  hashPasscode, verifyPasscode, passcodeProblem,
  tooManyAttempts, recordAttempt, clientIp,
  normalisePhone, issueToken, setCookie, clearCookie,
  currentAccount, publicAccount, verifyGoogleIdToken, GOOGLE_CLIENT_ID,
  ADMIN_PHONES, sha256
} from '../lib/core.js';
import { randomBytes } from 'node:crypto';

const ACCT_COLS = 'id,role,phone,email,name,business_name,city,lang,status,trust_tier,' +
                  'orders_completed,can_order,approved_at,email_verified_at,' +
                  'passcode_hash,passcode_salt,locked_until,failed_attempts';

const isAdminPhone = p => ADMIN_PHONES.includes(p);

async function findByPhone(phone) {
  const r = await pgGet(`accounts?select=${ACCT_COLS}&phone=eq.${encodeURIComponent(phone)}&limit=1`);
  return r && r[0];
}
async function findByEmail(email) {
  const r = await pgGet(`accounts?select=${ACCT_COLS}&email=eq.${encodeURIComponent(email)}&limit=1`);
  return r && r[0];
}

function signedIn(account, extra = {}) {
  const token = issueToken(account.id);
  return json({ ok:true, account: publicAccount(account), ...extra },
    200, { 'set-cookie': setCookie(token) });
}

/* ---------------- REGISTER (buyer, phone + passcode) ---------------- */
async function register(request, body) {
  const phone = normalisePhone(body.phone);
  if (!phone || phone.length < 11) return fail('bad_phone');

  const problem = passcodeProblem(body.passcode);
  if (problem) return fail('weak_passcode', 400, { problem });

  if (!body.name || String(body.name).trim().length < 2) return fail('name_required');

  const existing = await findByPhone(phone);
  if (existing) return fail('phone_taken', 409);

  // The father's own number becomes admin automatically, and admin can order.
  const admin = isAdminPhone(phone);
  const { hash, salt } = await hashPasscode(body.passcode);

  const rows = await pgInsert('accounts', [{
    role: admin ? 'admin' : 'buyer',
    phone,
    email: body.email ? String(body.email).trim().toLowerCase() : null,
    name: String(body.name).trim(),
    business_name: body.business_name ? String(body.business_name).trim() : null,
    city: body.city ? String(body.city).trim() : null,
    lang: ['ur','en','zh'].includes(body.lang) ? body.lang : 'ur',
    passcode_hash: hash,
    passcode_salt: salt,
    status: 'active',
    can_order: admin,
    approved_at: admin ? new Date().toISOString() : null
  }]);

  const a = rows && rows[0];
  if (!a) return fail('create_failed', 500);
  await recordAttempt(phone, 'register', true, clientIp(request));
  return signedIn(a, { awaiting_approval: !a.can_order });
}

/* ---------------- LOGIN (phone + passcode) ---------------- */
async function login(request, body) {
  const phone = normalisePhone(body.phone);
  if (!phone) return fail('bad_phone');
  const ip = clientIp(request);

  if (await tooManyAttempts(phone, 'login')) {
    return fail('too_many_attempts', 429);
  }

  const a = await findByPhone(phone);
  // Same generic answer whether the account exists or the passcode is wrong,
  // so this endpoint cannot be used to enumerate customers.
  const bad = async () => {
    await recordAttempt(phone, 'login', false, ip);
    return fail('bad_credentials', 401);
  };
  if (!a) return bad();
  if (a.locked_until && new Date(a.locked_until) > new Date()) return fail('locked', 423);
  if (a.status !== 'active') return fail('account_disabled', 403);

  const ok = await verifyPasscode(body.passcode, a.passcode_hash, a.passcode_salt);
  if (!ok) {
    const n = (a.failed_attempts || 0) + 1;
    await pgPatch(`accounts?id=eq.${a.id}`, {
      failed_attempts: n,
      locked_until: n >= 10 ? new Date(Date.now() + 15 * 60000).toISOString() : null
    });
    return bad();
  }

  await pgPatch(`accounts?id=eq.${a.id}`, {
    failed_attempts: 0, locked_until: null, last_login_at: new Date().toISOString()
  });
  await recordAttempt(phone, 'login', true, ip);
  return signedIn(a, { awaiting_approval: !a.can_order && a.role === 'buyer' });
}

/* ---------------- GOOGLE ---------------- */
async function google(request, body) {
  if (!GOOGLE_CLIENT_ID) return fail('google_not_configured', 503);
  let g;
  try {
    g = await verifyGoogleIdToken(body.credential, GOOGLE_CLIENT_ID);
  } catch (e) {
    await recordAttempt('google', 'google', false, clientIp(request));
    return fail('google_rejected', 401, { detail: String(e.message).slice(0, 80) });
  }

  let rows = await pgGet(`accounts?select=${ACCT_COLS}&google_sub=eq.${encodeURIComponent(g.sub)}&limit=1`);
  let a = rows && rows[0];

  if (!a && g.email) {
    // link Google to an existing account with the same verified email
    const byEmail = await findByEmail(g.email);
    if (byEmail) {
      const upd = await pgPatch(`accounts?id=eq.${byEmail.id}`, {
        google_sub: g.sub,
        email_verified_at: byEmail.email_verified_at || new Date().toISOString()
      });
      a = (upd && upd[0]) || byEmail;
    }
  }

  if (!a) {
    const created = await pgInsert('accounts', [{
      role: 'buyer',
      email: g.email,
      name: g.name || g.email.split('@')[0],
      google_sub: g.sub,
      email_verified_at: new Date().toISOString(),
      lang: 'ur',
      status: 'active',
      can_order: false
    }]);
    a = created && created[0];
  }
  if (!a) return fail('create_failed', 500);
  if (a.status !== 'active') return fail('account_disabled', 403);

  await pgPatch(`accounts?id=eq.${a.id}`, { last_login_at: new Date().toISOString() });
  return signedIn(a, {
    awaiting_approval: !a.can_order && a.role === 'buyer',
    needs_profile: !a.phone || !a.business_name
  });
}

/* ---------------- SELLER INVITE REDEMPTION ---------------- */
async function redeemInvite(request, body) {
  const code = String(body.code || '').trim().toUpperCase();
  if (!code) return fail('code_required');
  if (await tooManyAttempts(code, 'invite', 6)) return fail('too_many_attempts', 429);

  const rows = await pgGet(
    `invites?select=id,code,role,seller_id,expires_at,used_at&code=eq.${encodeURIComponent(code)}&limit=1`
  );
  const inv = rows && rows[0];
  if (!inv || inv.used_at) {
    await recordAttempt(code, 'invite', false, clientIp(request));
    return fail('invite_invalid', 404);
  }
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) return fail('invite_expired', 410);

  const problem = passcodeProblem(body.passcode);
  if (problem) return fail('weak_passcode', 400, { problem });

  const { hash, salt } = await hashPasscode(body.passcode);
  const created = await pgInsert('accounts', [{
    role: inv.role,
    phone: body.phone ? normalisePhone(body.phone) : null,
    name: body.name ? String(body.name).trim() : null,
    lang: inv.role === 'seller' ? 'zh' : 'ur',
    passcode_hash: hash, passcode_salt: salt,
    status: 'active',
    can_order: false,
    approved_at: new Date().toISOString()
  }]);
  const a = created && created[0];
  if (!a) return fail('create_failed', 500);

  await pgPatch(`invites?id=eq.${inv.id}`, {
    used_at: new Date().toISOString(), account_id: a.id
  });
  if (inv.seller_id) {
    await pgPatch(`sellers?id=eq.${inv.seller_id}`, { account_id: a.id });
  }
  await recordAttempt(code, 'invite', true, clientIp(request));
  return signedIn(a);
}

/* ---------------- EMAIL VERIFICATION ---------------- */
async function emailStart(request, body) {
  const me = await currentAccount(request);
  if (!me) return fail('not_signed_in', 401);
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('bad_email');

  const token = randomBytes(24).toString('base64url');
  await pgInsert('email_tokens', [{
    account_id: me.id, email, token_hash: sha256(token),
    expires_at: new Date(Date.now() + 24 * 3600_000).toISOString()
  }]);
  await pgPatch(`accounts?id=eq.${me.id}`, { email });

  // The email itself is sent by DULCi through the connected Gmail account.
  // Until that is authorised, the link is returned to the caller so the flow
  // is testable — it is NOT emailed from here, and we say so plainly.
  return json({
    ok: true,
    delivery: 'pending_gmail_integration',
    verify_path: `/api/auth/email/verify?token=${token}`,
    note: 'Gmail is not yet authorised on the agent, so this link has not been emailed.'
  });
}

async function emailVerify(request, url) {
  const token = url.searchParams.get('token');
  if (!token) return fail('token_required');
  const rows = await pgGet(
    `email_tokens?select=id,account_id,email,expires_at,consumed_at&token_hash=eq.${sha256(token)}&limit=1`
  );
  const t = rows && rows[0];
  if (!t || t.consumed_at) return fail('token_invalid', 404);
  if (new Date(t.expires_at) < new Date()) return fail('token_expired', 410);

  await pgPatch(`email_tokens?id=eq.${t.id}`, { consumed_at: new Date().toISOString() });
  await pgPatch(`accounts?id=eq.${t.account_id}`, {
    email: t.email, email_verified_at: new Date().toISOString()
  });
  return json({ ok: true, verified: true, email: t.email });
}

/* ---------------- ROUTER ---------------- */
export default async (request) => {
  if (!configured()) return fail('db_not_configured', 503);
  const url = new URL(request.url);
  const action = url.pathname.replace(/^\/api\/auth\/?/, '').replace(/\/$/, '');

  if (action === 'logout') {
    return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
  }
  if (action === 'email/verify') return emailVerify(request, url);

  if (request.method !== 'POST') return fail('method_not_allowed', 405);

  let body = {};
  try { body = await request.json(); } catch (e) { return fail('bad_json'); }

  try {
    switch (action) {
      case 'register':     return await register(request, body);
      case 'login':        return await login(request, body);
      case 'google':       return await google(request, body);
      case 'invite':       return await redeemInvite(request, body);
      case 'email/start':  return await emailStart(request, body);
      default:             return fail('unknown_action', 404);
    }
  } catch (e) {
    return fail('auth_failed', 500, { reason: String(e && e.message || e).slice(0, 300) });
  }
};

export const config = { path: '/api/auth/*' };
