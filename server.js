// ═══════════════════════════════════════════════════════════════
//  DisasterWatch — Backend API Server
//  Aggregates live disaster data from multiple public sources
//  Run: node server.js  (or: npm start)
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const xml2js = require('xml2js');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── Cache (avoid hammering APIs) ─────────────────────────────────
let cache = { data: null, timestamp: null };
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

// ══════════════════════════════════════════════════════════════════
//  SOURCE 1: USGS Earthquakes  (completely free, no auth)
// ══════════════════════════════════════════════════════════════════
async function fetchUSGS() {
  const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
  const { data } = await axios.get(url, { timeout: 10000 });

  return data.features.map(f => {
    const mag = f.properties.mag;
    let severity = 'low';
    if (mag >= 6.5)      severity = 'critical';
    else if (mag >= 5.5) severity = 'high';
    else if (mag >= 4.5) severity = 'moderate';

    return {
      id: 'usgs_' + f.id,
      type: 'earthquake',
      title: f.properties.title,
      location: f.properties.place,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      severity,
      magnitude: parseFloat(mag.toFixed(1)),
      time: new Date(f.properties.time).toISOString(),
      source: 'USGS Earthquake Hazards',
      url: f.properties.url,
      description: `Magnitude ${mag.toFixed(1)} · Depth ${f.geometry.coordinates[2].toFixed(0)} km · ${f.properties.felt || 0} reports`,
    };
  }).filter(i => i.lat && i.lng);
}

// ══════════════════════════════════════════════════════════════════
//  SOURCE 2: NASA EONET — Natural Events  (free, no auth)
// ══════════════════════════════════════════════════════════════════
async function fetchNASAEONET() {
  const url = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=14&limit=80';
  const { data } = await axios.get(url, { timeout: 10000 });

  const typeMap = {
    'Wildfires':      'fire',
    'Floods':         'flood',
    'Severe Storms':  'storm',
    'Volcanoes':      'volcano',
    'Tsunamis':       'tsunami',
    'Earthquakes':    'earthquake',
    'Drought':        'other',
    'Sea and Lake Ice': 'other',
    'Snow':           'other',
    'Dust and Haze':  'other',
    'Landslides':     'other',
    'Manmade':        'other',
  };

  const results = [];
  for (const event of data.events) {
    const category = event.categories?.[0]?.title || 'Unknown';
    const disasterType = typeMap[category] || 'other';
    const geo = event.geometry?.[event.geometry.length - 1];
    if (!geo?.coordinates) continue;

    let lat, lng;
    if (geo.type === 'Point') {
      [lng, lat] = geo.coordinates;
    } else if (geo.type === 'Polygon') {
      [lng, lat] = geo.coordinates[0][0];
    } else continue;

    if (isNaN(lat) || isNaN(lng)) continue;

    const sevMap = { fire: 'high', volcano: 'high', tsunami: 'critical', flood: 'moderate', storm: 'high' };

    results.push({
      id: 'nasa_' + event.id,
      type: disasterType,
      title: event.title,
      location: event.title,
      lat,
      lng,
      severity: sevMap[disasterType] || 'moderate',
      time: geo.date || new Date().toISOString(),
      source: 'NASA EONET',
      url: event.sources?.[0]?.url || 'https://eonet.gsfc.nasa.gov',
      description: `${category} · ${event.geometry?.length || 1} data points · Active`,
    });
  }

  return results;
}

// ══════════════════════════════════════════════════════════════════
//  SOURCE 3: GDACS (Global Disaster Alert — UN)  (free RSS feed)
// ══════════════════════════════════════════════════════════════════
async function fetchGDACS() {
  const url = 'https://www.gdacs.org/xml/rss.xml';
  const { data: xml } = await axios.get(url, { timeout: 10000 });

  const parsed = await xml2js.parseStringPromise(xml, { trim: true, explicitArray: false });
  const items = parsed?.rss?.channel?.item;
  if (!items) return [];

  const itemArr = Array.isArray(items) ? items : [items];
  const results = [];

  itemArr.slice(0, 30).forEach((item, idx) => {
    const title = item.title || '';
    const link  = item.link  || 'https://gdacs.org';
    const desc  = item.description?.replace(/<[^>]+>/g, '') || '';
    const pubDate = item.pubDate;

    // GDACS uses gdacs: namespace fields
    const lat = parseFloat(item['geo:lat'] || item['georss:point']?.split(' ')?.[0]);
    const lng = parseFloat(item['geo:long'] || item['georss:point']?.split(' ')?.[1]);
    if (isNaN(lat) || isNaN(lng)) return;

    const t = title.toLowerCase();
    let type = 'other';
    if (t.includes('earthquake') || t.includes('quake')) type = 'earthquake';
    else if (t.includes('flood'))                         type = 'flood';
    else if (t.includes('cyclone') || t.includes('hurricane') || t.includes('typhoon') || t.includes('storm')) type = 'storm';
    else if (t.includes('volcano') || t.includes('eruption')) type = 'volcano';
    else if (t.includes('tsunami'))                       type = 'tsunami';
    else if (t.includes('fire'))                          type = 'fire';

    const alertLevel = item['gdacs:alertlevel'] || item.alertlevel || '';
    const sevMap = { Red: 'critical', Orange: 'high', Green: 'moderate' };
    const severity = sevMap[alertLevel] || 'moderate';

    results.push({
      id: 'gdacs_' + idx + '_' + Date.now(),
      type,
      title: title.trim(),
      location: item['gdacs:country'] || title.split('-').pop()?.trim() || 'Unknown',
      lat,
      lng,
      severity,
      time: pubDate ? new Date(pubDate).toISOString() : null,
      source: 'GDACS (UN System)',
      url: link,
      description: desc.slice(0, 200),
    });
  });

  return results;
}

// ══════════════════════════════════════════════════════════════════
//  SOURCE 4: ReliefWeb API — Humanitarian Disasters  (free)
// ══════════════════════════════════════════════════════════════════
async function fetchReliefWeb() {
  const url = 'https://api.reliefweb.int/v1/disasters?appname=disasterwatch&fields[include][]=name&fields[include][]=country&fields[include][]=date&fields[include][]=type&fields[include][]=url&filter[field]=status&filter[value]=current&limit=30';

  const { data } = await axios.get(url, { timeout: 10000 });

  const typeMap = {
    EQ: 'earthquake', FL: 'flood', TC: 'storm', VO: 'volcano',
    TS: 'tsunami', WF: 'fire', DR: 'other', EP: 'other',
    AC: 'other', OT: 'other',
  };

  const results = [];
  for (const item of data.data || []) {
    const f = item.fields;
    const country = f.country?.[0];
    if (!country?.location) continue;

    const [lng, lat] = country.location.split(',').map(Number);
    if (isNaN(lat) || isNaN(lng)) continue;

    const typeCode = f.type?.[0]?.code || 'OT';
    const disasterType = typeMap[typeCode] || 'other';

    results.push({
      id: 'rw_' + item.id,
      type: disasterType,
      title: f.name,
      location: country.name || 'Unknown',
      lat,
      lng,
      severity: 'high',
      time: f.date?.created,
      source: 'ReliefWeb (OCHA)',
      url: f.url || `https://reliefweb.int/disaster/${item.id}`,
      description: `Active humanitarian disaster · ${f.type?.[0]?.name || 'Unknown type'}`,
    });
  }

  return results;
}

// ══════════════════════════════════════════════════════════════════
//  SOURCE 5: Reddit — Live Social Disaster Reports
//  Requires REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET + REDDIT_USERNAME
//  Set these as environment variables before running the server
// ══════════════════════════════════════════════════════════════════

let redditToken = null;
let redditTokenExpiry = 0;

const DISASTER_KEYWORDS = {
  earthquake: ['earthquake','quake','seismic','tremor','aftershock','magnitude'],
  flood:      ['flood','flooding','submerged','inundation','flash flood'],
  fire:       ['wildfire','fire','blaze','inferno','burning','forest fire','brushfire'],
  storm:      ['hurricane','typhoon','cyclone','tornado','storm','blizzard'],
  volcano:    ['volcano','eruption','lava','volcanic'],
  tsunami:    ['tsunami','tidal wave'],
};

// Rough location → coords map (frontend has more, backend for server-side geocoding)
const LOCATION_HINTS = {
  'turkey': [39, 35], 'california': [36.7, -119.4], 'japan': [36.2, 138.2],
  'india': [20.6, 78.9], 'indonesia': [0.8, 113.9], 'pakistan': [30.4, 69.3],
  'china': [35.9, 104.2], 'nepal': [28.4, 84.1], 'philippines': [12.9, 121.8],
  'australia': [-25.3, 133.8], 'brazil': [-14.2, -51.9], 'chile': [-35.7, -71.5],
  'italy': [41.9, 12.5], 'greece': [39.1, 21.8], 'morocco': [31.8, -7.1],
  'haiti': [18.9, -72.3], 'mexico': [23.6, -102.5], 'iran': [32.4, 53.7],
  'afghanistan': [33.9, 67.7], 'ukraine': [48.4, 31.2], 'peru': [-9.2, -75.0],
  'new zealand': [-40.9, 174.9], 'taiwan': [23.7, 120.9], 'myanmar': [21.9, 95.9],
  'thailand': [15.9, 100.9], 'bangladesh': [23.7, 90.4],
  'los angeles': [34.1, -118.2], 'san francisco': [37.8, -122.4],
  'texas': [31.0, -99.9], 'florida': [27.7, -81.5], 'alaska': [64.2, -153.4],
};

async function getRedditToken() {
  const { REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME } = process.env;
  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) return null;

  const credentials = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64');
  const { data } = await axios.post(
    'https://www.reddit.com/api/v1/access_token',
    'grant_type=client_credentials',
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': `DisasterWatch/1.0 by ${REDDIT_USERNAME || 'user'}`,
      },
      timeout: 10000,
    }
  );

  redditToken = data.access_token;
  redditTokenExpiry = Date.now() + (data.expires_in * 1000);
  return redditToken;
}

function classifyDisasterType(text) {
  const lower = text.toLowerCase();
  for (const [type, keywords] of Object.entries(DISASTER_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return type;
  }
  return null;
}

function extractLocation(text) {
  const lower = text.toLowerCase();
  for (const [name, coords] of Object.entries(LOCATION_HINTS)) {
    if (lower.includes(name)) {
      const jitter = () => (Math.random() - 0.5) * 2;
      return { name: name.charAt(0).toUpperCase() + name.slice(1), lat: coords[0] + jitter(), lng: coords[1] + jitter() };
    }
  }
  return null;
}

function scoreSeverity(upvotes, title) {
  const scaryWords = ['deadly','deaths','killed','casualties','devastating','catastrophic','emergency','massive'];
  const scary = scaryWords.some(w => title.toLowerCase().includes(w));
  if (upvotes > 5000 || (upvotes > 2000 && scary)) return 'critical';
  if (upvotes > 1000 || scary) return 'high';
  if (upvotes > 200) return 'moderate';
  return 'low';
}

async function fetchRedditPosts() {
  const { REDDIT_CLIENT_ID, REDDIT_USERNAME } = process.env;
  if (!REDDIT_CLIENT_ID) {
    console.log('  ℹ Reddit: No credentials set (REDDIT_CLIENT_ID not in env)');
    return [];
  }

  if (!redditToken || Date.now() > redditTokenExpiry - 30000) {
    await getRedditToken();
  }

  const subreddits = [
    { name: 'worldnews', query: 'earthquake OR flood OR hurricane OR wildfire OR tsunami OR volcano' },
    { name: 'news',      query: 'earthquake OR flood OR hurricane OR wildfire' },
    { name: 'earthquake', query: '' },
    { name: 'weather',   query: 'disaster OR severe OR emergency' },
  ];

  const headers = {
    Authorization: `Bearer ${redditToken}`,
    'User-Agent': `DisasterWatch/1.0 by ${REDDIT_USERNAME || 'user'}`,
  };

  const allPosts = [];

  for (const sub of subreddits) {
    try {
      const url = sub.query
        ? `https://oauth.reddit.com/r/${sub.name}/search?q=${encodeURIComponent(sub.query)}&sort=new&t=day&limit=25&restrict_sr=true`
        : `https://oauth.reddit.com/r/${sub.name}/new?limit=25`;

      const { data } = await axios.get(url, { headers, timeout: 8000 });
      const posts = data?.data?.children || [];

      for (const post of posts) {
        const p = post.data;
        if (!p.title || p.score < 10) continue;
        const type = classifyDisasterType(p.title + ' ' + (p.selftext || ''));
        if (!type) continue;
        const location = extractLocation(p.title + ' ' + (p.selftext || ''));
        if (!location) continue;

        allPosts.push({
          id: 'reddit_' + p.id,
          type,
          title: p.title.slice(0, 120),
          location: location.name,
          lat: location.lat,
          lng: location.lng,
          severity: scoreSeverity(p.score, p.title),
          time: new Date(p.created_utc * 1000).toISOString(),
          source: 'Reddit',
          url: 'https://reddit.com' + p.permalink,
          description: (p.selftext || '').slice(0, 150),
          upvotes: p.score,
          comments: p.num_comments,
          subreddit: sub.name,
        });
      }

      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.warn(`  ℹ Reddit r/${sub.name} skip:`, e.message);
    }
  }

  return allPosts;
}

// ══════════════════════════════════════════════════════════════════
//  Deduplicate incidents by proximity
// ══════════════════════════════════════════════════════════════════
function deduplicateIncidents(incidents) {
  const seen = [];
  return incidents.filter(inc => {
    const clash = seen.find(s =>
      s.type === inc.type &&
      Math.abs(s.lat - inc.lat) < 0.5 &&
      Math.abs(s.lng - inc.lng) < 0.5
    );
    if (!clash) { seen.push(inc); return true; }
    return false;
  });
}

// ══════════════════════════════════════════════════════════════════
//  Main aggregation function
// ══════════════════════════════════════════════════════════════════
async function aggregateAllSources() {
  console.log('[DisasterWatch] Fetching from all sources...');

  const results = await Promise.allSettled([
    fetchUSGS(),
    fetchNASAEONET(),
    fetchGDACS(),
    fetchReliefWeb(),
    fetchRedditPosts(),
  ]);

  const sourceNames = ['USGS', 'NASA EONET', 'GDACS', 'ReliefWeb', 'Reddit'];
  const combined = [];
  const sourceStatus = {};

  results.forEach((result, i) => {
    const name = sourceNames[i];
    if (result.status === 'fulfilled') {
      combined.push(...result.value);
      sourceStatus[name] = { ok: true, count: result.value.length };
      console.log(`  ✓ ${name}: ${result.value.length} incidents`);
    } else {
      sourceStatus[name] = { ok: false, error: result.reason?.message };
      console.warn(`  ✗ ${name}: ${result.reason?.message}`);
    }
  });

  const deduped = deduplicateIncidents(combined);
  const sevOrder = { critical: 0, high: 1, moderate: 2, low: 3 };
  deduped.sort((a, b) => {
    const sd = (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3);
    return sd !== 0 ? sd : new Date(b.time || 0) - new Date(a.time || 0);
  });

  console.log(`[DisasterWatch] Total: ${deduped.length} unique incidents`);
  return { incidents: deduped, sourceStatus, fetchedAt: new Date().toISOString() };
}

// ══════════════════════════════════════════════════════════════════
//  API Routes
// ══════════════════════════════════════════════════════════════════

// GET /api/incidents — main endpoint
app.get('/api/incidents', async (req, res) => {
  try {
    // Return cached data if fresh
    if (cache.data && cache.timestamp && (Date.now() - cache.timestamp < CACHE_TTL_MS)) {
      return res.json({ ...cache.data, fromCache: true });
    }

    const result = await aggregateAllSources();
    cache = { data: result, timestamp: Date.now() };
    res.json({ ...result, fromCache: false });

  } catch (err) {
    console.error('Aggregation error:', err);
    res.status(500).json({ error: 'Failed to fetch disaster data', message: err.message });
  }
});

// GET /api/health — health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    cacheAge: cache.timestamp ? Math.floor((Date.now() - cache.timestamp) / 1000) + 's' : 'empty',
    uptime: Math.floor(process.uptime()) + 's',
  });
});

// GET /api/incidents/:type — filter by disaster type
app.get('/api/incidents/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const all = cache.data?.incidents || (await aggregateAllSources()).incidents;
    const filtered = all.filter(i => i.type === type);
    res.json({ incidents: filtered, count: filtered.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌐 DisasterWatch API running at http://localhost:${PORT}`);
  console.log(`   Endpoints:`);
  console.log(`   GET /api/incidents       — all incidents (cached 3min)`);
  console.log(`   GET /api/incidents/:type — filter by type`);
  console.log(`   GET /api/health          — server health\n`);

  // Pre-warm cache on startup
  aggregateAllSources().then(result => {
    cache = { data: result, timestamp: Date.now() };
    console.log(`✓ Cache pre-warmed with ${result.incidents.length} incidents\n`);
  }).catch(console.error);
});
