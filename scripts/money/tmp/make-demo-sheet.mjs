/* A budget a person actually keeps: a title row, blank rows, Spanish headings the bank
   dictionary has never heard of, dates with no year, amounts with no minus signs, and a
   TOTAL line at the bottom the way everybody writes one. */
import * as XLSX from 'xlsx';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const rows = [
  ['Presupuesto personal - Marta'],
  [],
  ['Día', 'En qué', 'Cuánto', 'Tipo'],
  ['01/09', 'Mercadona', '48,20', 'Comida'],
  ['01/09', 'Renfe Cercanias', '1,70', 'Transporte'],
  ['02/09', 'Cafe Comercial', '3,40', 'Cafe'],
  ['04/09', 'Spotify', '11,99', 'Suscripcion'],
  ['05/09', 'Farmacia Goya', '12,85', 'Salud'],
  [],
  ['08/09', 'Mercadona', '52,10', 'Comida'],
  ['09/09', 'Cabify', '9,60', 'Transporte'],
  ['11/09', 'El Corte Ingles', '89,90', 'Ropa'],
  ['12/09', 'Cine Ideal', '8,50', 'Ocio'],
  ['15/09', 'Mercadona', '44,75', 'Comida'],
  ['18/09', 'Gimnasio Altafit', '29,99', 'Deporte'],
  ['20/09', 'Renfe Cercanias', '1,70', 'Transporte'],
  ['22/09', 'Telefonica Movil', '19,99', 'Telefono'],
  ['24/09', 'Mercadona', '37,40', 'Comida'],
  [],
  ['TOTAL', '', '444,07', ''],
];

const sheet = XLSX.utils.aoa_to_sheet(rows);
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, sheet, 'Septiembre');
const out = process.argv[2] || 'demo-budget.xlsx';
/* xlsx's own writeFile does not find fs under ESM here; the buffer is the same bytes. */
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));

const costs = rows.filter((r) => r[0] && /^\d/.test(String(r[0])) && r[2]);
const sum = costs.reduce((n, r) => n + Number(String(r[2]).replace(',', '.')), 0);
console.log(`${out}: ${costs.length} payments, ${sum.toFixed(2)} EUR, plus a TOTAL row of ${rows.at(-1)[2]}`);
