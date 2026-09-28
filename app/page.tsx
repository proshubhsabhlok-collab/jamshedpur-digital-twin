'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap, Marker } from 'maplibre-gl';

type Location = { name: string; type: string; center: [number, number] };

const locations: Location[] = [
  { name: 'Tata Steel', type: 'Industrial Zone', center: [86.1950, 22.8000] },
  { name: 'Bistupur', type: 'Commercial Zone', center: [86.1880, 22.7980] },
  { name: 'Sakchi', type: 'High Traffic Zone', center: [86.2020, 22.8040] },
  { name: 'Jubilee Park', type: 'Green Zone', center: [86.1928, 22.8072] },
  { name: 'Mango', type: 'Residential / Traffic Zone', center: [86.2080, 22.8210] },
];

const vehicleRoutes = [
  [[86.1830, 22.7930], [86.1900, 22.7970], [86.1980, 22.8020], [86.2050, 22.8070], [86.2130, 22.8130]],
  [[86.1810, 22.8040], [86.1900, 22.8040], [86.2010, 22.8040], [86.2110, 22.8050], [86.2180, 22.8050]],
  [[86.1950, 22.8150], [86.1990, 22.8080], [86.2020, 22.8010], [86.2050, 22.7940]],
] as [number, number][][];

function makeCarElement(scale = 1) {
  const el = document.createElement('div');
  el.className = 'car-marker';
  el.style.transform = `scale(${scale})`;
  el.innerHTML = `
    <svg width="46" height="28" viewBox="0 0 46 28" aria-hidden="true">
      <defs>
        <linearGradient id="carPaint" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#e9f2fb"/>
          <stop offset=".42" stop-color="#4d667c"/>
          <stop offset="1" stop-color="#182633"/>
        </linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#c9eaff"/>
          <stop offset=".5" stop-color="#29465c"/>
          <stop offset="1" stop-color="#0b1721"/>
        </linearGradient>
      </defs>
      <ellipse cx="23" cy="25" rx="18" ry="2.5" fill="rgba(0,0,0,.45)"/>
      <path d="M7 19 L10 10 Q11 7 15 6 L29 6 Q33 7 36 11 L40 13 Q42 14 42 19 L40 22 L8 22 Z" fill="url(#carPaint)" stroke="#081018" stroke-width="1.3"/>
      <path d="M15 7.5 L20.5 7.5 L20.5 13.2 L12.2 13.2 L13.7 9 Q14 8 15 7.5Z" fill="url(#glass)" stroke="#91b5cc" stroke-width=".6"/>
      <path d="M22 7.5 L28.5 7.5 Q31 8 33 10.2 L35.3 13.2 L22 13.2Z" fill="url(#glass)" stroke="#91b5cc" stroke-width=".6"/>
      <path d="M21.5 7.5 L21.5 21" stroke="#111d27" stroke-width="1"/>
      <path d="M8.5 17.5 L20 17.5 M22 17.5 L34 17.5" stroke="#17232d" stroke-width=".8"/>
      <circle cx="12" cy="22" r="4" fill="#10151a" stroke="#71818c" stroke-width="1"/><circle cx="34" cy="22" r="4" fill="#10151a" stroke="#71818c" stroke-width="1"/>
      <circle cx="12" cy="22" r="1.4" fill="#d8e0e5"/><circle cx="34" cy="22" r="1.4" fill="#d8e0e5"/>
      <rect x="38.5" y="14.5" width="3" height="2" rx="1" fill="#fff3bd"/>
      <rect x="5.5" y="15" width="2.5" height="2" rx="1" fill="#ff5347"/>
    </svg>`;
  return el;
}

function interpolate(route: [number, number][], t: number) {
  const n = route.length - 1;
  const p = Math.min(n - 0.0001, t * n);
  const i = Math.floor(p);
  const f = p - i;
  const a = route[i];
  const b = route[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] as [number, number];
}

function MapView({
  traffic,
  emissions,
  rainfall,
  time,
  layers,
  selected,
  onSelect,
}: {
  traffic: number; emissions: number; rainfall: number; time: number;
  layers: Record<string, boolean>;
  selected: string;
  onSelect: (location: Location) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const animationRef = useRef<number | null>(null);
  const values = useRef({ traffic, emissions, rainfall, time, layers });
  values.current = { traffic, emissions, rainfall, time, layers };

  useEffect(() => {
    if (!container.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: container.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [86.2029, 22.8046],
      zoom: 13.7,
      pitch: 58,
      bearing: -12,
      maxPitch: 70,
      attributionControl: {},
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    map.on('load', () => {
      const styleLayers = map.getStyle().layers || [];
      const has3DBuildings = styleLayers.some((l) => l.type === 'fill-extrusion' && /building/i.test(l.id));
      if (!has3DBuildings) {
        try {
          map.addLayer({
            id: 'jamshedpur-3d-buildings',
            type: 'fill-extrusion',
            source: 'openmaptiles',
            'source-layer': 'building',
            minzoom: 14,
            paint: {
              'fill-extrusion-color': '#667586',
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 9],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
              'fill-extrusion-opacity': 0.88,
            },
          });
        } catch {}
      }

      map.addSource('pollution', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [
          { type: 'Feature', properties: { intensity: 0.9 }, geometry: { type: 'Point', coordinates: [86.1950, 22.8000] } },
          { type: 'Feature', properties: { intensity: 0.65 }, geometry: { type: 'Point', coordinates: [86.2020, 22.8040] } },
        ]},
      });
      map.addLayer({
        id: 'simulation-pollution',
        type: 'circle',
        source: 'pollution',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 16, 14, 42, 17, 85],
          'circle-color': '#ef5350',
          'circle-opacity': 0.16,
          'circle-stroke-color': '#ff8a80',
          'circle-stroke-opacity': 0.45,
          'circle-stroke-width': 1,
        },
      });

      map.addSource('flood', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [
          { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[86.201,22.810],[86.209,22.810],[86.211,22.816],[86.204,22.819],[86.199,22.815],[86.201,22.810]]] } },
        ]},
      });
      map.addLayer({
        id: 'simulation-flood',
        type: 'fill',
        source: 'flood',
        paint: { 'fill-color': '#38a8ff', 'fill-opacity': 0.18, 'fill-outline-color': '#70c8ff' },
      });

      locations.forEach((loc) => {
        const marker = new maplibregl.Marker({ color: '#d7e9f7' })
          .setLngLat(loc.center)
          .setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(`<b>${loc.name}</b><br/><span>${loc.type}</span>`))
          .addTo(map);
        marker.getElement().addEventListener('click', () => onSelect(loc));
      });

      const carCount = 14;
      const markers = Array.from({ length: carCount }, (_, i) => {
        const el = makeCarElement(i % 3 === 0 ? 1 : 0.82);
        const marker = new maplibregl.Marker({ element: el, anchor: 'center', rotationAlignment: 'map' })
          .setLngLat(vehicleRoutes[i % vehicleRoutes.length][0])
          .addTo(map);
        return marker;
      });
      markersRef.current = markers;

      const animate = (now: number) => {
        const { traffic: tv, layers: ls } = values.current;
        if (ls.vehicles) {
          markers.forEach((m, i) => {
            const phase = ((now * (0.000018 + tv * 0.00000012)) + i / markers.length) % 1;
            m.setLngLat(interpolate(vehicleRoutes[i % vehicleRoutes.length], phase));
          });
        }
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);
    });

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      markersRef.current.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
  }, [onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const loc = locations.find((x) => x.name === selected);
    if (loc) map.flyTo({ center: loc.center, zoom: 15.2, pitch: 62, duration: 1100 });
  }, [selected]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const setVisibility = (pattern: RegExp, visible: boolean) => {
      (map.getStyle().layers || []).forEach((layer) => {
        if (pattern.test(layer.id)) {
          try { map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none'); } catch {}
        }
      });
    };
    setVisibility(/building/i, layers.buildings);
    setVisibility(/road|street|highway/i, layers.roads);
    const p = map.getLayer('simulation-pollution');
    if (p) map.setLayoutProperty('simulation-pollution', 'visibility', layers.pollution ? 'visible' : 'none');
    const f = map.getLayer('simulation-flood');
    if (f) map.setLayoutProperty('simulation-flood', 'visibility', layers.flood ? 'visible' : 'none');
    markersRef.current.forEach((m) => {
      m.getElement().style.display = layers.vehicles ? 'block' : 'none';
    });
    const brightness = time >= 18 || time < 6 ? 0.66 : time < 8 || time >= 16 ? 0.84 : 1;
    const el = map.getContainer();
    el.style.filter = `brightness(${brightness}) saturate(${time >= 18 || time < 6 ? 0.72 : 1})`;
  }, [layers, time]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const radius = 20 + emissions * 0.42;
    const floodOpacity = Math.min(0.52, 0.12 + rainfall / 260);
    const poll = map.getLayer('simulation-pollution');
    if (poll) {
      map.setPaintProperty('simulation-pollution', 'circle-radius', ['interpolate', ['linear'], ['zoom'], 11, radius * .55, 14, radius, 17, radius * 1.9]);
      map.setPaintProperty('simulation-pollution', 'circle-opacity', Math.min(0.42, 0.08 + emissions / 240));
    }
    const flood = map.getLayer('simulation-flood');
    if (flood) map.setPaintProperty('simulation-flood', 'fill-opacity', floodOpacity);
  }, [emissions, rainfall, traffic]);

  return <div ref={container} className="map-container" />;
}

export default function Home() {
  const [traffic, setTraffic] = useState(50);
  const [emissions, setEmissions] = useState(45);
  const [rainfall, setRainfall] = useState(20);
  const [time, setTime] = useState(14);
  const [layers, setLayers] = useState({ buildings: true, roads: true, vehicles: true, pollution: true, flood: true });
  const [selected, setSelected] = useState('Jamshedpur');
  const selectedLocation = useMemo(() => locations.find((x) => x.name === selected), [selected]);

  const aqi = Math.round(42 + emissions * 0.7 + traffic * 0.18);
  const congestion = Math.round(Math.min(100, traffic * 1.05));
  const floodRisk = Math.round(Math.min(100, rainfall * 1.25));
  const health = Math.round(Math.max(0, 100 - aqi * 0.25 - congestion * 0.18 - floodRisk * 0.12));

  const selectLocation = useCallback((loc: Location) => setSelected(loc.name), []);
  const toggle = (key: keyof typeof layers) => setLayers((x) => ({ ...x, [key]: !x[key] }));

  const layerRows: [keyof typeof layers, string][] = [
    ['buildings', 'Real 3D Buildings'], ['roads', 'OpenStreetMap Roads'], ['vehicles', 'Detailed Moving Cars'],
    ['pollution', 'Pollution Zones'], ['flood', 'Waterlogging'],
  ];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><div className="eyebrow">SMART CITY DIGITAL TWIN · OPENSTREETMAP</div><h1>JAMSHEDPUR</h1></div>
        <div className="time-badge">{String(Math.floor(time)).padStart(2, '0')}:00 <span>IST</span></div>
      </header>

      <section className="workspace">
        <aside className="panel left-panel">
          <div className="panel-title">CITY LAYERS</div>
          {layerRows.map(([key, label]) => (
            <button className="switch-row" key={key} onClick={() => toggle(key)}>
              <span>{label}</span><i className={layers[key] ? 'switch on' : 'switch'}><b /></i>
            </button>
          ))}
          <div className="divider" />
          <div className="panel-title">SIMULATION</div>
          <label>Traffic Volume <b>{traffic}%</b></label>
          <input type="range" min="0" max="100" value={traffic} onChange={(e) => setTraffic(+e.target.value)} />
          <label>Industrial Emissions <b>{emissions}%</b></label>
          <input type="range" min="0" max="100" value={emissions} onChange={(e) => setEmissions(+e.target.value)} />
          <label>Rainfall <b>{rainfall}%</b></label>
          <input type="range" min="0" max="100" value={rainfall} onChange={(e) => setRainfall(+e.target.value)} />
          <label>Time of Day <b>{String(time).padStart(2,'0')}:00</b></label>
          <input type="range" min="0" max="23" value={time} onChange={(e) => setTime(+e.target.value)} />
          <div className="time-presets">
            {[7, 12, 18, 22].map((t) => <button key={t} onClick={() => setTime(t)}>{t === 7 ? 'Morning' : t === 12 ? 'Noon' : t === 18 ? 'Evening' : 'Night'}</button>)}
          </div>
        </aside>

        <div className="city-view">
          <MapView traffic={traffic} emissions={emissions} rainfall={rainfall} time={time} layers={layers} selected={selected} onSelect={selectLocation} />
          <div className="selected-card"><span>SELECTED LOCATION</span><strong>{selected}</strong><small>{selectedLocation?.type ?? 'Interactive city map'}</small></div>
          <div className="map-hint">Drag to orbit · Scroll to zoom · Click a location · Toggle live layers</div>
        </div>

        <aside className="panel right-panel">
          <div className="panel-title">CITY STATUS</div>
          <div className="health-card"><span>CITY HEALTH INDEX</span><strong>{health}</strong><small>SIMULATED · LIVE CONTROLS</small></div>
          <div className="metric"><span>AIR QUALITY</span><strong>{aqi} AQI</strong><em className={aqi > 100 ? 'warn' : ''}>{aqi > 100 ? 'Elevated' : 'Moderate'}</em></div>
          <div className="metric"><span>TRAFFIC</span><strong>{congestion}%</strong><em>{congestion > 70 ? 'Heavy' : 'Moving'}</em></div>
          <div className="metric"><span>WATERLOGGING RISK</span><strong>{floodRisk}%</strong><em>{floodRisk > 60 ? 'High' : 'Low'}</em></div>
          <div className="divider" />
          <div className="panel-title">LOCATIONS</div>
          {locations.map((location) => (
            <button className={selected === location.name ? 'location-btn active' : 'location-btn'} key={location.name} onClick={() => setSelected(location.name)}>
              <span>●</span><div><b>{location.name}</b><small>{location.type}</small></div>
            </button>
          ))}
        </aside>
      </section>
    </main>
  );
}
