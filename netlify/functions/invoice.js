/* ============================================================
   /api/invoice/<number>.pdf

   The admin can open any invoice. A buyer can open only the invoices
   raised against their own orders — the ownership check is a database
   filter, not a comparison done after the fact.
   ============================================================ */
import { pgGet, fail, configured, currentAccount } from '../lib/core.js';
import { invoicePdf } from '../lib/invoice-pdf.js';
import { amountInWordsEn } from '../lib/pdf.js';

const BLANK_COMPANY = {
  legal_name: null, ntn: null, strn: null, address: null, city: null,
  phone: null, email: null, website: 'yuan.pk', bank_name: null, bank_branch: null,
  bank_title: null, bank_iban: null, bank_account: null, bank_swift: null,
  payment_terms: null, invoice_note: null
};

export default async (request) => {
  if (!configured()) return fail('db_not_configured', 503);

  const account = await currentAccount(request);
  if (!account) return fail('sign_in_required', 401);

  const url = new URL(request.url);
  const raw = decodeURIComponent(url.pathname.split('/').pop() || '');
  const number = raw.replace(/\.pdf$/i, '');
  if (!number) return fail('invoice_number_required');

  const invRows = await pgGet(
    'invoices?select=id,number,order_id,issued_at,due_at,total_pkr,amount_words_en,' +
    `amount_words_ur,status,paid_at,payment_ref,bank_details,lines&number=eq.${encodeURIComponent(number)}&limit=1`
  );
  const invoice = invRows && invRows[0];
  if (!invoice) return fail('not_found', 404);

  /* Ownership enforced in the query. A buyer asking for someone else's
     invoice number gets 404 — the same answer as a number that does not
     exist, so the endpoint cannot be used to discover invoices either. */
  const ownerFilter = account.role === 'admin' ? '' : `&buyer_account_id=eq.${account.id}`;
  const ordRows = await pgGet(
    'orders?select=id,ref,buyer_name,buyer_phone,buyer_city,buyer_address,fx_rate,fx_locked_at,' +
    `total_pkr,breakdown,status&id=eq.${invoice.order_id}${ownerFilter}&limit=1`
  );
  const order = ordRows && ordRows[0];
  if (!order) return fail('not_found', 404);

  const items = invoice.lines && Array.isArray(invoice.lines) && invoice.lines.length
    ? invoice.lines
    : (await pgGet(`order_items?select=title_snapshot,qty,unit_cny,line_cny,line_pkr&order_id=eq.${order.id}`) || []);

  /* Bank details are snapshotted onto the invoice when it is issued, so a
     later change of bank never rewrites an invoice already in a buyer's
     hands. Fall back to today's settings only when no snapshot exists. */
  let company = invoice.bank_details && typeof invoice.bank_details === 'object'
    ? invoice.bank_details : null;
  if (!company) {
    const cs = await pgGet('company_settings?select=*&id=eq.1&limit=1').catch(() => null);
    company = (cs && cs[0]) || {};
  }
  company = { ...BLANK_COMPANY, ...company };

  let bytes;
  try {
    bytes = invoicePdf({
      invoice: {
        ...invoice,
        amount_words_en: invoice.amount_words_en || amountInWordsEn(invoice.total_pkr)
      },
      order, items, company,
      breakdown: order.breakdown || null
    });
  } catch (e) {
    return fail('pdf_failed', 500, { reason: String(e && e.message || e).slice(0, 300) });
  }

  const filename = `Yuan-pk-Invoice-${number.replace(/[^A-Za-z0-9._-]/g, '-')}.pdf`;
  const disposition = url.searchParams.get('download') === '1' ? 'attachment' : 'inline';

  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(bytes.length),
      'content-disposition': `${disposition}; filename="${filename}"`,
      // an invoice is private and must never sit in a shared cache
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff'
    }
  });
};

export const config = { path: '/api/invoice/*' };
