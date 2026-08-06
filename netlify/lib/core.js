/* ============================================================
   YUAN MARKET — server core
   Zero npm dependencies. Node builtins + fetch only.
   The service-role key never leaves this layer.
   ============================================================ */
import { createHmac, randomBytes, timingSafeEqual, createHash, scrypt as _scrypt } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(_scrypt);

export const SUPABASE_URL = process.env.SUPABASE_URL || '';
export const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const SESSION_SECRET = process.env.MARKET_SESSION_SECRET || '';
export const ADMIN_PHONES = (process.env.MARKET_ADMIN_PHONES || '')
  .split(',').map(s => s.trim()).filter(Boolean);

export const configured = () => !!(SUPABASE_URL && SERVICE_KEY);

/* ---------------- PostgREST ---------------- */
export async function pg(path, init = {}) {
  if (!configured()) throw new Error('db_not_configured');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      'accept-profile': 'market',
      'content-profile': 'market',
      'content-type': 'application/json',
      accept: 'application/json',
      ...(init.headers || {})
    }
  });
  const text = await r.text();
  if (!r.ok) throw Object.assign(new Error(`pg ${r.status}: ${text.slice(0, 300)}`), { status: r.status });
  return text ? JSON.parse(text) : null;
}
export const pgGet    = p => pg(p);

/* Exact row count without transferring the rows. PostgREST reports it in
   Content-Range when asked, so a "total" costs one cheap request instead of
   pulling a thousand ids across the wire. */
export async function pgCount(path) {
  if (!configured()) throw new Error('db_not_configured');
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}${sep}select=id&limit=1`, {
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      'accept-profile': 'market',
      accept: 'application/json',
      prefer: 'count=exact'
    }
  });
  if (!r.ok) throw new Error(`pgCount ${r.status}`);
  const range = r.headers.get('content-range') || '';
  const n = parseInt(String(range).split('/')[1], 10);
  return Number.isFinite(n) ? n : null;
}
export const pgInsert = (t, rows) => pg(t, { method:'POST', body: JSON.stringify(rows), headers:{ prefer:'return=representation' } });
export const pgPatch  = (t, rows) => pg(t, { method:'PATCH', body: JSON.stringify(rows), headers:{ prefer:'return=representation' } });

/* ---------------- responses ---------------- */
const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store'
};
export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } });
export const fail = (error, status = 400, extra = {}) =>
  json({ ok:false, error, ...extra }, status);

/* ---------------- crypto helpers ---------------- */
export const sha256 = s => createHash('sha256').update(String(s)).digest('hex');

function sign(payload) {
  return createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}
function safeEq(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && timingSafeEqual(A, B);
}

/* Session token: <accountId>.<expiresMs>.<hmac>  — verified, not trusted. */
export function issueToken(accountId, ttlMs = 30 * 24 * 3600 * 1000) {
  const exp = Date.now() + ttlMs;
  const body = `${accountId}.${exp}`;
  return `${body}.${sign(body)}`;
}
export function readToken(token) {
  if (!token || !SESSION_SECRET) return null;
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const [id, exp, mac] = parts;
  if (!safeEq(mac, sign(`${id}.${exp}`))) return null;
  if (Number(exp) < Date.now()) return null;
  return { accountId: id, exp: Number(exp) };
}

export const COOKIE = 'yuan_s';
export function setCookie(token, maxAgeSec = 30 * 24 * 3600) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}
export const clearCookie = () =>
  `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/* ---------------- who is calling ---------------- */
export async function currentAccount(request) {
  const claim = readToken(readCookie(request, COOKIE));
  if (!claim) return null;
  // The signature only proves the id was issued by us. Role and status are
  // always re-read from the database — never taken from the cookie.
  const rows = await pgGet(
    `accounts?select=id,role,phone,email,name,business_name,city,lang,status,trust_tier,` +
    `orders_completed,can_order,approved_at,email_verified_at&id=eq.${claim.accountId}&limit=1`
  );
  const a = rows && rows[0];
  if (!a || a.status !== 'active') return null;
  return a;
}

export async function requireRole(request, roles) {
  const a = await currentAccount(request);
  if (!a) return { error: fail('not_signed_in', 401) };
  if (roles && !roles.includes(a.role)) return { error: fail('forbidden', 403) };
  return { account: a };
}

/* ---------------- phone normalisation (Pakistan-aware) ---------------- */
export function normalisePhone(input) {
  let s = String(input || '').replace(/[^\d+]/g, '');
  if (!s) return null;
  s = s.replace(/^00/, '+');
  if (s.startsWith('+')) return s;
  if (s.startsWith('0')) return '+92' + s.slice(1);   // 03xx -> +923xx
  if (s.startsWith('92')) return '+' + s;
  if (s.startsWith('3') && s.length === 10) return '+92' + s;
  return '+' + s;
}

/* ---------------- misc ---------------- */
export const sixDigitCode = () => String(randomBytes(4).readUInt32BE(0) % 1000000).padStart(6, '0');
export const newRef = prefix =>
  `${prefix}-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${randomBytes(2).toString('hex').toUpperCase()}`;

/* Strip anything a given role must never see. */
export function publicListing(l, role) {
  const out = {
    slug:l.slug, code:l.code, title_en:l.title_en, title_ur:l.title_ur, title_zh:l.title_zh,
    unit:l.unit, moq:l.moq, hero_url:l.hero_url,
    tier:l.tier, status:l.status, category_id:l.category_id,
    // the negotiated yuan price (verified listings only)
    cny_unit_price:l.cny_unit_price,
    // the supplier's published price and the currency it was published in,
    // so the client can normalise it to yuan at the live rate
    listed_currency:l.listed_currency,
    listed_price_min:l.listed_price_min,
    listed_price_max:l.listed_price_max,
    price_verified_at:l.price_verified_at, market_price_pkr:l.market_price_pkr,
    spin_frames:l.spin_frames, model_url:l.model_url, capture_status:l.capture_status
  };
  // NOTE: source_platform, source_url and source_captured_at are deliberately
  // NOT in the public shape. Naming the marketplace we sourced from, or the
  // date we scraped it, reads as second-hand data to a buyer.
  // Source URL and capture provenance are ADMIN-ONLY. Buyers see a clear
  // "price confirmed after you order" promise instead of a scrape trail.
  if (role === 'admin') {
    out.id = l.id;
    out.seller_id = l.seller_id;
    out.supplier_name = l.supplier_name;
    out.supplier_contact = l.supplier_contact;
    out.hs_code = l.hs_code;
    out.duty_pct_override = l.duty_pct_override;
    out.source_url = l.source_url;
    out.source_platform = l.source_platform;
    out.source_captured_at = l.source_captured_at;
  }
  return out;
}


/* ============================================================
   PASSCODES — salted scrypt. Never reversible, never logged.
   ============================================================ */
const SCRYPT_KEYLEN = 32;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPasscode(passcode) {
  const salt = randomBytes(16).toString('hex');
  const dk = await scrypt(String(passcode), salt, SCRYPT_KEYLEN, SCRYPT_OPTS);
  return { hash: dk.toString('hex'), salt };
}
export async function verifyPasscode(passcode, hash, salt) {
  if (!hash || !salt) return false;
  try {
    const dk = await scrypt(String(passcode), salt, SCRYPT_KEYLEN, SCRYPT_OPTS);
    const A = Buffer.from(dk.toString('hex'));
    const B = Buffer.from(String(hash));
    return A.length === B.length && timingSafeEqual(A, B);
  } catch (e) { return false; }
}

/* A passcode must be worth having. Kept deliberately simple for a
   shopkeeper on a phone: 6+ characters, not all the same, not sequential. */
export function passcodeProblem(pc) {
  const s = String(pc || '');
  if (s.length < 6) return 'too_short';
  if (/^(.)\1+$/.test(s)) return 'all_same';
  if ('0123456789'.includes(s) || '9876543210'.includes(s)) return 'sequential';
  return null;
}

/* ============================================================
   RATE LIMITING — per identifier so unknown phone numbers count too
   ============================================================ */
export async function tooManyAttempts(identifier, kind, limit = 8, windowMin = 15) {
  try {
    const since = new Date(Date.now() - windowMin * 60000).toISOString();
    const rows = await pgGet(
      `auth_attempts?select=id&identifier=eq.${encodeURIComponent(identifier)}` +
      `&kind=eq.${kind}&ok=is.false&at=gte.${since}&limit=${limit + 1}`
    );
    return Array.isArray(rows) && rows.length >= limit;
  } catch (e) { return false; }
}
export async function recordAttempt(identifier, kind, ok, ip) {
  try {
    await pgInsert('auth_attempts', [{ identifier, kind, ok: !!ok, ip: ip || null }]);
  } catch (e) { /* never block a login on telemetry failure */ }
}
export const clientIp = request =>
  (request.headers.get('x-nf-client-connection-ip') ||
   request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;

/* ============================================================
   GOOGLE SIGN-IN — verify the ID token against Google's JWKS.
   We check signature, issuer, audience and expiry. A token that
   fails any of those is rejected outright.
   ============================================================ */
let jwksCache = { at: 0, keys: null };

async function googleKeys() {
  if (jwksCache.keys && Date.now() - jwksCache.at < 3600_000) return jwksCache.keys;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!r.ok) throw new Error('jwks_unavailable');
  const d = await r.json();
  jwksCache = { at: Date.now(), keys: d.keys };
  return d.keys;
}

const b64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export async function verifyGoogleIdToken(idToken, clientId) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('malformed_token');
  const header = JSON.parse(b64u(parts[0]).toString('utf8'));
  const payload = JSON.parse(b64u(parts[1]).toString('utf8'));

  const keys = await googleKeys();
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('unknown_key');

  const { createPublicKey, createVerify } = await import('node:crypto');
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const v = createVerify('RSA-SHA256');
  v.update(`${parts[0]}.${parts[1]}`);
  if (!v.verify(key, b64u(parts[2]))) throw new Error('bad_signature');

  if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss))
    throw new Error('bad_issuer');
  if (clientId && payload.aud !== clientId) throw new Error('bad_audience');
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error('expired');
  if (!payload.email || payload.email_verified === false) throw new Error('email_unverified');

  return { sub: payload.sub, email: payload.email, name: payload.name || null };
}

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

/* Shape an account for the client. Never leaks hashes or internal flags. */
export function publicAccount(a) {
  return {
    id: a.id, role: a.role, name: a.name, business_name: a.business_name,
    city: a.city, phone: a.phone, email: a.email, lang: a.lang,
    status: a.status, can_order: !!a.can_order,
    approved: !!a.approved_at, email_verified: !!a.email_verified_at,
    trust_tier: a.trust_tier, orders_completed: a.orders_completed
  };
}
