'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Use a stable public MapLibre worker so the map also renders correctly on Vercel/Next.js.
if (typeof window !== 'undefined') {
  maplibregl.setWorkerUrl('https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl-csp-worker.js');
}
import './globals.css';

type Location = { name: string; type: string; center: [number, number] };

const locations: Location[] = [
  { name: 'Tata Steel', type: 'Industrial Zone', center: [22.8000, 86.1950] },
  { name: 'Bistupur', type: 'Commercial Zone', center: [22.7980, 86.1880] },
  { name: 'Sakchi', type: 'High Traffic Zone', center: [22.8040, 86.2020] },
  { name: 'Jubilee Park', type: 'Green Zone', center: [22.8072, 86.1928] },
  { name: 'Mango', type: 'Residential / Traffic Zone', center: [22.8210, 86.2080] },
];

const routes: [number, number][][] = [
  [[22.7930,86.1830],[22.7970,86.1900],[22.8020,86.1980],[22.8070,86.2050],[22.8130,86.2130]],
  [[22.8040,86.1810],[22.8040,86.1900],[22.8040,86.2010],[22.8050,86.2110],[22.8050,86.2180]],
  [[22.8150,86.1950],[22.8080,86.1990],[22.8010,86.2020],[22.7940,86.2050]],
];

function interpolate(route: [number,number][], t: number): [number,number] {
  const p = (t % 1) * (route.length - 1);
  const i = Math.min(route.length - 2, Math.floor(p));
  const f = p - i;
  const a = route[i], b = route[i + 1];
  return [a[0] + (b[0]-a[0])*f, a[1] + (b[1]-a[1])*f];
}

function MapView({ traffic, emissions, rainfall, time, layers, selected, onSelect }: {
  traffic:number; emissions:number; rainfall:number; time:number; layers:Record<string,boolean>; selected:string; onSelect:(l:Location)=>void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const animationRef = useRef<number | null>(null);
  const values = useRef({ traffic, layers });
  values.current = { traffic, layers };

  useEffect(() => {
    let cancelled = false;

    const map = new maplibregl.Map({
      container: container.current as HTMLElement,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [86.2029, 22.8046],
      zoom: 13.65,
      pitch: 52,
      bearing: -12,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    const add3DBuildings = () => {
      if (cancelled) return;
      const style = map.getStyle();

      const existing3d = (style.layers || []).find((layer: any) =>
        layer.type === 'fill-extrusion' && String(layer['source-layer'] || '').toLowerCase().includes('building')
      );

      if (existing3d) {
        map.setLayoutProperty(existing3d.id, 'visibility', layers.buildings ? 'visible' : 'none');
        return;
      }

      const buildingLayer = (style.layers || []).find((layer: any) =>
        String(layer['source-layer'] || '').toLowerCase() === 'building' &&
        typeof layer.source === 'string'
      ) as any;

      if (!buildingLayer) return;

      const firstSymbol = (style.layers || []).find((layer: any) =>
        layer.type === 'symbol' && typeof layer.source === 'string'
      );

      map.addLayer({
        id: 'jamshedpur-3d-buildings',
        type: 'fill-extrusion',
        source: buildingLayer.source,
        'source-layer': buildingLayer['source-layer'],
        minzoom: 12.5,
        filter: ['!=', ['get', 'hide_3d'], true],
        paint: {
          'fill-extrusion-color': [
            'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], ['get', 'height'], 8],
            0, '#8a9baa',
            12, '#aebbc5',
            30, '#718797',
            60, '#526978',
            120, '#3e5668'
          ],
          'fill-extrusion-height': [
            'coalesce', ['get', 'render_height'], ['get', 'height'], 8
          ],
          'fill-extrusion-base': [
            'coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0
          ],
          'fill-extrusion-opacity': 0.92,
        }
      }, firstSymbol?.id);

      map.setLayoutProperty('jamshedpur-3d-buildings', 'visibility', layers.buildings ? 'visible' : 'none');
    };

    map.on('load', () => {
      if (cancelled) return;

      add3DBuildings();

      locations.forEach((loc) => {
        const el = document.createElement('button');
        el.className = 'city-marker';
        el.type = 'button';
        el.setAttribute('aria-label', loc.name);
        el.innerHTML = '<span></span>';
        el.addEventListener('click', () => onSelect(loc));

        new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([loc.center[1], loc.center[0]])
          .setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(
            '<strong>' + loc.name + '</strong><br/><small>' + loc.type + '</small>'
          ))
          .addTo(map);
      });

      const pollution = {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [86.1950, 22.8000] },
          properties: {}
        }
      } as any;

      map.addSource('pollution-zone', pollution);
      map.addLayer({
        id: 'pollution-zone-fill',
        type: 'circle',
        source: 'pollution-zone',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 25, 14, 75, 16, 145],
          'circle-color': '#ef5350',
          'circle-opacity': 0.16,
          'circle-stroke-color': '#ff8178',
          'circle-stroke-opacity': 0.65,
          'circle-stroke-width': 1
        }
      });

      const floodGeo = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[86.201,22.810],[86.209,22.810],[86.211,22.816],[86.204,22.819],[86.199,22.815],[86.201,22.810]]]
        },
        properties: {}
      } as any;

      map.addSource('flood-zone', { type: 'geojson', data: floodGeo });
      map.addLayer({
        id: 'flood-zone-fill',
        type: 'fill',
        source: 'flood-zone',
        paint: { 'fill-color': '#38a8ff', 'fill-opacity': 0.16, 'fill-outline-color': '#70c8ff' }
      });

      map.addSource('traffic-routes', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: routes.map(route => ({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: route.map(([lat,lng]) => [lng,lat]) },
            properties: {}
          }))
        }
      } as any);

      map.addLayer({
        id: 'traffic-routes',
        type: 'line',
        source: 'traffic-routes',
        paint: {
          'line-color': '#f2b84b',
          'line-width': 2,
          'line-opacity': 0.42,
          'line-dasharray': [1.2, 1.8]
        }
      });

      const cars = Array.from({length:14}, (_,i) => {
        const el = document.createElement('div');
        el.className = 'car-marker';
        el.innerHTML = '<div class="car-body"><i></i><i></i></div>';
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([routes[i % routes.length][0][1], routes[i % routes.length][0][0]])
          .addTo(map);
        return marker;
      });
      markersRef.current = cars;

      const animate = (now:number) => {
        const { traffic:tv, layers:ls } = values.current;
        cars.forEach((car,i) => {
          const t = (now * (0.000008 + tv * 0.00000007) + i/cars.length) % 1;
          const [lat,lng] = interpolate(routes[i % routes.length], t);
          car.setLngLat([lng, lat]);
          const el = car.getElement();
          el.classList.toggle('hidden-car', !ls.vehicles);
        });
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);

      setTimeout(() => map.resize(), 80);
      setTimeout(() => map.resize(), 500);
    });

    return () => {
      cancelled = true;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const loc = locations.find(x => x.name === selected);
    if (loc) map.flyTo({ center: [loc.center[1], loc.center[0]], zoom: 15.2, pitch: 58, duration: 900 });
  }, [selected]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (map.getLayer('jamshedpur-3d-buildings')) {
      map.setLayoutProperty('jamshedpur-3d-buildings', 'visibility', layers.buildings ? 'visible' : 'none');
    }

    if (map.getLayer('traffic-routes')) {
      map.setLayoutProperty('traffic-routes', 'visibility', layers.roads ? 'visible' : 'none');
    }

    if (map.getLayer('pollution-zone-fill')) {
      map.setPaintProperty('pollution-zone-fill', 'circle-opacity', layers.pollution ? Math.min(.5, .08 + emissions/220) : 0);
      map.setPaintProperty('pollution-zone-fill', 'circle-radius', ['interpolate', ['linear'], ['zoom'], 11, 25 + emissions*.2, 14, 75 + emissions*2.5, 16, 145 + emissions*4]);
    }

    if (map.getLayer('flood-zone-fill')) {
      map.setPaintProperty('flood-zone-fill', 'fill-opacity', layers.flood ? Math.min(.55, .08 + rainfall/250) : 0);
    }

    const night = time >= 18 || time < 6;
    const canvas = map.getCanvas();
    canvas.style.filter = `brightness(${night ? .58 : time < 8 || time >= 16 ? .84 : 1}) saturate(${night ? .78 : 1})`;
  }, [layers, emissions, rainfall, time]);

  return <div ref={container} className="map-container" />;
}

export default function Home() {
  const [traffic,setTraffic]=useState(50),[emissions,setEmissions]=useState(45),[rainfall,setRainfall]=useState(20),[time,setTime]=useState(14);
  const [layers,setLayers]=useState({buildings:true,roads:true,vehicles:true,pollution:true,flood:true});
  const [selected,setSelected]=useState('Jamshedpur');
  const selectedLocation=useMemo(()=>locations.find(x=>x.name===selected),[selected]);
  const aqi=Math.round(42+emissions*.7+traffic*.18), congestion=Math.round(Math.min(100,traffic*1.05)), floodRisk=Math.round(Math.min(100,rainfall*1.25));
  const health=Math.round(Math.max(0,100-aqi*.25-congestion*.18-floodRisk*.12));
  const selectLocation=useCallback((loc:Location)=>setSelected(loc.name),[]);
  const toggle=(key:keyof typeof layers)=>setLayers(x=>({...x,[key]:!x[key]}));
  const rows:[keyof typeof layers,string][]=[['buildings','Real 3D Buildings'],['roads','OpenStreetMap Roads'],['vehicles','Detailed Moving Cars'],['pollution','Pollution Zones'],['flood','Waterlogging']];
  return <main className="app-shell">
    <header className="topbar"><div><div className="eyebrow">SMART CITY DIGITAL TWIN · 3D OPEN MAP</div><h1>JAMSHEDPUR</h1></div><div className="time-badge">{String(time).padStart(2,'0')}:00 <span>IST</span></div></header>
    <section className="workspace">
      <aside className="panel left-panel"><div className="panel-title">CITY LAYERS</div>{rows.map(([key,label])=><button className="switch-row" key={key} onClick={()=>toggle(key)}><span>{label}</span><i className={layers[key]?'switch on':'switch'}><b/></i></button>)}
      <div className="divider"/><div className="panel-title">SIMULATION</div>
      <label>Traffic Volume <b>{traffic}%</b></label><input type="range" min="0" max="100" value={traffic} onChange={e=>setTraffic(+e.target.value)}/>
      <label>Industrial Emissions <b>{emissions}%</b></label><input type="range" min="0" max="100" value={emissions} onChange={e=>setEmissions(+e.target.value)}/>
      <label>Rainfall <b>{rainfall}%</b></label><input type="range" min="0" max="100" value={rainfall} onChange={e=>setRainfall(+e.target.value)}/>
      <label>Time of Day <b>{String(time).padStart(2,'0')}:00</b></label><input type="range" min="0" max="23" value={time} onChange={e=>setTime(+e.target.value)}/>
      <div className="time-presets">{[[7,'Morning'],[12,'Noon'],[18,'Evening'],[22,'Night']].map(([t,label])=><button key={t} onClick={()=>setTime(Number(t))}>{label}</button>)}</div></aside>
      <div className="city-view"><MapView traffic={traffic} emissions={emissions} rainfall={rainfall} time={time} layers={layers} selected={selected} onSelect={selectLocation}/><div className="selected-card"><span>SELECTED LOCATION</span><strong>{selected}</strong><small>{selectedLocation?.type ?? 'Interactive city map'}</small></div><div className="map-hint">3D Buildings · Drag · Scroll · Right-drag to rotate · Click locations</div></div>
      <aside className="panel right-panel"><div className="panel-title">CITY STATUS</div><div className="health-card"><span>CITY HEALTH INDEX</span><strong>{health}</strong><small>SIMULATED · LIVE CONTROLS</small></div><div className="metric"><span>AIR QUALITY</span><strong>{aqi} AQI</strong><em>{aqi>100?'Elevated':'Moderate'}</em></div><div className="metric"><span>TRAFFIC</span><strong>{congestion}%</strong><em>{congestion>70?'Heavy':'Moving'}</em></div><div className="metric"><span>WATERLOGGING RISK</span><strong>{floodRisk}%</strong><em>{floodRisk>60?'High':'Low'}</em></div><div className="divider"/><div className="panel-title">LOCATIONS</div>{locations.map(loc=><button className={selected===loc.name?'location-btn active':'location-btn'} key={loc.name} onClick={()=>setSelected(loc.name)}><span>●</span><div><b>{loc.name}</b><small>{loc.type}</small></div></button>)}</aside>
    </section>
  </main>;
}
