/* A statement the way a bank's website prints one: a proportional font, right-aligned
   amounts, an operation date and a value date, a running balance, and enough rows to run
   onto a second page. Monospace text is the easy case for rebuilding columns from glyph
   positions; this is the realistic one. */
import { chromium } from 'playwright';

const rows = [
  ['01/09/2026', '01/09/2026', 'PAGO MOVIL EN MERCADONA CALLE ALCALA, MADRID ES, TARJ. :*123456', '-48,20'],
  ['01/09/2026', '01/09/2026', 'PAGO MOVIL EN RENFE CERCANIAS, MADRID ES, TARJ. :*123456', '-1,70'],
  ['02/09/2026', '02/09/2026', 'COMPRA EN CAFE COMERCIAL, MADRID ES, TARJETA 5540XXXXXXXX3456', '-3,40'],
  ['04/09/2026', '04/09/2026', 'RECIBO SPOTIFY AB', '-11,99'],
  ['05/09/2026', '05/09/2026', 'PAGO MOVIL EN FARMACIA GOYA, MADRID ES, TARJ. :*123456', '-12,85'],
  ['05/09/2026', '05/09/2026', 'TRANSFERENCIA DE MARIA LOPEZ GARCIA', '500,00'],
  ['08/09/2026', '08/09/2026', 'PAGO MOVIL EN MERCADONA CALLE ALCALA, MADRID ES, TARJ. :*123456', '-52,10'],
  ['09/09/2026', '10/09/2026', 'COMPRA Cabify ES 2636eRmHs0tq, Madrid, TARJETA 5489010523123456 , COMISION 0,00', '-9,60'],
  ['11/09/2026', '11/09/2026', 'PAGO MOVIL EN EL CORTE INGLES, MADRID ES, TARJ. :*123456', '-89,90'],
  ['12/09/2026', '12/09/2026', 'BIZUM A FAVOR DE JUAN PEREZ RUIZ', '-8,50'],
  ['15/09/2026', '15/09/2026', 'PAGO MOVIL EN MERCADONA CALLE ALCALA, MADRID ES, TARJ. :*123456', '-44,75'],
  ['16/09/2026', '16/09/2026', 'COMPRA PLAYTOMIC.IO, MADRID ES, TARJ. :*123456', '-22,36'],
  ['18/09/2026', '18/09/2026', 'RECIBO GIMNASIO ALTAFIT', '-29,99'],
  ['19/09/2026', '19/09/2026', 'PAGO MOVIL EN LA FRUTERIA, MADRID ES, TARJ. :*123456', '-22,47'],
  ['20/09/2026', '20/09/2026', 'PAGO MOVIL EN RENFE CERCANIAS, MADRID ES, TARJ. :*123456', '-1,70'],
  ['22/09/2026', '22/09/2026', 'RECIBO TELEFONICA MOVILES ESPANA', '-19,99'],
  ['24/09/2026', '24/09/2026', 'PAGO MOVIL EN MERCADONA CALLE ALCALA, MADRID ES, TARJ. :*123456', '-37,40'],
  ['25/09/2026', '25/09/2026', 'COMPRA AMAZON EU SARL, LUXEMBOURG LU, TARJ. :*123456', '-34,95'],
  ['26/09/2026', '26/09/2026', 'COMPRA BOLT.EU, TALLINN EE, TARJ. :*123456', '-19,00'],
  ['28/09/2026', '28/09/2026', 'RECIBO ELEVENLABS.IO', '-23,45'],
  ['29/09/2026', '29/09/2026', 'PAGO MOVIL EN LIDL, MADRID ES, TARJ. :*123456', '-16,30'],
  ['30/09/2026', '30/09/2026', 'NOMINA SEPTIEMBRE UNIVERSIDAD', '850,00'],
];
let saldo = 1200;
const body = rows.map(([op, val, concept, amt]) => {
  saldo += Number(amt.replace('.', '').replace(',', '.'));
  const s = saldo.toFixed(2).replace('.', ',');
  return `<tr><td>${op}</td><td>${val}</td><td class="c">${concept}</td><td class="n">${amt}</td><td class="n">${s}</td></tr>`;
}).join('\n');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; margin: 18mm; color: #222; }
  h1 { font-size: 15pt; margin: 0 0 4px; } .meta { font-size: 9pt; color: #555; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; } th { text-align: left; font-size: 9pt; border-bottom: 1px solid #999; padding: 5px 6px; }
  td { padding: 5px 6px; border-bottom: 1px solid #eee; } td.n, th.n { text-align: right; white-space: nowrap; } td.c { width: 55%; }
  tr { page-break-inside: avoid; } tr:nth-child(14) { page-break-after: always; }
</style></head><body>
<h1>Extracto de movimientos</h1>
<div class="meta">Titular: CUENTA DE EJEMPLO &nbsp;&middot;&nbsp; Cuenta ES00 0000 0000 **** **** 0000 &nbsp;&middot;&nbsp; Periodo 01/09/2026 - 30/09/2026</div>
<table><thead><tr><th>Fecha operación</th><th>Fecha valor</th><th>Concepto</th><th class="n">Importe</th><th class="n">Saldo</th></tr></thead>
<tbody>${body}</tbody></table></body></html>`;

const out = process.argv[2] || 'tests/fixtures/statements/extracto-web.pdf';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.pdf({ path: out, format: 'A4', printBackground: true });
await browser.close();
const spent = rows.filter((r) => r[3].startsWith('-')).reduce((n, r) => n + Number(r[3].slice(1).replace(',', '.')), 0);
const came = rows.filter((r) => !r[3].startsWith('-')).reduce((n, r) => n + Number(r[3].replace('.', '').replace(',', '.')), 0);
console.log(`${out}: ${rows.length} movements, ${spent.toFixed(2)} out, ${came.toFixed(2)} in`);
