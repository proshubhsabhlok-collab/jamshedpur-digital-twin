'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

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
  traffic:number; emissions:number; rainfall:number; time:number;
  layers:Record<string,boolean>; selected:string; onSelect:(l:Location)=>void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const carsRef = useRef<any[]>([]);
  const animationRef = useRef<number | null>(null);
  const values = useRef({ traffic, emissions, rainfall, time, layers });
  values.current = { traffic, emissions, rainfall, time, layers };

  useEffect(() => {
    if (!container.current || mapRef.current) return;

    let disposed = false;

    const initMap = async () => {
      const L = await import('leaflet');
      if (disposed || !container.current || mapRef.current) return;

      const map = L.map(container.current, {
      center: [22.8046, 86.2029],
      zoom: 13.5,
      zoomControl: false,
      preferCanvas: true,
    });

    mapRef.current = map;

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const zoneGroup = L.layerGroup().addTo(map);
    const routeGroup = L.layerGroup().addTo(map);
    const markerGroup = L.layerGroup().addTo(map);

    const addZone = (center: [number,number], radius: number, cls: string, label: string) => {
      const circle = L.circle(center, {
        radius,
        className: cls,
        stroke: true,
        weight: 1.5,
        fillOpacity: 0.14,
      }).addTo(zoneGroup);
      circle.bindTooltip(label, { direction: 'top', className: 'zone-tooltip' });
      return circle;
    };

    const pollutionZone = addZone([22.8000,86.1950], 1050, 'pollution-zone', 'AIR POLLUTION');
    const trafficZone = addZone([22.8040,86.2020], 780, 'traffic-zone', 'TRAFFIC HOTSPOT');
    const floodZone = L.polygon([
      [22.810,86.201],[22.810,86.209],[22.816,86.211],[22.819,86.204],[22.815,86.199]
    ], { className:'flood-zone', weight:1.5, fillOpacity:.18 }).addTo(zoneGroup);
    floodZone.bindTooltip('WATERLOGGING RISK', { direction:'center', className:'zone-tooltip' });

    routes.forEach((route) => {
      L.polyline(route, {
        color: '#f1ad45',
        weight: 4,
        opacity: .55,
        dashArray: '8 8',
        lineCap: 'round',
      }).addTo(routeGroup);
    });

    const buildingSpots: [number,number,number][] = [
      [22.7992,86.1938,28],[22.8002,86.1948,42],[22.8011,86.1960,22],
      [22.7977,86.1884,18],[22.7988,86.1892,25],[22.8034,86.2010,16],
      [22.8045,86.2025,24],[22.8060,86.1918,20],[22.8070,86.1930,14],
      [22.8202,86.2072,18],[22.8215,86.2085,22],[22.8223,86.2096,14],
    ];

    const buildingGroup = L.layerGroup().addTo(map);
    buildingSpots.forEach(([lat,lng,size]) => {
      const w = size * 1.35;
      const h = size;
      const bounds: L.LatLngBoundsExpression = [
        [lat - h/120000, lng - w/120000],
        [lat + h/120000, lng + w/120000],
      ];
      L.rectangle(bounds, {
        className: 'building-footprint',
        weight: 1,
        fillOpacity: .62,
      }).addTo(buildingGroup);
    });

    locations.forEach((loc) => {
      const icon = L.divIcon({
        className: 'location-marker-wrap',
        html: '<div class="location-marker"><span></span></div>',
        iconSize: [22,22],
        iconAnchor: [11,20],
      });
      L.marker(loc.center, { icon }).addTo(markerGroup)
        .bindPopup('<strong>'+loc.name+'</strong><br/><small>'+loc.type+'</small>')
        .on('click', () => onSelect(loc));
    });

    const carIcon = L.divIcon({
      className: 'car-marker-wrap',
      html: '<div class="car-marker"><span></span></div>',
      iconSize: [22,14],
      iconAnchor: [11,7],
    });

    const cars = Array.from({length: 16}, (_,i) =>
      L.marker(routes[i % routes.length][0], { icon: carIcon, interactive:false }).addTo(map)
    );
    carsRef.current = cars;

    const animate = (now:number) => {
      const { traffic:tv, layers:ls } = values.current;
      cars.forEach((car,i) => {
        const t = (now * (0.000008 + tv * 0.00000007) + i/cars.length) % 1;
        const [lat,lng] = interpolate(routes[i % routes.length], t);
        car.setLatLng([lat,lng]);
        const el = car.getElement();
        if (el) el.style.display = ls.vehicles ? 'block' : 'none';
      });
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);

    const resize = () => map.invalidateSize();
    window.addEventListener('resize', resize);
    setTimeout(resize, 100);
    setTimeout(resize, 700);

    (map as any)._dtLayers = { pollutionZone, trafficZone, floodZone, buildingGroup, routeGroup, zoneGroup };

    return () => {
      disposed = true;
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      cars.forEach(c => c.remove());
      carsRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    };

    initMap();
  }, [onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const loc = locations.find(x => x.name === selected);
    if (loc) map.flyTo(loc.center, 15, { duration: .8 });
  }, [selected]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const data = (map as any)._dtLayers;
    if (!data) return;

    const pollutionSize = 650 + emissions * 11;
    const trafficSize = 450 + traffic * 8;
    data.pollutionZone.setRadius(pollutionSize);
    data.trafficZone.setRadius(trafficSize);
    data.pollutionZone.setStyle({
      opacity: layers.pollution ? .8 : 0,
      fillOpacity: layers.pollution ? Math.min(.32, .08 + emissions/350) : 0,
    });
    data.trafficZone.setStyle({
      opacity: layers.roads ? .8 : 0,
      fillOpacity: layers.roads ? Math.min(.3, .07 + traffic/380) : 0,
    });
    data.floodZone?.setStyle?.({
      opacity: layers.flood ? .8 : 0,
      fillOpacity: layers.flood ? Math.min(.36, .08 + rainfall/300) : 0,
    });
    data.buildingGroup.eachLayer((layer:any) => {
      const el = (layer as any).getElement?.();
      if (el) el.style.display = layers.buildings ? 'block' : 'none';
    });
    data.routeGroup.eachLayer((layer:L.Layer) => {
      const el = (layer as any).getElement?.();
      if (el) el.style.display = layers.roads ? 'block' : 'none';
    });

    const tilePane = map.getPane('tilePane');
    if (tilePane) {
      tilePane.style.filter = time >= 18 || time < 6
        ? 'brightness(.58) saturate(.75)'
        : time < 8 || time >= 16
          ? 'brightness(.86) saturate(.9)'
          : 'brightness(1)';
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
  const rows:[keyof typeof layers,string][]=[['buildings','Building Footprints'],['roads','Road Network'],['vehicles','Moving Vehicles'],['pollution','Pollution Zones'],['flood','Waterlogging']];

  return <main className="app-shell">
    <header className="topbar">
      <div><div className="eyebrow">SMART CITY DIGITAL TWIN · INTERACTIVE 2D MAP</div><h1>JAMSHEDPUR</h1></div>
      <div className="time-badge">{String(time).padStart(2,'0')}:00 <span>IST</span></div>
    </header>
    <section className="workspace">
      <aside className="panel left-panel">
        <div className="panel-title">MAP LAYERS</div>
        {rows.map(([key,label])=><button className="switch-row" key={key} onClick={()=>toggle(key)}><span>{label}</span><i className={layers[key]?'switch on':'switch'}><b/></i></button>)}
        <div className="divider"/>
        <div className="panel-title">SIMULATION</div>
        <label>Traffic Volume <b>{traffic}%</b></label><input type="range" min="0" max="100" value={traffic} onChange={e=>setTraffic(+e.target.value)}/>
        <label>Industrial Emissions <b>{emissions}%</b></label><input type="range" min="0" max="100" value={emissions} onChange={e=>setEmissions(+e.target.value)}/>
        <label>Rainfall <b>{rainfall}%</b></label><input type="range" min="0" max="100" value={rainfall} onChange={e=>setRainfall(+e.target.value)}/>
        <label>Time of Day <b>{String(time).padStart(2,'0')}:00</b></label><input type="range" min="0" max="23" value={time} onChange={e=>setTime(+e.target.value)}/>
        <div className="time-presets">{[[7,'Morning'],[12,'Noon'],[18,'Evening'],[22,'Night']].map(([t,label])=><button key={t} onClick={()=>setTime(Number(t))}>{label}</button>)}</div>
      </aside>

      <div className="city-view">
        <MapView traffic={traffic} emissions={emissions} rainfall={rainfall} time={time} layers={layers} selected={selected} onSelect={selectLocation}/>
        <div className="selected-card"><span>SELECTED LOCATION</span><strong>{selected === 'Jamshedpur' ? 'Jamshedpur City' : selected}</strong><small>{selectedLocation?.type ?? 'Interactive urban map'}</small></div>
        <div className="map-legend"><span><i className="legend-dot traffic-dot"/>Traffic</span><span><i className="legend-dot pollution-dot"/>Pollution</span><span><i className="legend-dot flood-dot"/>Waterlogging</span><span><i className="legend-building"/>Buildings</span></div>
        <div className="map-hint">Drag · Scroll to zoom · Click a location</div>
      </div>

      <aside className="panel right-panel">
        <div className="panel-title">CITY STATUS</div>
        <div className="health-card"><span>CITY HEALTH INDEX</span><strong>{health}</strong><small>SIMULATED · LIVE CONTROLS</small></div>
        <div className="metric"><span>AIR QUALITY</span><strong>{aqi} AQI</strong><em>{aqi>100?'Elevated':'Moderate'}</em></div>
        <div className="metric"><span>TRAFFIC</span><strong>{congestion}%</strong><em>{congestion>70?'Heavy':'Moving'}</em></div>
        <div className="metric"><span>WATERLOGGING RISK</span><strong>{floodRisk}%</strong><em>{floodRisk>60?'High':'Low'}</em></div>
        <div className="divider"/>
        <div className="panel-title">LOCATIONS</div>
        {locations.map(loc=><button className={selected===loc.name?'location-btn active':'location-btn'} key={loc.name} onClick={()=>setSelected(loc.name)}><span>●</span><div><b>{loc.name}</b><small>{loc.type}</small></div></button>)}
      </aside>
    </section>
  </main>;
}
