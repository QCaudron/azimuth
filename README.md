# Azimuthal Map (`quentincaudron.com/azimuth`)

Interactive azimuthal equidistant projection map designed for amateur radio operators, served statically via GitHub Pages at [quentincaudron.com/azimuth](https://quentincaudron.com/azimuth/).

## Features

- **Azimuthal Equidistant Projection**: True great-circle bearings and linear radial distances from any chosen station center (QTH).
- **Default Center & Radius**: Defaults to Bretagne (`47.943355, -3.084990`, Maidenhead `IN87kw`) with an `8,000 km` radius.
- **Interactive Pan & Zoom**:
  - Drag anywhere on the map to smoothly pan the projection center across the globe.
  - Scroll or pinch to zoom the map radius from `500 km` out to `20,015 km` (full antipodal Earth).
- **Compass Bezel & Distance Rings**:
  - Outer degree ring with `1°`, `5°`, and `10°` ticks and tangential bearing labels every `10°`.
  - Concentric distance rings and radial `10°` bearing lines matching classic NS6T azimuthal charts.
- **Amateur Radio Tools**:
  - Live cursor and click-to-pin target readout showing **Short Path (SP)** and **Long Path (LP)** bearings and distances, country/state name, DXCC prefix, coordinates, and 6-character Maidenhead grid locator.
  - Country labels (`Name`, `Name + DXCC`, `DXCC Only`, `Off`) and toggleable **US States & Canadian Provinces** outlines and labels.
  - Toggleable **Live Solar Greyline / Day-Night Terminator** overlay with real-time UTC clock.
  - **Classic Light** (NS6T style) and **Shack Dark** themes.

## Local Development

```bash
npm install
npm run dev
```

To build the static bundle for production:

```bash
npm run build
```
