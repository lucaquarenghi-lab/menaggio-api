export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const live = await scrapeListings();
    if (live.length >= 5) {
      return res.status(200).json({ source: 'live', count: live.length, listings: live });
    }
  } catch (e) {
    console.log('Live scrape failed:', e.message);
  }

  return res.status(200).json({ source: 'static', count: STATIC.length, listings: STATIC });
}

const BASE = 'https://www.immobiliaremenaggio.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

async function fetchHtml(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'it-IT,it;q=0.9',
    }
  });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

function extractLinks(html) {
  const seen = new Set();
  const re = /href="(https?:\/\/(?:www\.)?immobiliaremenaggio\.com\/it\/listing\/([a-z0-9][a-z0-9\-]+[a-z0-9])\/?)"/gi;
  let m, out = [];
  while ((m = re.exec(html)) !== null) {
    if (!seen.has(m[2])) { seen.add(m[2]); out.push({ slug: m[2], url: m[1].replace(/\/?$/, '/') }); }
  }
  return out;
}

function parsePage(html, slug, url) {
  const g = (...res) => { for (const r of res) { const m = html.match(r); if (m?.[1]) return m[1].replace(/&amp;/g,'&').replace(/\s+/g,' ').trim(); } return null; };
  const name = g(/<h1[^>]*>([^<]{5,})<\/h1>/i) || slug.replace(/-/g,' ').toUpperCase();
  const priceRaw = g(/(?:Euro|EURO|€)\s*([\d.,']+)/i, /Prezzo[^<]*<[^>]+>\s*([^<]{3,})/i);
  const price = priceRaw ? ((/^\d/.test(priceRaw.replace(/[.,']/g,''))) ? '€ '+priceRaw : priceRaw) : 'Su richiesta';
  const mq  = g(/(\d{2,4})\s*(?:MQ|mq|m²)/i);
  const cam = parseInt(g(/Camere[^<]*<[^>]*>\s*(\d+)/i) || '0');
  const bag = parseInt(g(/Bagni[^<]*<[^>]*>\s*(\d+)/i) || '0');
  const loc = g(/Indirizzo[^<]*<[^>]*>([^<]{3,})/i, /class="[^"]*location[^"]*"[^>]*>([^<]{3,})</i);
  const status = /\baffitto\b/i.test(html) && !/\bvendita\b/i.test(html) ? 'affitto' : 'vendita';
  const descM = html.match(/class="[^"]*(?:description|desc)[^"]*"[^>]*>([\s\S]{30,500}?)<\/(?:div|p)/i);
  const desc  = descM ? descM[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,220) : '';
  const imgM  = html.match(/<img[^>]+src="([^"]*\/uploads\/[^"]*\.(?:jpg|jpeg|png|webp))"[^>]*>/i);
  return { id:slug, slug, url, name, price, mq: mq ? mq+' mq' : null, cam, bag, loc:loc||'', status, desc, img:imgM?.[1]||null };
}

async function scrapeListings() {
  const slugMap = new Map();
  for (const section of ['vendita','affitto']) {
    for (let p = 1; p <= 15; p++) {
      const url = p === 1 ? `${BASE}/it/status/${section}/` : `${BASE}/it/status/${section}/page/${p}/`;
      try {
        const html = await fetchHtml(url);
        const links = extractLinks(html);
        if (!links.length) break;
        links.forEach(l => slugMap.set(l.slug, l.url));
      } catch { break; }
    }
  }
  const entries = [...slugMap.entries()].slice(0, 120);
  const results = [];
  for (let i = 0; i < entries.length; i += 6) {
    const batch = entries.slice(i, i+6);
    const fetched = await Promise.all(batch.map(async ([slug, url]) => {
      try { return parsePage(await fetchHtml(url), slug, url); }
      catch { return { id:slug, slug, url, name:slug.replace(/-/g,' ').toUpperCase(), price:'Su richiesta', status:'vendita' }; }
    }));
    results.push(...fetched);
    if (i+6 < entries.length) await new Promise(r => setTimeout(r, 200));
  }
  return results;
}

function u(slug) { return `${BASE}/it/listing/${slug}/`; }

const STATIC = [
  { id:'s01', status:'vendita', name:'VILLETTA VISTA INCANTO MENAGGIO',     price:'Su richiesta',         loc:'Menaggio',        mq:'120 mq', cam:2, bag:2, slug:'villetta-vista-incanto-menaggio',                                            url:u('villetta-vista-incanto-menaggio'),                                            img:null, desc:'Splendida villetta soleggiata con vista incantevole sul lago di Como e ampio terrazzo panoramico.' },
  { id:'s02', status:'vendita', name:'APPARTAMENTO SUL LAGO MENAGGIO',      price:'Su richiesta',         loc:'Menaggio',        mq:'66 mq',  cam:2, bag:1, slug:'appartamento-sul-lago-menaggio',                                              url:u('appartamento-sul-lago-menaggio'),                                              img:null, desc:'Appartamento con vista diretta sul lago di Como, posizione centralissima a Menaggio.' },
  { id:'s03', status:'vendita', name:'CENTRALISSIMO MENAGGIO',              price:'€ 545.000',            loc:'Menaggio',        mq:'90 mq',  cam:2, bag:2, slug:'centralissimo-menaggio',                                                      url:u('centralissimo-menaggio'),                                                      img:null, desc:'Appartamento centralissimo a Menaggio, a pochi passi dal lago e da tutti i servizi.' },
  { id:'s04', status:'vendita', name:'VILLA SOLE MENAGGIO',                 price:'€ 735.000',            loc:'Menaggio',        mq:'230 mq', cam:2, bag:3, slug:'villa-sole-menaggio',                                                          url:u('villa-sole-menaggio'),                                                         img:null, desc:'Villa soleggiata da 230 mq con ampi spazi, giardino e splendida vista sul lago.' },
  { id:'s05', status:'vendita', name:'AMAZING VIEW MENAGGIO',               price:'Su richiesta',         loc:'Menaggio',        mq:'120 mq', cam:2, bag:2, slug:'amazing-view-menaggio',                                                        url:u('amazing-view-menaggio'),                                                       img:null, desc:'Meravigliosa vista sul lago di Como, appartamento luminoso in ottima posizione.' },
  { id:'s06', status:'vendita', name:'ATTICO DI AMPIA METRATURA IN VILLA CON PISCINA NEL CUORE DI MENAGGIO', price:'Su richiesta', loc:'Menaggio', mq:'130 mq', cam:2, bag:2, slug:'attico-di-ampia-metratura-in-villa-con-piscina-nel-cuore-di-menaggio', url:u('attico-di-ampia-metratura-in-villa-con-piscina-nel-cuore-di-menaggio'), img:null, desc:'Elegante attico in villa ristrutturata con piscina, vista lago e posto auto.' },
  { id:'s07', status:'vendita', name:'PRESTIGIOSO APPARTAMENTO IN VILLA',   price:'Su richiesta',         loc:'Menaggio Centro', mq:'250 mq', cam:0, bag:0, slug:'prestigioso-appartamento-in-villa',                                            url:u('prestigioso-appartamento-in-villa'),                                            img:null, desc:'Appartamento di pregio con parquet antico e soffitti affrescati, soffitta ampliabile.' },
  { id:'s08', status:'vendita', name:'VILLETTA SOGNO MENAGGIO',             price:'Su richiesta',         loc:'Menaggio',        mq:null,     cam:0, bag:0, slug:'villetta-sogno-menaggio',                                                      url:u('villetta-sogno-menaggio'),                                                     img:null, desc:'Affascinante villetta a Menaggio. Contattare l\'ufficio per dettagli e prezzo.' },
  { id:'s09', status:'vendita', name:'MCMI MENAGGIO',                       price:'€ 550.000',            loc:'Menaggio',        mq:'90 mq',  cam:2, bag:2, slug:'mcmi-menaggio',                                                                url:u('mcmi-menaggio'),                                                               img:null, desc:'Elegante appartamento a Menaggio con finiture di pregio e vista lago.' },
  { id:'s10', status:'vendita', name:'APPARTAMENTO TREMEZZINA TREMEZZINA',  price:'€ 269.000',            loc:'Tremezzina',      mq:'60 mq',  cam:2, bag:2, slug:'appartamento-tremezzina-tremezzina',                                            url:u('appartamento-tremezzina-tremezzina'),                                           img:null, desc:'Appartamento in posizione tranquilla a Tremezzina, doppi servizi, buone finiture.' },
  { id:'s11', status:'vendita', name:'APPARTAMENTO VIVERE LENNO LENNO',     price:'€ 360.000',            loc:'Lenno',           mq:'150 mq', cam:2, bag:2, slug:'appartamento-vivere-lenno-lenno',                                               url:u('appartamento-vivere-lenno-lenno'),                                              img:null, desc:'Ampio appartamento da 150 mq a Lenno con vista lago, cucina abitabile e terrazzo.' },
  { id:'s12', status:'vendita', name:'VILLA CASINA MIA MOLTRASIO',          price:'€ 1.500.000',          loc:'Moltrasio',       mq:'300 mq', cam:4, bag:4, slug:'villa-casina-mia-moltrasio',                                                    url:u('villa-casina-mia-moltrasio'),                                                  img:null, desc:'Villa di lusso con vista panoramica sul lago, parco privato, 4 camere e 4 bagni.' },
  { id:'s13', status:'vendita', name:'VILLA OLIVE GROVE TREMEZZINA',        price:'Su richiesta',         loc:'Tremezzina',      mq:'700 mq', cam:4, bag:5, slug:'villa-olive-grove-tremezzina',                                                   url:u('villa-olive-grove-tremezzina'),                                                img:null, desc:'Straordinaria villa con uliveto a pochissimi passi dal lago. Proprietà esclusiva.' },
  { id:'s14', status:'vendita', name:'CASA FONTANA TREMEZZO',               price:'€ 249.000',            loc:'Tremezzo',        mq:'100 mq', cam:2, bag:1, slug:'casa-fontana-tremezzo',                                                         url:u('casa-fontana-tremezzo'),                                                       img:null, desc:'Casa di 100 mq a Tremezzo, buone condizioni, ottima esposizione sul lago.' },
  { id:'s15', status:'vendita', name:'VILLA VISTA BELLAGIO TREMEZZO',       price:'Su richiesta',         loc:'Tremezzo',        mq:'300 mq', cam:0, bag:0, slug:'villa-vista-bellagio-tremezzo',                                                  url:u('villa-vista-bellagio-tremezzo'),                                               img:null, desc:'Villa esclusiva con vista su Bellagio, posizione tra le più suggestive del lago.' },
  { id:'s16', status:'affitto', name:'LA CASETTA TREMEZZINA',               price:'€ 700/mese',           loc:'Tremezzina',      mq:'80 mq',  cam:2, bag:2, slug:'la-casetta-tremezzina',                                                         url:u('la-casetta-tremezzina'),                                                       img:null, desc:'Casetta in affitto a Tremezzina, 80 mq, due camere, perfetta per soggiorni lunghi.' },
  { id:'s17', status:'vendita', name:'GRAZIOSA VILLETTA CARLAZZO',          price:'€ 285.000',            loc:'Carlazzo',        mq:'80 mq',  cam:2, bag:2, slug:'graziosa-villetta-carlazzo',                                                     url:u('graziosa-villetta-carlazzo'),                                                  img:null, desc:'Curata villetta indipendente con giardino privato, soggiorno luminoso e terrazzo.' },
  { id:'s18', status:'vendita', name:'CALVESEGLIO PLESIO',                  price:'€ 85.000',             loc:'Plesio',          mq:'185 mq', cam:3, bag:2, slug:'calveseglio-plesio',                                                             url:u('calveseglio-plesio'),                                                          img:null, desc:'Ampio rustico in pietra con terreno annesso a Plesio. Ideale da personalizzare.' },
  { id:'s19', status:'vendita', name:'APPARTAMENTO SOLEGGIATO CARLAZZO',    price:'€ 329.000',            loc:'Carlazzo',        mq:'110 mq', cam:2, bag:2, slug:'appartamento-soleggiato-carlazzo',                                               url:u('appartamento-soleggiato-carlazzo'),                                             img:null, desc:'Appartamento soleggiato da 110 mq a Carlazzo, ottime condizioni e molto luminoso.' },
  { id:'s20', status:'vendita', name:'VILLA OASI PORLEZZA',                 price:'Su richiesta',         loc:'Porlezza',        mq:'400 mq', cam:4, bag:3, slug:'villa-oasi-porlezza',                                                            url:u('villa-oasi-porlezza'),                                                         img:null, desc:'Grande villa a Porlezza con giardino e piscina, quattro camere, posizione panoramica.' },
  { id:'s21', status:'vendita', name:'RUSTICO SASSO PORLEZZA',              price:'€ 180.000',            loc:'Porlezza',        mq:'80 mq',  cam:0, bag:0, slug:'rustico-sasso-porlezza',                                                         url:u('rustico-sasso-porlezza'),                                                      img:null, desc:'Caratteristico rustico in sasso a Porlezza, da personalizzare secondo i propri gusti.' },
  { id:'s22', status:'vendita', name:'CASA GRAZIOSA PORLEZZA',              price:'€ 390.000',            loc:'Porlezza',        mq:'130 mq', cam:2, bag:2, slug:'casa-graziosa-porlezza',                                                         url:u('casa-graziosa-porlezza'),                                                      img:null, desc:'Casa curata da 130 mq a Porlezza, doppi servizi, ottima esposizione.' },
  { id:'s23', status:'vendita', name:'CARATTERISTICO APPARTAMENTO PORLEZZA',price:'€ 98.000',             loc:'Porlezza',        mq:'71 mq',  cam:1, bag:1, slug:'caratteristico-appartamento-porlezza',                                           url:u('caratteristico-appartamento-porlezza'),                                         img:null, desc:'Appartamento caratteristico a Porlezza, prezzo interessante, zona tranquilla.' },
  { id:'s24', status:'vendita', name:'APPARTAMENTO INCANTO PORLEZZA',       price:'€ 765.000',            loc:'Porlezza',        mq:'150 mq', cam:4, bag:2, slug:'appartamento-incanto-porlezza',                                                  url:u('appartamento-incanto-porlezza'),                                               img:null, desc:'Appartamento di pregio a Porlezza con vista incantevole, quattro camere.' },
  { id:'s25', status:'vendita', name:'STORICA CASA PORLEZZA CENTRO',        price:'Trattativa riservata', loc:'Porlezza Centro', mq:'250 mq', cam:4, bag:3, slug:'storica-casa-porlezza-centro',                                                   url:u('storica-casa-porlezza-centro'),                                                img:null, desc:'Storica casa nel centro di Porlezza, ampia metratura, quattro camere e tre bagni.' },
  { id:'s26', status:'vendita', name:'CASA ROSY PORLEZZA',                  price:'Su richiesta',         loc:'Porlezza',        mq:'230 mq', cam:4, bag:2, slug:'casa-rosy-porlezza',                                                             url:u('casa-rosy-porlezza'),                                                          img:null, desc:'Ampia casa da 230 mq a Porlezza con giardino, quattro camere.' },
  { id:'s27', status:'vendita', name:'APPARTAMENTO BELLA VISTA PORLEZZA',   price:'Su richiesta',         loc:'Porlezza',        mq:null,     cam:0, bag:0, slug:'appartamento-bella-vista-porlezza',                                               url:u('appartamento-bella-vista-porlezza'),                                            img:null, desc:'Appartamento con bella vista a Porlezza. Contattare l\'ufficio per i dettagli.' },
  { id:'s28', status:'vendita', name:'APPARTAMENTO DA SOGNO VALSOLDA',      price:'€ 517.000',            loc:'Valsolda',        mq:'195 mq', cam:2, bag:2, slug:'appartamento-da-sogno-valsolda',                                                 url:u('appartamento-da-sogno-valsolda'),                                               img:null, desc:'Appartamento esclusivo da 195 mq a Valsolda con vista sul Lago di Lugano.' },
  { id:'s29', status:'vendita', name:'VILLA PARADISO VALSOLDA',             price:'€ 690.000',            loc:'Valsolda',        mq:'180 mq', cam:3, bag:2, slug:'villa-paradiso-valsolda',                                                        url:u('villa-paradiso-valsolda'),                                                     img:null, desc:'Villa con giardino a Valsolda, tre camere, splendida vista sul Lago di Lugano.' },
  { id:'s30', status:'vendita', name:'VILLA SOLEGGIATA CORRIDO',            price:'€ 700.000',            loc:'Corrido',         mq:'250 mq', cam:3, bag:2, slug:'villa-soleggiata-corrido',                                                       url:u('villa-soleggiata-corrido'),                                                    img:null, desc:'Bellissima villa da 250 mq a Corrido con ampio giardino e vista panoramica.' },
  { id:'s31', status:'vendita', name:'CASA DI BORGO CREMIA',                price:'€ 140.000',            loc:'Cremia',          mq:'150 mq', cam:3, bag:1, slug:'casa-di-borgo-cremia',                                                           url:u('casa-di-borgo-cremia'),                                                        img:null, desc:'Caratteristica casa di borgo a Cremia, ampi spazi, atmosfera autentica.' },
  { id:'s32', status:'vendita', name:'DLE DONGO',                           price:'€ 145.000',            loc:'Dongo',           mq:'90 mq',  cam:2, bag:1, slug:'dle-dongo',                                                                       url:u('dle-dongo'),                                                                   img:null, desc:'Appartamento a Dongo, ottimo rapporto qualità-prezzo sul Lago di Como.' },
];