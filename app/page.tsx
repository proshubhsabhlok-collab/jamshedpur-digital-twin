'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker as LeafletMarker, Circle, Polygon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
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

function carIcon(L: typeof import('leaflet')) {
  return L.divIcon({ className: 'car-icon-wrap', iconSize: [46,28], iconAnchor: [23,14], html: `<div class="car-marker"><svg width="46" height="28" viewBox="0 0 46 28"><path d="M7 19L10 10Q11 7 15 6L29 6Q33 7 36 11L40 13Q42 14 42 19L40 22L8 22Z" fill="#405a70" stroke="#09131c" stroke-width="1.4"/><path d="M15 7.5L20.5 7.5L20.5 13.2L12.2 13.2L13.7 9Q14 8 15 7.5Z" fill="#9bc5df" stroke="#d2edf9" stroke-width=".5"/><path d="M22 7.5L28.5 7.5Q31 8 33 10.2L35.3 13.2L22 13.2Z" fill="#79a7c0" stroke="#d2edf9" stroke-width=".5"/><circle cx="12" cy="22" r="4" fill="#10151a" stroke="#71818c"/><circle cx="34" cy="22" r="4" fill="#10151a" stroke="#71818c"/><rect x="38.5" y="14.5" width="3" height="2" rx="1" fill="#fff3bd"/><rect x="5.5" y="15" width="2.5" height="2" rx="1" fill="#ff5347"/></svg></div>` });
}

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
  const mapRef = useRef<LeafletMap | null>(null);
  const carsRef = useRef<LeafletMarker[]>([]);
  const pollutionRef = useRef<Circle | null>(null);
  const floodRef = useRef<Polygon | null>(null);
  const values = useRef({ traffic, layers });
  values.current = { traffic, layers };

  useEffect(() => {
    let cancelled = false;
    let animation = 0;
    let L: typeof import('leaflet');

    (async () => {
      L = await import('leaflet');
      if (cancelled || !container.current || mapRef.current) return;

      const map = L.map(container.current, { zoomControl: false, preferCanvas: true }).setView([22.8046,86.2029], 13.7);
      mapRef.current = map;
      L.control.zoom({ position: 'topright' }).addTo(map);

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      locations.forEach((loc) => {
        const marker = L.marker(loc.center).addTo(map);
        marker.bindPopup(`<b>${loc.name}</b><br>${loc.type}`);
        marker.on('click', () => onSelect(loc));
      });

      pollutionRef.current = L.circle([22.8000,86.1950], { radius: 650, color:'#ff8178', weight:1, fillColor:'#ef5350', fillOpacity:.16 }).addTo(map);
      floodRef.current = L.polygon([[22.810,86.201],[22.810,86.209],[22.816,86.211],[22.819,86.204],[22.815,86.199]], { color:'#70c8ff', weight:1, fillColor:'#38a8ff', fillOpacity:.16 }).addTo(map);

      const cars = Array.from({length:14}, (_,i) => L.marker(routes[i % routes.length][0], { icon: carIcon(L), zIndexOffset: 500 }).addTo(map));
      carsRef.current = cars;

      const animate = (now:number) => {
        const { traffic:tv, layers:ls } = values.current;
        cars.forEach((car,i) => {
          if (!ls.vehicles) return;
          const t = (now * (0.000008 + tv * 0.00000007) + i/cars.length) % 1;
          car.setLatLng(interpolate(routes[i % routes.length], t));
        });
        animation = requestAnimationFrame(animate);
      };
      animation = requestAnimationFrame(animate);
      setTimeout(() => map.invalidateSize(), 50);
      setTimeout(() => map.invalidateSize(), 400);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animation);
      carsRef.current.forEach(c => c.remove());
      if (mapRef.current) mapRef.current.remove();
      mapRef.current = null;
    };
  }, [onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const loc = locations.find(x => x.name === selected);
    if (loc) map.flyTo(loc.center, 15, { duration: 1.0 });
  }, [selected]);

  useEffect(() => {
    const p = pollutionRef.current, f = floodRef.current;
    if (p) { p.setStyle({ fillOpacity: layers.pollution ? Math.min(.5, .08 + emissions/220) : 0, opacity: layers.pollution ? .8 : 0 }); p.setRadius(420 + emissions * 7); }
    if (f) f.setStyle({ fillOpacity: layers.flood ? Math.min(.55, .08 + rainfall/250) : 0, opacity: layers.flood ? .8 : 0 });
    carsRef.current.forEach(c => { c.getElement()?.classList.toggle('hidden-car', !layers.vehicles); });
    const map = mapRef.current;
    if (map) {
      const container = map.getContainer();
      const night = time >= 18 || time < 6;
      container.style.filter = `brightness(${night ? .55 : time < 8 || time >= 16 ? .82 : 1}) saturate(${night ? .72 : 1})`;
    }
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
    <header className="topbar"><div><div className="eyebrow">SMART CITY DIGITAL TWIN · OPENSTREETMAP</div><h1>JAMSHEDPUR</h1></div><div className="time-badge">{String(time).padStart(2,'0')}:00 <span>IST</span></div></header>
    <section className="workspace">
      <aside className="panel left-panel"><div className="panel-title">CITY LAYERS</div>{rows.map(([key,label])=><button className="switch-row" key={key} onClick={()=>toggle(key)}><span>{label}</span><i className={layers[key]?'switch on':'switch'}><b/></i></button>)}
      <div className="divider"/><div className="panel-title">SIMULATION</div>
      <label>Traffic Volume <b>{traffic}%</b></label><input type="range" min="0" max="100" value={traffic} onChange={e=>setTraffic(+e.target.value)}/>
      <label>Industrial Emissions <b>{emissions}%</b></label><input type="range" min="0" max="100" value={emissions} onChange={e=>setEmissions(+e.target.value)}/>
      <label>Rainfall <b>{rainfall}%</b></label><input type="range" min="0" max="100" value={rainfall} onChange={e=>setRainfall(+e.target.value)}/>
      <label>Time of Day <b>{String(time).padStart(2,'0')}:00</b></label><input type="range" min="0" max="23" value={time} onChange={e=>setTime(+e.target.value)}/>
      <div className="time-presets">{[[7,'Morning'],[12,'Noon'],[18,'Evening'],[22,'Night']].map(([t,label])=><button key={t} onClick={()=>setTime(Number(t))}>{label}</button>)}</div></aside>
      <div className="city-view"><MapView traffic={traffic} emissions={emissions} rainfall={rainfall} time={time} layers={layers} selected={selected} onSelect={selectLocation}/><div className="selected-card"><span>SELECTED LOCATION</span><strong>{selected}</strong><small>{selectedLocation?.type ?? 'Interactive city map'}</small></div><div className="map-hint">Real OpenStreetMap · Drag · Scroll · Click locations</div></div>
      <aside className="panel right-panel"><div className="panel-title">CITY STATUS</div><div className="health-card"><span>CITY HEALTH INDEX</span><strong>{health}</strong><small>SIMULATED · LIVE CONTROLS</small></div><div className="metric"><span>AIR QUALITY</span><strong>{aqi} AQI</strong><em>{aqi>100?'Elevated':'Moderate'}</em></div><div className="metric"><span>TRAFFIC</span><strong>{congestion}%</strong><em>{congestion>70?'Heavy':'Moving'}</em></div><div className="metric"><span>WATERLOGGING RISK</span><strong>{floodRisk}%</strong><em>{floodRisk>60?'High':'Low'}</em></div><div className="divider"/><div className="panel-title">LOCATIONS</div>{locations.map(loc=><button className={selected===loc.name?'location-btn active':'location-btn'} key={loc.name} onClick={()=>setSelected(loc.name)}><span>●</span><div><b>{loc.name}</b><small>{loc.type}</small></div></button>)}</aside>
    </section>
  </main>;
}
