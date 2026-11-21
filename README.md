# Ukraine War: Geolocated Footage Map

An interactive map of geolocated footage from the Russia-Ukraine war since 24 February 2022. It has a timeline slider, terrain shading and a front line that changes month by month.

**Live:** https://gavho.github.io/Russia-Ukraine-War/

> ⚠️ Some linked footage is graphic. Videos load only after you click, and each one shows its graphic-content rating first.

## How it works

- `index.html` is the whole app. It uses [MapLibre GL](https://maplibre.org/) from a CDN and needs no build step.
- `data/events.geojson` holds one point per verified post: date, place, category, graphic rating and the **URL of the original post**. The repo hosts no video. Clicking a point embeds the original Telegram, X/Twitter or YouTube post, and any other site gets a link.
- `data/frontline/YYYY-MM.geojson` stores occupied and contested areas as of the last snapshot of each month.
- `scripts/fetch_data.py` rebuilds `data/` from the sources below. It uses only the Python standard library.
- `.github/workflows/update-data.yml` runs that script daily and commits any changes.

## Adding your own videos

Add a feature to `data/events.geojson` with the same shape:

```json
{ "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [37.99, 48.59] },
  "properties": { "d": "2023-05-20", "t": "Short description", "u": "https://t.me/channel/12345",
                  "c": "Ground Battle", "g": 2, "p": "Bakhmut, Donetsk Oblast", "s": "Me" } }
```

Coordinates go in `[longitude, latitude]` order. `g` is the graphic level from 1 (none) to 5 (graphic).

Note: the daily job overwrites `events.geojson`. If you want to keep hand-added entries, put them in a separate file and merge it in the script.

## Run locally

```
python scripts/fetch_data.py      # refresh data (about 2 minutes)
python -m http.server 8000        # then open http://localhost:8000
```

## Sources and attribution

- **Footage geolocations:** [Centre for Information Resilience, Eyes on Russia](https://www.info-res.org/eyes-on-russia/), read from their public ArcGIS layer. Many entries credit GeoConfirmed and other volunteer geolocators.
- **Front line:** [DeepStateMap.live](https://deepstatemap.live). Their [license](https://deepstatemap.live/license-en.html) allows reuse with attribution. API use is free for volunteer/non-commercial projects, and commercial use needs their approval.
- **Basemap:** © [CARTO](https://carto.com/), © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors. **Terrain:** Mapzen Terrain Tiles on AWS.

This is a non-commercial project. The data is from open sources and may be incomplete or wrong.
