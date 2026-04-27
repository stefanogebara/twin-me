/**
 * Merchant Normalizer + Category Inference
 * =========================================
 * Dictionary-based heuristic. Covers the top merchant patterns seen in
 * Brazilian Nubank/Itaú statements. Pure computation — no LLM.
 *
 * Normalization: canonical brand name from scrawly descriptors.
 *   "iFood *Restaurante Sushi"     → "iFood"
 *   "Uber BV *TRIP HELP.UBER.COM"  → "Uber"
 *   "AMAZON MARKETPLACE BR"        → "Amazon"
 *   "MERCADO PAGO SHEIN BR"        → "Shein"
 *
 * Category: one of
 *   food_delivery | groceries | transport | fuel | shopping | streaming
 *   health | fitness | travel | utilities | entertainment | fees
 *   subscription | salary | transfer | other
 *
 * Discretionary-vs-essential classification used downstream by the stress-shop
 * detector. See `isDiscretionaryCategory(category)`.
 */

// Ordered list — first match wins. Each rule is { match, brand, category }.
// Matchers are lowercased substring or regex.
const RULES = [
  // Food delivery
  { match: /\bifood\b|\bi\s?food\b/i,            brand: 'iFood',           category: 'food_delivery' },
  { match: /\brappi\b/i,                         brand: 'Rappi',           category: 'food_delivery' },
  { match: /\buber\s*eats|uber\s?eats/i,         brand: 'Uber Eats',       category: 'food_delivery' },
  { match: /\b99\s?food\b|^99food/i,             brand: '99 Food',         category: 'food_delivery' },
  { match: /\bjames\s?delivery/i,                brand: 'James Delivery',  category: 'food_delivery' },

  // Transport (ride-hailing)
  { match: /\buber\b(?!\s?eats)/i,               brand: 'Uber',            category: 'transport' },
  { match: /\b99\s?app\b|\b99\s?taxi\b|\b99\s?pop\b/i, brand: '99',        category: 'transport' },
  { match: /\bcabify\b/i,                        brand: 'Cabify',          category: 'transport' },
  { match: /\bmetro|metrorio|cptm/i,             brand: 'Metrô',           category: 'transport' },
  { match: /\bbilhete\s?unico|recarga\s+tag/i,   brand: 'Bilhete Único',   category: 'transport' },

  // Fuel
  { match: /posto\s+|\bshell\b|\bpetrobras|\bipiranga\b/i, brand: 'Posto', category: 'fuel' },
  { match: /\bsem\s?parar\b|conectcar/i,         brand: 'Pedágio',         category: 'transport' },

  // Marketplaces / shopping
  { match: /\bamazon\b|\bamzn\b/i,               brand: 'Amazon',          category: 'shopping' },
  { match: /\bmercado\s?livre|mercadolivre/i,    brand: 'Mercado Livre',   category: 'shopping' },
  { match: /\bmercado\s?pago.*shein|\bshein\b/i, brand: 'Shein',           category: 'shopping' },
  { match: /\bmagazine\s?luiza|\bmagalu\b/i,     brand: 'Magalu',          category: 'shopping' },
  { match: /\bamericanas\b|\bsubmarino\b/i,      brand: 'Americanas',      category: 'shopping' },
  { match: /\baliexpress|alibaba/i,              brand: 'AliExpress',      category: 'shopping' },
  { match: /\btemu\b/i,                          brand: 'Temu',            category: 'shopping' },
  { match: /\bzara\b|\briachuelo\b|\brenner\b/i, brand: 'Fashion Retail',  category: 'shopping' },

  // Groceries
  { match: /\bpão\s?de\s?açúcar|\bcarrefour\b|\bextra\b|\batacadão\b/i, brand: 'Supermercado', category: 'groceries' },
  { match: /\bpadaria\b|\bpadoca\b|boulanger/i,  brand: 'Padaria',         category: 'groceries' },
  { match: /\bsam\'s\s?club|\bassai\b|\bmakro\b/i, brand: 'Atacado',       category: 'groceries' },

  // Streaming / subscriptions
  { match: /\bnetflix\b/i,                       brand: 'Netflix',         category: 'streaming' },
  { match: /\bspotify\b/i,                       brand: 'Spotify',         category: 'streaming' },
  { match: /\bdisney\+?|\bdisneyplus\b/i,        brand: 'Disney+',         category: 'streaming' },
  { match: /\bamazon\s?prime|\bprime\s?video\b/i, brand: 'Prime Video',    category: 'streaming' },
  { match: /\bhbo\s?max\b|\bmax\b(?=.*streaming)/i, brand: 'HBO Max',      category: 'streaming' },
  { match: /\bapple\s?music|\bapple\.com\/bill/i, brand: 'Apple',          category: 'streaming' },
  { match: /\byoutube\s?premium|\byoutube\s?music/i, brand: 'YouTube Premium', category: 'streaming' },
  { match: /\bdeezer\b|\btidal\b/i,              brand: 'Music',           category: 'streaming' },
  { match: /\btwitch\b/i,                        brand: 'Twitch',          category: 'entertainment' },
  { match: /\bcanva\b|\bfigma\b|\bnotion\b|\bgithub\b(?=.*(?:pro|plan))/i, brand: 'SaaS', category: 'subscription' },

  // Health / pharmacy / fitness
  { match: /\bdroga\s?raia|\bdroga\s?sil|\bdrogasil|\bpacheco\b|\bfarmacia\b/i, brand: 'Farmácia', category: 'health' },
  { match: /\bsmart\s?fit|bluefit|\bacademia\b|\bgympass\b|\btotalpass\b/i, brand: 'Academia', category: 'fitness' },
  { match: /\bhapvida|\bunimed|\bsul\s?america\s?saude|\bbradesco\s?saude/i, brand: 'Plano de Saúde', category: 'health' },

  // Travel
  { match: /\blatam\b|\bgol\b|\bazul\b(?=.*linhas|.*aereas|.*tarifa)/i, brand: 'Aérea', category: 'travel' },
  { match: /\bairbnb\b|\bbooking\.com|\bhotel\b|\btrivago\b|\bdecolar\b/i, brand: 'Hospedagem', category: 'travel' },

  // Utilities / bills
  { match: /\btim\b|\bvivo\b|\bclaro\b|\boi\s+movel|\boi\s+telefonia/i, brand: 'Telefonia', category: 'utilities' },
  { match: /\beletrobras|\benel\b|\bcpfl|\blight\b/i, brand: 'Luz',       category: 'utilities' },
  { match: /\bsabesp|\bcedae|\bcompesa/i,        brand: 'Água',           category: 'utilities' },
  { match: /\binternet\b|\bnet\b(?=.*telecom|.*provedor)|\bvirtua/i, brand: 'Internet', category: 'utilities' },

  // Fees / taxes
  { match: /\biof\b|juros\b|\btarifa|anuidade/i, brand: 'Tarifa',          category: 'fees' },
  { match: /\bdarf\b|\bda?s\b|\bboleto\s+inss/i, brand: 'Imposto',         category: 'fees' },

  // Transfers
  { match: /\bpix\b/i,                           brand: 'PIX',             category: 'transfer' },
  { match: /\bted\b|\bdoc\b/i,                   brand: 'Transferência',   category: 'transfer' },

  // Income
  { match: /\bsalario\b|\bsalary\b|pagamento\s+mensal|\bproventos/i, brand: 'Salário', category: 'salary' },
];

const DISCRETIONARY_CATEGORIES = new Set([
  'food_delivery',
  'shopping',
  'streaming',
  'entertainment',
]);

/**
 * Strip BR-specific corporate noise so an unrecognized merchant still reads as
 * a real name. Removes legal suffixes (LTDA/S.A./ME/EIRELI/MEI), trailing CNPJ
 * digit blobs, payment-processor prefixes (PAGSEGURO/MERCADOPAGO/STONE), and
 * generic descriptors ("INSTITUICAO DE PAGAMENTO", "COMERCIO DE..."). Title-
 * cases the result so "PLUGGY BRASIL INSTITUICAO DE PAGAMENTO LTDA" → "Pluggy
 * Brasil". Returns null if nothing recognizable is left.
 */
function fallbackBrand(raw) {
  let s = String(raw)
    .replace(/\*/g, ' ')
    .replace(/\b\d{6,}\b/g, ' ')
    .replace(/\bcnpj[\s:#]*[\d./-]+/gi, ' ')
    .replace(/\b(pagseguro|mercadopago|mercado\s?pago|stone|getnet|cielo|rede)\s+/gi, ' ')
    .replace(/\b(institui[cç][aã]o\s+de\s+pagamento|com[eé]rcio\s+(de|e)\s+\w+|servi[cç]os?\s+(de|e)\s+\w+)\b/gi, ' ')
    .replace(/\b(ltda|s\/?\s?a|s\.?a\.?|me|mei|eireli|epp)\b\.?/gi, ' ')
    .replace(/[^A-Za-z0-9À-ÿ\s&'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s || s.length < 2) return null;
  // Trim to first 4 words to avoid bloated names
  s = s.split(' ').slice(0, 4).join(' ');
  // Title case. Keep PT connectors lowercase (except first word). Preserve
  // 2-char all-caps acronyms (BB, XP, BV) — longer words are common nouns.
  const CONNECTORS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'o', 'a']);
  return s
    .split(' ')
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && CONNECTORS.has(lower)) return lower;
      if (w === w.toUpperCase() && w.length === 2) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Normalize a raw merchant description to { brand, category }.
 * @returns {{ brand: string|null, category: string }}
 */
export function normalizeMerchant(rawDescription) {
  if (!rawDescription || typeof rawDescription !== 'string') {
    return { brand: null, category: 'other' };
  }
  const trimmed = rawDescription.trim();
  for (const rule of RULES) {
    if (rule.match.test(trimmed)) {
      return { brand: rule.brand, category: rule.category };
    }
  }
  return { brand: fallbackBrand(trimmed), category: 'other' };
}

/**
 * Is this category discretionary (i.e. impulse-prone)?
 * Used by stress-shop detector: only flag discretionary categories.
 */
export function isDiscretionaryCategory(category) {
  return DISCRETIONARY_CATEGORIES.has(category);
}
