# 🌍 DisasterWatch — Live Global Incident Map

A real-time disaster monitoring web app that aggregates live data from multiple
official sources and plots incidents on an interactive dark-themed world map.

---

## 🖥️ What It Does

- **Plots live disasters** on a world map (earthquakes, floods, wildfires, storms, volcanoes, tsunamis)
- **Click any dot** to see: disaster type, exact location, severity, time, and a direct source link
- **Filters** by disaster type in the sidebar
- **Auto-refreshes** every 5 minutes
- **Sidebar list** of all active incidents, sorted by severity

---

## 📡 Data Sources (All Free, No API Key Needed)

| Source | What it provides | Update freq |
|--------|----------------|-------------|
| **USGS** | Earthquakes M2.5+ worldwide | Real-time |
| **NASA EONET** | Wildfires, floods, storms, volcanoes | Daily |
| **GDACS (UN)** | Multi-hazard alerts, humanitarian | Daily |
| **ReliefWeb (OCHA)** | Active humanitarian disasters | Daily |

---

## 🚀 Quick Start

### Option A: Just the Frontend (No Server Needed)
The `index.html` calls public APIs directly from your browser.
Just open it!

```bash
# Simply open in browser:
open index.html

# Or serve with any static server:
npx serve .
python3 -m http.server 8080
```

### Option B: Full Stack (Frontend + Backend)

The backend caches API responses and avoids CORS issues.

#### 1. Start the Backend

```bash
cd backend
npm install
npm start
# Server runs on http://localhost:3001
```

#### 2. Connect Frontend to Backend

In `index.html`, find the `refreshData()` function and uncomment the backend fetch:

```javascript
// Change this line:
const [usgsData, nasaData, gdacsData] = await Promise.allSettled([...]);

// To this (uses your backend):
const res = await fetch('http://localhost:3001/api/incidents');
const result = await res.json();
allIncidents = result.incidents;
```

---

## 📁 Project Structure

```
disaster-watch/
├── index.html              ← Frontend (open this in browser)
├── README.md
└── backend/
    ├── server.js           ← Express API server
    └── package.json
```

---

## 🗺️ Map Dot Colors

| Color | Severity |
|-------|----------|
| 🔴 Red (pulsing) | Critical — M6.5+ earthquakes, red-alert events |
| 🟠 Orange | High — M5.5+, major storms, volcanoes |
| 🟡 Yellow | Moderate — M4.5+, active floods |
| 🟢 Green | Low severity |

Dot shape colors indicate disaster type:
- 🔴 Earthquake · 🔵 Flood · 🟠 Fire · 🟣 Storm · 🟤 Volcano · 🔷 Tsunami

---

## ☁️ Deployment

### Frontend → Vercel / Netlify (free)
```bash
npx vercel        # or drag-drop to netlify.com
```

### Backend → Railway / Render (free tier)
```bash
# Railway:
npm install -g @railway/cli
railway up

# Render: connect GitHub repo, set build=npm install, start=node server.js
```

---

## ➕ Adding Reddit (Step by Step — No Experience Needed!)

Reddit is like a giant notice board where millions of people post disaster news in real time. Here's how to connect it, explained simply:

### 🧒 What's an API key? Why do I need one?
Imagine Reddit is a library. To borrow books (read posts) automatically with a robot, you need a **library card**. The API key IS the library card. It's free, takes 2 minutes, and proves you're a real person not a spam bot.

### Step 1 — Create your free Reddit API key
1. Go to: **https://www.reddit.com/prefs/apps** (log in if needed)
2. Click **"Create App"** at the bottom
3. Fill in:
   - **Name:** `DisasterWatch` (anything)
   - **Type:** Select **"script"**  ← important!
   - **Redirect URI:** `http://localhost:8080`
4. Click **Create App**
5. You'll see two codes appear:
   - Short code **under your app name** = your **Client ID**
   - Longer code next to the word "secret" = your **Client Secret**

### Step 2 — Add keys to the app

**Frontend (easy way):** Click the orange **"⊕ Reddit"** button in the top-right of the app, paste your codes in, done!

**Backend (if running server.js):**
Create a file called `.env` in your `backend/` folder:
```
REDDIT_CLIENT_ID=your_short_code_here
REDDIT_CLIENT_SECRET=your_long_secret_here
REDDIT_USERNAME=your_reddit_username
```
Then run `npm start` — the server will pick it up automatically.

### 🔍 What subreddits does it monitor?
- r/worldnews — global disaster news
- r/news — US news with disasters
- r/earthquake — dedicated earthquake community
- r/weather — severe weather events
- r/collapse — environmental disasters

---

## 🔮 Roadmap

- [ ] Twitter/X social media monitoring
- [ ] Push notifications for new critical events
- [ ] Historical incident heatmap
- [ ] Population impact estimates
- [ ] Mobile app (React Native)
- [ ] Webhook alerts to Slack/Discord

---

## 📝 Notes

- The frontend works standalone with direct API calls (may have some CORS limitations on GDACS)
- The backend solves CORS issues and caches results for 3 minutes to avoid rate limiting
- All data sources are official government/UN sources — no scraping

---

Made with ❤️ using Leaflet.js, Express, and open government APIs
