/* /api/me — who am I, according to the database (never the cookie) */
import { json, currentAccount, publicAccount, configured, GOOGLE_CLIENT_ID } from '../lib/core.js';

export default async (request) => {
  if (!configured()) return json({ ok:false, error:'db_not_configured' }, 503);
  const a = await currentAccount(request);
  if (!a) return json({ ok:false, account:null, google_client_id: GOOGLE_CLIENT_ID || null }, 200);
  return json({ ok:true, account: publicAccount(a), google_client_id: GOOGLE_CLIENT_ID || null });
};

export const config = { path: '/api/me' };
