/* ============================================================
   /api/admin-auth/*  — admin identity
   Admins sign in with EMAIL + password (separate from the buyer
   phone route). The password is never supplied by anyone but the
   admin: it is set through a one-time bootstrap link, so it never
   exists in a chat log, the codebase or an env var.
   ============================================================ */
import {
  pgGet, pgInsert, pgPatch, json, fail, configured,
  hashPasscode, verifyPasscode, passcodeProblem,
  tooManyAttempts, recordAttempt, clientIp,
  issueToken, setCookie, currentAccount, publicAccount, sha256, requireRole
} from '../lib/core.js';
import { randomBytes } from 'node:crypto';

const ACCT = 'id,role,email,phone,name,business_name,city,lang,status,trust_tier,' +
             'orders_completed,can_order,approved_at,email_verified_at,' +
             'passcode_hash,passcode_salt,locked_until,failed_attempts';

const norm = e => String(e || '').trim().toLowerCase();

async function isAllowlisted(email) {
  const r = await pgGet(
    `admin_emails?select=email,active&email=eq.${encodeURIComponent(email)}&active=eq.true&limit=1`
  );
  return !!(r && r[0]);
}
async function findByEmail(email) {
  const r = await pgGet(`accounts?select=${ACCT}&email=eq.${encodeURIComponent(email)}&limit=1`);
  return r && r[0];
}

export async function audit(account, action, extra = {}) {
  try {
    await pgInsert('admin_audit', [{
      account_id: account ? account.id : null,
      actor_email: account ? account.email : null,
      action, ...extra
    }]);
  } catch (e) { /* auditing must never block the action itself */ }
}

/* ---------- issue a one-time link so the admin sets their own password ---------- */
async function requestBootstrap(request, body) {
  const email = norm(body.email);
  if (!email) return fail('email_required');

  // Only an allowlisted admin email can ever be bootstrapped.
  if (!(await isAllowlisted(email))) {
    await recordAttempt(email, 'bootstrap', false, clientIp(request));
    // deliberately vague: do not confirm which emails are admins
    return json({ ok: true, sent: false, note: 'If that address is an administrator, a link has been issued.' });
  }
  if (await tooManyAttempts(email, 'bootstrap', 5)) return fail('too_many_attempts', 429);

  const existing = await findByEmail(email);
  const purpose = (existing && existing.passcode_hash) ? 'reset_password' : 'set_password';

  const token = randomBytes(32).toString('base64url');
  await pgInsert('admin_bootstrap', [{
    email, token_hash: sha256(token), purpose,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()   // 1 hour
  }]);
  await recordAttempt(email, 'bootstrap', true, clientIp(request));

  const origin = new URL(request.url).origin;
  return json({
    ok: true, sent: true, purpose,
    // The link is returned to the caller so DULCi can email it through the
    // connected Gmail. It is NOT logged and expires in one hour.
    link: `${origin}/admin/set-password/?token=${token}`,
    expires_in_minutes: 60
  });
}

/* ---------- redeem the link and set the password ---------- */
async function setPassword(request, body) {
  const token = String(body.token || '');
  if (!token) return fail('token_required');

  const problem = passcodeProblem(body.password);
  if (problem) return fail('weak_password', 400, { problem });

  const rows = await pgGet(
    `admin_bootstrap?select=id,email,purpose,expires_at,consumed_at&token_hash=eq.${sha256(token)}&limit=1`
  );
  const t = rows && rows[0];
  if (!t || t.consumed_at) return fail('token_invalid', 404);
  if (new Date(t.expires_at) < new Date()) return fail('token_expired', 410);
  if (!(await isAllowlisted(t.email))) return fail('not_admin', 403);

  const { hash, salt } = await hashPasscode(body.password);
  let account = await findByEmail(t.email);

  if (account) {
    const upd = await pgPatch(`accounts?id=eq.${account.id}`, {
      passcode_hash: hash, passcode_salt: salt, role: 'admin',
      status: 'active', can_order: true,
      approved_at: account.approved_at || new Date().toISOString(),
      email_verified_at: account.email_verified_at || new Date().toISOString(),
      failed_attempts: 0, locked_until: null
    });
    account = (upd && upd[0]) || account;
  } else {
    const created = await pgInsert('accounts', [{
      role: 'admin', email: t.email, name: 'Mirza Javaid Iqbal',
      lang: 'ur', status: 'active', can_order: true,
      passcode_hash: hash, passcode_salt: salt,
      approved_at: new Date().toISOString(),
      email_verified_at: new Date().toISOString()
    }]);
    account = created && created[0];
  }
  if (!account) return fail('create_failed', 500);

  await pgPatch(`admin_bootstrap?id=eq.${t.id}`, { consumed_at: new Date().toISOString() });
  await audit(account, t.purpose === 'reset_password' ? 'admin.password_reset' : 'admin.password_set',
              { target_table: 'accounts', target_id: account.id, ip: clientIp(request) });

  return json({ ok: true, account: publicAccount(account) },
    200, { 'set-cookie': setCookie(issueToken(account.id, 12 * 3600 * 1000)) });
}

/* ---------- admin sign in ---------- */
async function login(request, body) {
  const email = norm(body.email);
  if (!email) return fail('email_required');
  const ip = clientIp(request);

  if (await tooManyAttempts(email, 'admin_login', 6)) return fail('too_many_attempts', 429);

  const bad = async () => {
    await recordAttempt(email, 'admin_login', false, ip);
    return fail('bad_credentials', 401);
  };

  // allowlist is checked FIRST: a demoted email cannot sign in even with a
  // valid old password
  if (!(await isAllowlisted(email))) return bad();

  const a = await findByEmail(email);
  if (!a) return bad();
  if (a.locked_until && new Date(a.locked_until) > new Date()) return fail('locked', 423);
  if (a.status !== 'active') return fail('account_disabled', 403);
  if (!a.passcode_hash) return fail('password_not_set', 409,
    { note: 'This administrator has not set a password yet. Request a setup link.' });

  if (!(await verifyPasscode(body.password, a.passcode_hash, a.passcode_salt))) {
    const n = (a.failed_attempts || 0) + 1;
    await pgPatch(`accounts?id=eq.${a.id}`, {
      failed_attempts: n,
      locked_until: n >= 8 ? new Date(Date.now() + 15 * 60000).toISOString() : null
    });
    return bad();
  }

  // an allowlisted email that somehow is not marked admin gets corrected here
  if (a.role !== 'admin') await pgPatch(`accounts?id=eq.${a.id}`, { role: 'admin' });

  await pgPatch(`accounts?id=eq.${a.id}`, {
    failed_attempts: 0, locked_until: null, last_login_at: new Date().toISOString()
  });
  await recordAttempt(email, 'admin_login', true, ip);
  await audit({ ...a, role: 'admin' }, 'admin.login', { ip });

  // admin sessions are deliberately short — 12 hours, not 30 days
  return json({ ok: true, account: publicAccount({ ...a, role: 'admin' }) },
    200, { 'set-cookie': setCookie(issueToken(a.id, 12 * 3600 * 1000), 12 * 3600) });
}

/* ---------- manage the admin allowlist (admin only) ---------- */
async function listAdmins(request) {
  const g = await requireRole(request, ['admin']);
  if (g.error) return g.error;
  const rows = await pgGet('admin_emails?select=email,note,active,created_at&order=created_at.asc');
  return json({ ok: true, admins: rows || [] });
}

async function addAdmin(request, body) {
  const g = await requireRole(request, ['admin']);
  if (g.error) return g.error;
  const email = norm(body.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('bad_email');

  await pgInsert('admin_emails', [{ email, note: body.note || null, added_by: g.account.id }])
    .catch(() => null);   // already present is fine
  await audit(g.account, 'admin.added', { target_table: 'admin_emails', target_id: email,
    after: { email }, ip: clientIp(request) });
  return json({ ok: true, email });
}

async function removeAdmin(request, body) {
  const g = await requireRole(request, ['admin']);
  if (g.error) return g.error;
  const email = norm(body.email);

  // Refuse to leave the business with no administrator.
  const all = await pgGet('admin_emails?select=email&active=eq.true');
  if (Array.isArray(all) && all.length <= 1) {
    return fail('last_admin', 409, { note: 'Cannot remove the only administrator.' });
  }
  if (email === norm(g.account.email)) {
    return fail('cannot_remove_self', 409);
  }

  await pgPatch(`admin_emails?email=eq.${encodeURIComponent(email)}`, { active: false });
  await pgPatch(`accounts?email=eq.${encodeURIComponent(email)}`, { role: 'buyer' }).catch(() => null);
  await audit(g.account, 'admin.removed', { target_table: 'admin_emails', target_id: email,
    ip: clientIp(request) });
  return json({ ok: true, removed: email });
}

/* ---------- router ---------- */
export default async (request) => {
  if (!configured()) return fail('db_not_configured', 503);
  const url = new URL(request.url);
  const action = url.pathname.replace(/^\/api\/admin-auth\/?/, '').replace(/\/$/, '');

  if (action === 'admins' && request.method === 'GET') return listAdmins(request);

  if (request.method !== 'POST') return fail('method_not_allowed', 405);
  let body = {};
  try { body = await request.json(); } catch (e) { return fail('bad_json'); }

  try {
    switch (action) {
      case 'bootstrap':     return await requestBootstrap(request, body);
      case 'set-password':  return await setPassword(request, body);
      case 'login':         return await login(request, body);
      case 'admins/add':    return await addAdmin(request, body);
      case 'admins/remove': return await removeAdmin(request, body);
      default:              return fail('unknown_action', 404);
    }
  } catch (e) {
    return fail('admin_auth_failed', 500, { reason: String(e && e.message || e).slice(0, 300) });
  }
};

export const config = { path: '/api/admin-auth/*' };
