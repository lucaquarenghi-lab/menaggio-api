export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const listings = await scrapeAllPages();
    return res.status(200).json({ ok: true, count: listings.length, listings });
  } catch (err) {
    console.error('Scrape error:', err.message);
    return res.status(500).json({ ok: false, error: err.message, listings: [] });
  }
} 

const BASE = 'https://www.immobiliaremenaggio.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
};

async function fetchHtml(url) {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

// Extract all /it/listing/[slug]/ URLs from a page
function extractSlugs(html) {
  const seen = new Set();
  const results = [];
  const re = /href="(https?:\/\/www\.immobiliaremenaggio\.com\/it\/listing\/([a-z0-9\-]+)\/?)"(?:[^>]*)>?/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const slug = m[2];
    if (!seen.has(slug)) {
      seen.add(slug);
      results.push({ url: m[1].replace(/\/?$/, '/'), slug });
    }
  }
  return results;
}

// Parse a single listing page to get details
function parseListing(html, slug, pageUrl) {
  const get = (patterns) => {
    for (const re of patterns) {
      const m = html.match(re);
      if (m && m[1]) return m[1].replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    }
    return null;
  };

  // Title
  const title = get([
    /<h1[^>]*class="[^"]*(?:listing|property|entry)[^"]*"[^>]*>([^<]+)<\/h1>/i,
    /<h1[^>]*>([^<]+)<\/h1>/i,
    /<title>([^<|–]+)/i,
  ]);

  // Price
  const priceRaw = get([
    /(?:Prezzo|Price)[^>]*>[^<]*<[^>]+>\s*([\d.,]+|[A-Z\s]+(?:RISERVATA|richiesta|richiesta|CONSULTACI))/i,
    /class="[^"]*price[^"]*"[^>]*>([^<]+)</i,
    /(?:Euro|EURO|€)\s*([\d.,]+)/i,
  ]);
  let price = priceRaw ? priceRaw.trim() : 'Su richiesta';
  if (/^\d/.test(price)) price = '€ ' + price.replace(/\./g,'').replace(',','.');

  // Size
  const mq = get([
    /Superficie[^<]*<[^>]+>\s*([^<]*mq[^<]*)/i,
    /(\d+)\s*(?:mq|m²|MQ)/i,
  ]);

  // Rooms
  const camMatch = html.match(/Camere[^<]*<[^>]+>\s*(\d+)/i);
  const cam = camMatch ? parseInt(camMatch[1]) : 0;

  // Baths
  const bagMatch = html.match(/Bagni[^<]*<[^>]+>\s*(\d+)/i);
  const bag = bagMatch ? parseInt(bagMatch[1]) : 0;

  // Location / address
  const loc = get([
    /Indirizzo[^<]*<[^>]+>([^<]+)</i,
    /class="[^"]*location[^"]*"[^>]*>([^<]+)</i,
  ]);

  // Status (vendita/affitto)
  const status = html.match(/\baffitt/i) && !html.match(/\bvendita\b/i) ? 'affitto' : 'vendita';

  // Description
  const descMatch = html.match(/class="[^"]*description[^"]*"[^>]*>([\s\S]{20,400}?)<\/(?:div|p)/i);
  let desc = descMatch
    ? descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220)
    : '';

  // Image
  const imgMatch = html.match(/<img[^>]+src="([^"]*uploads[^"]*\.(?:jpg|jpeg|png|webp))"[^>]*>/i);
  const img = imgMatch ? imgMatch[1] : null;

  return {
    slug,
    url: pageUrl,
    name: title || slug.replace(/-/g, ' ').toUpperCase(),
    price,
    mq: mq ? mq.replace(/[^\d]/g, '') + ' mq' : null,
    cam,
    bag,
    loc: loc || '',
    status,
    desc,
    img,
  };
}

async function scrapeAllPages() {
  const allSlugs = new Map(); // slug → url

  // Scrape both vendita and affitto listing pages
  const sections = [
    { base: `${BASE}/it/status/vendita/`, pages: 12 },
    { base: `${BASE}/it/status/affitto/`, pages: 3 },
  ];

  for (const section of sections) {
    for (let p = 1; p <= section.pages; p++) {
      const url = p === 1 ? section.base : `${section.base}page/${p}/`;
      try {
        const html = await fetchHtml(url);
        const slugs = extractSlugs(html);
        if (slugs.length === 0) break; // no more pages
        for (const s of slugs) allSlugs.set(s.slug, s.url);
      } catch {
        break; // stop on error
      }
    }
  }

  // Fetch details for each listing (up to 120)
  const slugList = [...allSlugs.entries()].slice(0, 120);
  const results = [];

  // Fetch in batches of 5 to avoid rate limiting
  for (let i = 0; i < slugList.length; i += 5) {
    const batch = slugList.slice(i, i + 5);
    const fetched = await Promise.all(
      batch.map(async ([slug, pageUrl]) => {
        try {
          const html = await fetchHtml(pageUrl);
          return parseListing(html, slug, pageUrl);
        } catch {
          return { slug, url: pageUrl, name: slug.replace(/-/g, ' ').toUpperCase(), price: 'Su richiesta', status: 'vendita' };
        }
      })
    );
    results.push(...fetched);
    // Small delay between batches
    if (i + 5 < slugList.length) await new Promise(r => setTimeout(r, 300));
  }

  return results;
}
