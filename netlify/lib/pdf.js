/* ============================================================
   A very small PDF writer — no npm, no dependencies.

   Produces a genuine PDF 1.4 file with the base-14 fonts, so it can be
   attached to an email or opened on any phone. Text, rules, filled boxes
   and right-aligned numbers: everything an invoice needs.

   Deliberate limitation, stated openly rather than faked: the base-14
   fonts are WinAnsi, so this cannot typeset Urdu or Chinese. The invoice
   is therefore issued in English with Western numerals — which is what
   a bank and a customs broker want anyway — and the Urdu explanation
   travels in the covering message, where it renders properly.
   ============================================================ */

const A4 = { w: 595.28, h: 841.89 };

/* Widths for Helvetica / Helvetica-Bold, per 1000 units, WinAnsi 32..126.
   Needed so text can be centred and right-aligned properly. */
const W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
  556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
  1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,
  667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
  333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,
  556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,
  556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,
  975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,
  667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,
  333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,
  611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

const widthOf = (ch, bold) => {
  const c = ch.charCodeAt(0);
  const tbl = bold ? W_BOLD : W_REG;
  if (c >= 32 && c <= 126) return tbl[c - 32];
  if (c === 8211 || c === 8212) return bold ? 556 : 556; // – —
  if (c === 8217 || c === 8216) return bold ? 278 : 222; // ’ ‘
  return bold ? 556 : 500;
};
export const textWidth = (s, size, bold) => {
  let w = 0;
  for (const ch of String(s)) w += widthOf(ch, bold);
  return w * size / 1000;
};

/* WinAnsi-safe. Anything outside the encoding is transliterated rather than
   emitted as a broken glyph — a mangled invoice is worse than a plain one. */
const FOLD = {
  '“':'"', '”':'"', '‘':"'", '’':"'", '—':'-', '–':'-', '…':'...',
  '·':'-', '×':'x', '≈':'~', '₨':'Rs', '¥':'CNY ', '€':'EUR ', '£':'GBP ',
  ' ':' ', '→':'->', '✓':'y'
};
function winAnsi(s) {
  let out = '';
  for (const ch of String(s == null ? '' : s)) {
    if (FOLD[ch] != null) { out += FOLD[ch]; continue; }
    const c = ch.codePointAt(0);
    if (c === 10 || c === 13) { out += ' '; continue; }
    out += (c >= 32 && c <= 255) ? ch : '?';
  }
  return out;
}
const escStr = s => winAnsi(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/* ---------------- the document ---------------- */
export function createPdf(meta = {}) {
  const pages = [];
  let ops = [];
  const doc = {
    W: A4.w, H: A4.h,
    /* y is measured from the TOP, which is how a human reads a page.
       Converted to PDF's bottom-left origin at emit time. */
    text(s, x, y, o = {}) {
      const size = o.size || 10, bold = !!o.bold;
      const str = String(s == null ? '' : s);
      let X = x;
      if (o.align === 'right') X = x - textWidth(str, size, bold);
      else if (o.align === 'center') X = x - textWidth(str, size, bold) / 2;
      const c = o.color || [0, 0, 0];
      ops.push(`BT /${bold ? 'FB' : 'FR'} ${size} Tf ${c[0]} ${c[1]} ${c[2]} rg ` +
        `1 0 0 1 ${X.toFixed(2)} ${(A4.h - y).toFixed(2)} Tm (${escStr(str)}) Tj ET`);
      return this;
    },
    /* Wraps on width and returns the y it finished at, so callers never
       have to guess how tall a paragraph was. */
    para(s, x, y, width, o = {}) {
      const size = o.size || 9.5, bold = !!o.bold, lead = o.lead || size * 1.5;
      const words = winAnsi(s).split(/\s+/).filter(Boolean);
      let line = '', yy = y;
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (textWidth(test, size, bold) > width && line) {
          this.text(line, x, yy, o); yy += lead; line = w;
        } else line = test;
      }
      if (line) { this.text(line, x, yy, o); yy += lead; }
      return yy;
    },
    line(x1, y1, x2, y2, o = {}) {
      const c = o.color || [0.8, 0.8, 0.8];
      ops.push(`${c[0]} ${c[1]} ${c[2]} RG ${(o.w || 0.6).toFixed(2)} w ` +
        `${x1.toFixed(2)} ${(A4.h - y1).toFixed(2)} m ${x2.toFixed(2)} ${(A4.h - y2).toFixed(2)} l S`);
      return this;
    },
    rect(x, y, w, h, o = {}) {
      const c = o.fill || [0.95, 0.95, 0.95];
      ops.push(`${c[0]} ${c[1]} ${c[2]} rg ${x.toFixed(2)} ${(A4.h - y - h).toFixed(2)} ` +
        `${w.toFixed(2)} ${h.toFixed(2)} re f`);
      return this;
    },
    newPage() { pages.push(ops.join('\n')); ops = []; return this; },

    build() {
      if (ops.length) { pages.push(ops.join('\n')); ops = []; }
      if (!pages.length) pages.push('');

      /* Objects: 1 catalog, 2 pages, 3 FR, 4 FB, then per page a page dict
         and a content stream. Offsets are byte offsets, so the xref must be
         computed over Latin-1 bytes, never over JS string length. */
      const objs = [];
      const kidCount = pages.length;
      const firstPage = 5;
      const kids = [];
      for (let i = 0; i < kidCount; i++) kids.push(`${firstPage + i * 2} 0 R`);

      objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
      objs[2] = `<< /Type /Pages /Count ${kidCount} /Kids [${kids.join(' ')}] >>`;
      objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
      objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

      pages.forEach((content, i) => {
        const pObj = firstPage + i * 2, cObj = pObj + 1;
        objs[pObj] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] ` +
          `/Resources << /Font << /FR 3 0 R /FB 4 0 R >> >> /Contents ${cObj} 0 R >>`;
        objs[cObj] = `<< /Length ${byteLen(content)} >>\nstream\n${content}\nendstream`;
      });

      const infoObj = objs.length;
      objs[infoObj] = '<< /Producer (Yuan.pk) ' +
        `/Title (${escStr(meta.title || 'Invoice')}) ` +
        `/Author (${escStr(meta.author || 'Yuan.pk Pvt. Ltd.')}) ` +
        `/CreationDate (${pdfDate(meta.date)}) >>`;

      let out = '%PDF-1.4\n%âãÏÓ\n';
      const offsets = [];
      for (let i = 1; i < objs.length; i++) {
        offsets[i] = byteLen(out);
        out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
      }
      const xref = byteLen(out);
      out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
      for (let i = 1; i < objs.length; i++) {
        out += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
      }
      out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info ${infoObj} 0 R >>\n` +
             `startxref\n${xref}\n%%EOF\n`;

      // Latin-1 out: every byte written is < 256 by construction above.
      const bytes = new Uint8Array(out.length);
      for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
      return bytes;
    }
  };
  return doc;
}

const byteLen = s => {
  let n = 0;
  for (let i = 0; i < s.length; i++) n += s.charCodeAt(i) > 255 ? 2 : 1;
  return n;
};
function pdfDate(d) {
  const t = d ? new Date(d) : new Date();
  const p = n => String(n).padStart(2, '0');
  return `D:${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}` +
         `${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}Z`;
}

/* ---------------- money in words ----------------
   Pakistani convention: lakh and crore, because that is how the buyer,
   the bank and the auditor all read a figure. */
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function under1000(n) {
  let s = '';
  if (n >= 100) { s += ONES[Math.floor(n / 100)] + ' Hundred'; n %= 100; if (n) s += ' '; }
  if (n >= 20) { s += TENS[Math.floor(n / 10)]; if (n % 10) s += ' ' + ONES[n % 10]; }
  else if (n > 0) s += ONES[n];
  return s;
}

export function amountInWordsEn(amount) {
  let n = Math.floor(Math.abs(Number(amount) || 0));
  const paisa = Math.round((Math.abs(Number(amount) || 0) - n) * 100);
  if (n === 0 && !paisa) return 'Rupees Zero Only';
  const parts = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh  = Math.floor(n / 100000);   n %= 100000;
  const thou  = Math.floor(n / 1000);    n %= 1000;
  if (crore) parts.push(under1000(crore) + ' Crore');
  if (lakh)  parts.push(under1000(lakh) + ' Lakh');
  if (thou)  parts.push(under1000(thou) + ' Thousand');
  if (n)     parts.push(under1000(n));
  let s = 'Rupees ' + (parts.join(' ') || 'Zero');
  if (paisa) s += ' and ' + under1000(paisa) + ' Paisa';
  return s + ' Only';
}

/* Urdu, for the covering message and the on-screen invoice — not for the
   PDF itself, which cannot typeset the script with base-14 fonts. */
const U_ONES = ['', 'ایک', 'دو', 'تین', 'چار', 'پانچ', 'چھ', 'سات', 'آٹھ', 'نو'];
export function amountInWordsUr(amount) {
  const n = Math.floor(Math.abs(Number(amount) || 0));
  if (!n) return 'صفر روپے';
  const crore = Math.floor(n / 10000000);
  const lakh  = Math.floor((n % 10000000) / 100000);
  const thou  = Math.floor((n % 100000) / 1000);
  const rest  = n % 1000;
  const bits = [];
  const small = v => v < 10 ? U_ONES[v] : String(v);   // digits stay Western on purpose
  if (crore) bits.push(small(crore) + ' کروڑ');
  if (lakh)  bits.push(small(lakh) + ' لاکھ');
  if (thou)  bits.push(small(thou) + ' ہزار');
  if (rest)  bits.push(String(rest));
  return bits.join(' ') + ' روپے';
}
