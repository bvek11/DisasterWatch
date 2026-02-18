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

Made with ❤️ using Leaflet.js, Express, and open government APIs
