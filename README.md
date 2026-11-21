# Ukraine War: Geolocated Footage Map

An interactive map of geolocated footage from the Russia-Ukraine war since 24 February 2022. It has a timeline, a front line that changes every week with highlighted gains and losses, unit filters, and long-form operation footage.

**Live:** https://gavho.github.io/Russia-Ukraine-War/

> ⚠️ Some linked footage is graphic. Videos load only after you click, and each one shows its graphic-content rating first.

## What's on the map

- **Footage points.** About 27k verified posts from CIR Eyes on Russia. Each point stores the URL of the original post. The repo hosts no video: a click embeds the original Telegram, X or YouTube post.
- **Territory.** A weekly DeepStateMap snapshot of occupied and contested areas. Areas held before 2022 (Crimea, the 2014 Donbas) are a fixed, darker layer. Each week's **Russian gains (orange)** and **Ukrainian gains (blue)** are highlighted. The Territory tab charts occupied area over time and the change each week.
- **Units.** Posts whose description names a unit get a tag, which you can filter by. Long-form operation footage (GoPro and helmet-cam episodes, documentaries) comes from `public/data/episodes.json`. Each episode appears on the map and as a marker on the timeline while it is active.

## Adding an operation or episode

Add an entry to [`public/data/episodes.json`](public/data/episodes.json):

```json
{
  "id": "unique-id",
  "title": "Liberation of Andriivka",
  "unit": "3rd Assault Brigade",
  "side": "UA",
  "start": "2023-08-20",
  "end": "2023-09-16",
  "place": "Andriivka, south of Bakhmut",
  "center": [37.968, 48.502],
  "notes": "Optional context.",
  "videos": [{ "url": "https://www.youtube.com/watch?v=...", "label": "Helmet-cam footage of the assault" }],
  "sources": ["https://news-article-confirming-the-dates"]
}
```

- `center` is `[longitude, latitude]`.
- The video URL must point to the original upload.
- Telegram, X and YouTube links embed; anything else shows as a link.

To recognise more unit names in post descriptions, add regex patterns to [`scripts/units.json`](scripts/units.json).

## Project layout

- `src/` holds the React app: Vite, Tailwind, shadcn/ui and [Cult UI](https://www.cult-ui.com) components, and MapLibre GL.
- `public/data/` holds generated data, served as static files.
  - `events.geojson`: footage points.
  - `frontline/YYYY-MM-DD.geojson`: weekly occupied, contested, gain and loss areas.
  - `frontline/prewar.geojson`, `frontline/stats.json`, `frontline/index.json`.
  - `episodes.json`: curated by hand.
- `scripts/fetch_data.py` rebuilds `public/data/` (except `episodes.json`). Running it with `--selftest` checks the parsers without using the network.
- `.github/workflows/deploy.yml`:
  - Every push builds the site and deploys it to Pages.
  - A daily run, or a manual one, refreshes the data first.

## Run locally

```
npm install
npm run dev                                   # http://localhost:5173
pip install -r scripts/requirements.txt
python scripts/fetch_data.py                  # refresh data (first run ~10 min)
```

## GitHub Pages setup (once)

In the repo, go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.

## Sources and attribution

- **Footage geolocations:** [Centre for Information Resilience, Eyes on Russia](https://www.info-res.org/eyes-on-russia/). Many entries credit GeoConfirmed and other volunteer geolocators.
- **Territory:** [DeepStateMap.live](https://deepstatemap.live). Their [license](https://deepstatemap.live/license-en.html) allows reuse with attribution. Areas are simplified, and km² figures are approximate.
- **Basemap:** © [CARTO](https://carto.com/), © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
- **Terrain:** Mapzen Terrain Tiles on AWS.

This is a non-commercial project. The data comes from open sources and may be incomplete or wrong. Unit tags are matched from text and are not verified.
