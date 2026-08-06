/* ============================================================
   The invoice as a printed document.

   Everything on this page comes from the database. If the Director has
   not yet entered a bank account, the PDF says so in plain words rather
   than printing a plausible-looking account number — a wrong account
   number on an invoice is how money disappears.
   ============================================================ */
import { createPdf, amountInWordsEn } from './pdf.js';

const M = 44;                 // page margin
const GOLD = [0.72, 0.56, 0.24];
const INK  = [0.06, 0.07, 0.09];
const GREY = [0.42, 0.45, 0.50];
const HAIR = [0.84, 0.85, 0.87];

const money = v => (v == null || isNaN(v)) ? '—'
  : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(Number(v)));
const money2 = v => (v == null || isNaN(v)) ? '—'
  : new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));
/* buyer_city is stored as a URL slug on an order; an invoice must read
   like a letter, not like a link. */
const prettyCity = v => !v ? null : String(v).replace(/-/g, ' ')
  .replace(/\b[a-z]/g, c => c.toUpperCase());

/* Cut on a word boundary. A label chopped mid-word ("goods whose b") looks
   like a broken system, and this document has to look trustworthy. */
function clip(v, n) {
  const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.55 ? cut.slice(0, sp) : cut).replace(/[\s,;:(\-]+$/, '') + '...';
}

const day = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toISOString().slice(0, 10);
};

export function invoicePdf({ invoice, order, items, company, breakdown }) {
  const d = createPdf({ title: 'Invoice ' + invoice.number, date: invoice.issued_at });
  const RIGHT = d.W - M;
  let y = M + 6;

  /* ---------- masthead ---------- */
  d.text('YUAN', M, y + 12, { size: 26, bold: true, color: INK });
  d.text('.pk', M + 62, y + 12, { size: 26, bold: true, color: GOLD });
  d.text(company.legal_name || 'Yuan.pk (Pvt) Ltd', M, y + 28, { size: 8.5, color: GREY });
  d.text('Importer of record', M, y + 40, { size: 8.5, color: GREY });

  d.text('INVOICE', RIGHT, y + 6, { size: 15, bold: true, align: 'right', color: INK });
  d.text(invoice.number, RIGHT, y + 22, { size: 11, bold: true, align: 'right', color: GOLD });
  d.text('Issued  ' + day(invoice.issued_at), RIGHT, y + 35, { size: 8.5, align: 'right', color: GREY });
  if (invoice.due_at) d.text('Due  ' + day(invoice.due_at), RIGHT, y + 46, { size: 8.5, align: 'right', color: GREY });

  y += 62;
  d.line(M, y, RIGHT, y, { color: GOLD, w: 1.4 });
  y += 22;

  /* ---------- the two parties ---------- */
  const colB = M + (RIGHT - M) / 2 + 10;
  d.text('FROM', M, y, { size: 7.5, bold: true, color: GREY });
  d.text('BILL TO', colB, y, { size: 7.5, bold: true, color: GREY });
  y += 14;

  const from = [
    company.legal_name,
    company.address,
    company.city,
    company.phone,
    company.email,
    company.website,
    company.ntn ? 'NTN ' + company.ntn : null,
    company.strn ? 'STRN ' + company.strn : null
  ].filter(Boolean);
  const to = [
    order.buyer_name,
    order.buyer_address,
    prettyCity(order.buyer_city),
    order.buyer_phone,
    'Order ' + (order.ref || '')
  ].filter(Boolean);

  let ya = y, yb = y;
  from.forEach((l, i) => { d.text(l, M, ya, { size: 9, bold: i === 0, color: i === 0 ? INK : GREY }); ya += 13; });
  to.forEach((l, i)   => { d.text(l, colB, yb, { size: 9, bold: i === 0, color: i === 0 ? INK : GREY }); yb += 13; });
  y = Math.max(ya, yb) + 14;

  /* ---------- goods ---------- */
  const cQty = M + 250, cUnit = M + 320, cCny = M + 400, cPkr = RIGHT;
  d.rect(M, y - 11, RIGHT - M, 20, { fill: [0.96, 0.965, 0.97] });
  d.text('DESCRIPTION', M + 6, y + 2, { size: 7.5, bold: true, color: GREY });
  d.text('QTY', cQty, y + 2, { size: 7.5, bold: true, align: 'right', color: GREY });
  d.text('UNIT CNY', cUnit, y + 2, { size: 7.5, bold: true, align: 'right', color: GREY });
  d.text('LINE CNY', cCny, y + 2, { size: 7.5, bold: true, align: 'right', color: GREY });
  d.text('LINE PKR', cPkr - 6, y + 2, { size: 7.5, bold: true, align: 'right', color: GREY });
  y += 20;

  (items || []).forEach(it => {
    if (y > d.H - 200) { d.newPage(); y = M; }
    const t = clip(it.title_snapshot, 52);
    d.text(t, M + 6, y + 2, { size: 9, color: INK });
    d.text(money(it.qty), cQty, y + 2, { size: 9, align: 'right', color: INK });
    d.text(it.unit_cny != null ? money2(it.unit_cny) : '—', cUnit, y + 2, { size: 9, align: 'right', color: INK });
    d.text(it.unit_cny != null && it.qty ? money2(Number(it.unit_cny) * Number(it.qty)) : '—',
      cCny, y + 2, { size: 9, align: 'right', color: INK });
    d.text(it.line_pkr != null ? money(it.line_pkr) : '—', cPkr - 6, y + 2, { size: 9, bold: true, align: 'right', color: INK });
    y += 17;
    d.line(M, y - 5, RIGHT, y - 5, { color: [0.93, 0.93, 0.94] });
  });

  y += 10;

  /* ---------- landed cost, itemised ----------
     The whole promise of Yuan.pk is that the buyer sees every line. So
     every line is printed, including our own commission. */
  /* A basket spanning several categories is costed per category, because duty
     differs by HS code and averaging it would be a lie. So the breakdown may
     arrive as groups rather than a flat list — print both shapes. */
  const groups = (breakdown && Array.isArray(breakdown.groups) && breakdown.groups.length)
    ? breakdown.groups
    : (breakdown && Array.isArray(breakdown.lines) && breakdown.lines.length
        ? [{ category_slug: null, lines: breakdown.lines }] : []);

  const printLines = ls => {
    ls.forEach(l => {
      if (y > d.H - 150) { d.newPage(); y = M; }
      d.text(clip(l.label || l.id, 46), M + 6, y, { size: 9, color: INK });
      /* Say out loud which figures are confirmed and which are still an
         estimate. A buyer who is told the difference trusts the number. */
      if (l.basis && l.basis !== 'confirmed') {
        d.text(l.basis === 'estimated' ? 'estimated' :
               l.basis === 'pending_input' ? 'not yet in this total' : 'not yet sourced',
          M + 262, y, { size: 7.5, color: [0.62, 0.42, 0.10] });
      }
      if (l.value != null && (l.unit === '%' || l.unit === 'percent')) {
        d.text(money2(l.value) + '%', M + 360, y, { size: 8, align: 'right', color: GREY });
      }
      d.text(l.amount_pkr != null ? money(l.amount_pkr) : '—',
        RIGHT - 6, y, { size: 9, align: 'right', color: INK });
      y += 15;
    });
  };

  if (groups.length) {
    if (y > d.H - 260) { d.newPage(); y = M; }
    d.text('HOW THIS TOTAL IS BUILT', M, y, { size: 7.5, bold: true, color: GREY });
    y += 15;
    groups.forEach(g => {
      if (groups.length > 1 && g.category_slug) {
        if (y > d.H - 150) { d.newPage(); y = M; }
        d.text(String(g.category_slug).replace(/-/g, ' '), M + 6, y,
          { size: 8, bold: true, color: GOLD });
        y += 14;
      }
      printLines(g.lines || []);
      if (groups.length > 1) y += 4;
    });
    if (breakdown && breakdown.commission_pkr != null) {
      if (y > d.H - 150) { d.newPage(); y = M; }
      d.text('Yuan.pk service fee', M + 6, y, { size: 9, color: INK });
      d.text(money(breakdown.commission_pkr), RIGHT - 6, y, { size: 9, align: 'right', color: INK });
      y += 15;
    }
    if (breakdown && breakdown.cbm_incomplete) {
      y += 2;
      y = d.para('Freight is not yet inside this total: the carton size for one or more items ' +
        'is not on record. It is charged separately at cost, with the receipt shown to you.',
        M + 6, y, RIGHT - M - 12, { size: 8, color: [0.62, 0.42, 0.10] });
    }
    y += 4;
  }

  /* ---------- total ---------- */
  if (y > d.H - 190) { d.newPage(); y = M; }
  d.line(M, y, RIGHT, y, { color: HAIR });
  y += 16;
  d.rect(M + (RIGHT - M) * 0.42, y - 12, (RIGHT - M) * 0.58, 30, { fill: [0.98, 0.955, 0.90] });
  d.text('TOTAL PAYABLE', M + (RIGHT - M) * 0.44, y + 6, { size: 9.5, bold: true, color: INK });
  d.text('PKR ' + money(invoice.total_pkr), RIGHT - 8, y + 7, { size: 14, bold: true, align: 'right', color: INK });
  y += 34;
  y = d.para(invoice.amount_words_en || amountInWordsEn(invoice.total_pkr),
    M, y, RIGHT - M, { size: 8.5, color: GREY });
  y += 8;

  if (order.fx_rate) {
    d.text('Converted at CNY 1 = PKR ' + money2(order.fx_rate) +
      (order.fx_locked_at ? '  (rate held from ' + day(order.fx_locked_at) + ')' : ''),
      M, y, { size: 8, color: GREY });
    y += 16;
  }

  /* ---------- bank ---------- */
  if (y > d.H - 170) { d.newPage(); y = M; }
  d.rect(M, y - 10, RIGHT - M, 2, { fill: GOLD });
  y += 12;
  d.text('PAYMENT', M, y, { size: 7.5, bold: true, color: GREY });
  y += 16;

  const hasBank = !!(company.bank_iban || company.bank_account);
  if (hasBank) {
    const rows = [
      ['Account title', company.bank_title],
      ['Bank', [company.bank_name, company.bank_branch].filter(Boolean).join(' — ')],
      ['IBAN', company.bank_iban],
      ['Account number', company.bank_account],
      ['SWIFT', company.bank_swift]
    ].filter(r => r[1]);
    rows.forEach(([k, v]) => {
      d.text(k, M + 6, y, { size: 9, color: GREY });
      d.text(String(v), M + 130, y, { size: 9.5, bold: true, color: INK });
      y += 15;
    });
    y += 4;
    y = d.para('Please quote invoice ' + invoice.number + ' on the transfer, and send the receipt to ' +
      (company.email || 'Yuan.pk') + '. Goods are bought in China only after payment clears.',
      M + 6, y, RIGHT - M - 12, { size: 8.5, color: GREY });
  } else {
    /* No invented account. Ever. */
    y = d.para('Bank details are not printed on this copy. Please contact Yuan.pk on ' +
      (company.phone || '+92 300 630 7380') + ' and confirm the account by voice before transferring any money. ' +
      'Never pay an account number sent to you by message alone.',
      M + 6, y, RIGHT - M - 12, { size: 9, color: [0.62, 0.32, 0.10] });
  }

  if (company.payment_terms) {
    y += 8;
    y = d.para('Terms: ' + company.payment_terms, M + 6, y, RIGHT - M - 12, { size: 8.5, color: GREY });
  }
  if (company.invoice_note) {
    y += 6;
    y = d.para(company.invoice_note, M + 6, y, RIGHT - M - 12, { size: 8.5, color: GREY });
  }

  /* ---------- footer ---------- */
  const fy = d.H - 46;
  d.line(M, fy - 12, RIGHT, fy - 12, { color: HAIR });
  d.text((company.legal_name || 'Yuan.pk (Pvt) Ltd') +
    (company.ntn ? '  ·  NTN ' + company.ntn : ''), M, fy, { size: 7.5, color: GREY });
  d.text('yuan.pk  ·  ' + (company.phone || '+92 300 630 7380'), RIGHT, fy, { size: 7.5, align: 'right', color: GREY });
  d.text('This invoice is issued in English with Western numerals so that a bank and a customs broker can read it without ambiguity.',
    M, fy + 11, { size: 6.8, color: [0.6, 0.62, 0.66] });

  return d.build();
}
