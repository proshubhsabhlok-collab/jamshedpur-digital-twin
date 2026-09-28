'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

const locations = [
  { name: 'Tata Steel', type: 'Industrial Zone', x: -3.4, z: -1.2 },
  { name: 'Bistupur', type: 'Commercial Zone', x: 0.8, z: -0.2 },
  { name: 'Sakchi', type: 'High Traffic Zone', x: 2.8, z: 1.4 },
  { name: 'Jubilee Park', type: 'Green Zone', x: -0.4, z: 2.8 },
  { name: 'Mango', type: 'Residential / Traffic Zone', x: 3.6, z: -2.5 },
];

function Building({ position, height, width = 0.5 }: { position: [number, number, number]; height: number; width?: number }) {
  return (
    <mesh position={[position[0], height / 2, position[2]]} castShadow>
      <boxGeometry args={[width, height, width]} />
      <meshStandardMaterial color="#8794a5" roughness={0.72} />
    </mesh>
  );
}

function Road({ position, rotation = 0, length = 10 }: { position: [number, number, number]; rotation?: number; length?: number }) {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, rotation]} receiveShadow>
      <planeGeometry args={[2.1, length]} />
      <meshStandardMaterial color="#242a33" roughness={0.9} />
    </mesh>
  );
}

function Vehicle({ x, z, speed, vertical = false }: { x: number; z: number; speed: number; vertical?: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (!ref.current) return;
    if (vertical) {
      ref.current.position.z += speed * delta;
      if (ref.current.position.z > 5.5) ref.current.position.z = -5.5;
    } else {
      ref.current.position.x += speed * delta;
      if (ref.current.position.x > 5.5) ref.current.position.x = -5.5;
    }
  });
  return (
    <mesh ref={ref} position={[x, 0.13, z]} castShadow>
      <boxGeometry args={vertical ? [0.28, 0.18, 0.55] : [0.55, 0.18, 0.28]} />
      <meshStandardMaterial color="#e7c34b" />
    </mesh>
  );
}

function CityScene({ traffic }: { traffic: number }) {
  const buildings = useMemo(() => Array.from({ length: 42 }, (_, i) => {
    const x = ((i * 1.73) % 9) - 4.5;
    const z = ((i * 2.31) % 9) - 4.5;
    const nearRoad = Math.abs(x) < 1.15 || Math.abs(z) < 1.15;
    return { x, z, height: nearRoad ? 0.35 + (i % 3) * 0.22 : 0.45 + (i % 6) * 0.25 };
  }), []);

  const vehicleCount = Math.max(4, Math.round(traffic / 7));

  return (
    <>
      <PerspectiveCamera makeDefault position={[8, 9, 10]} fov={48} />
      <ambientLight intensity={1.25} />
      <directionalLight position={[5, 10, 4]} intensity={2.2} castShadow />
      <color attach="background" args={['#07111f']} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color="#273a2c" roughness={1} />
      </mesh>

      <Road position={[0, 0.012, 0]} rotation={0} length={14} />
      <Road position={[0, 0.014, 0]} rotation={Math.PI / 2} length={14} />
      <Road position={[-3.1, 0.014, 0]} rotation={0} length={14} />
      <Road position={[3.1, 0.014, 0]} rotation={0} length={14} />

      {buildings.map((b, i) => <Building key={i} position={[b.x, 0, b.z]} height={b.height} width={0.42 + (i % 3) * 0.08} />)}

      {/* Landmark: Tata Steel */}
      <mesh position={[-3.4, 0.75, -1.2]} castShadow>
        <boxGeometry args={[1.15, 1.5, 0.85]} />
        <meshStandardMaterial color="#b04b43" metalness={0.2} />
      </mesh>
      <mesh position={[-3.4, 1.7, -1.2]}>
        <cylinderGeometry args={[0.18, 0.18, 0.65, 12]} />
        <meshStandardMaterial color="#d7dde5" metalness={0.7} />
      </mesh>

      {/* Jubilee Park */}
      <mesh position={[-0.4, 0.04, 2.8]} receiveShadow>
        <cylinderGeometry args={[1.05, 1.05, 0.08, 32]} />
        <meshStandardMaterial color="#4f8d59" />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[-1 + (i % 3) * 0.6, 0.42, 2.35 + Math.floor(i / 3) * 0.45]}>
          <sphereGeometry args={[0.2, 12, 8]} />
          <meshStandardMaterial color="#4e8752" />
        </mesh>
      ))}

      {Array.from({ length: vehicleCount }, (_, i) => (
        <Vehicle key={`h-${i}`} x={-5 + i * 0.7} z={0.38} speed={0.55 + traffic / 180} />
      ))}
      {Array.from({ length: Math.max(3, Math.round(vehicleCount / 2)) }, (_, i) => (
        <Vehicle key={`v-${i}`} x={3.1} z={-5 + i * 1.1} speed={0.4 + traffic / 230} vertical />
      ))}

      <OrbitControls enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI / 2.15} minDistance={5} maxDistance={17} />
    </>
  );
}

export default function Home() {
  const [traffic, setTraffic] = useState(50);
  const [emissions, setEmissions] = useState(45);
  const [rainfall, setRainfall] = useState(20);
  const [time, setTime] = useState(14);

  const aqi = Math.round(42 + emissions * 0.7 + traffic * 0.18);
  const congestion = Math.round(Math.min(100, traffic * 1.05));
  const floodRisk = Math.round(Math.min(100, rainfall * 1.25));
  const health = Math.round(Math.max(0, 100 - aqi * 0.25 - congestion * 0.18 - floodRisk * 0.12));

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">SMART CITY DIGITAL TWIN</div>
          <h1>JAMSHEDPUR</h1>
        </div>
        <div className="time-badge">{String(Math.floor(time)).padStart(2, '0')}:00 <span>IST</span></div>
      </header>

      <section className="workspace">
        <aside className="panel left-panel">
          <div className="panel-title">CITY LAYERS</div>
          {['3D Buildings', 'Road Network', 'Moving Vehicles', 'Pollution Zones', 'Waterlogging'].map((layer) => (
            <label className="check-row" key={layer}>
              <input type="checkbox" defaultChecked />
              <span>{layer}</span>
            </label>
          ))}
          <div className="divider" />
          <div className="panel-title">SIMULATION</div>
          <label>Traffic Volume <b>{traffic}%</b></label>
          <input type="range" min="0" max="100" value={traffic} onChange={(e) => setTraffic(+e.target.value)} />
          <label>Industrial Emissions <b>{emissions}%</b></label>
          <input type="range" min="0" max="100" value={emissions} onChange={(e) => setEmissions(+e.target.value)} />
          <label>Rainfall <b>{rainfall}%</b></label>
          <input type="range" min="0" max="100" value={rainfall} onChange={(e) => setRainfall(+e.target.value)} />
          <label>Time of Day <b>{time}:00</b></label>
          <input type="range" min="0" max="23" value={time} onChange={(e) => setTime(+e.target.value)} />
        </aside>

        <div className="city-view">
          <Canvas shadows dpr={[1, 1.5]}>
            <CityScene traffic={traffic} />
          </Canvas>
          <div className="map-label label-tata">TATA STEEL</div>
          <div className="map-label label-bistupur">BISTUPUR</div>
          <div className="map-label label-jubilee">JUBILEE PARK</div>
          <div className="map-hint">Drag to orbit · Scroll to zoom · Change controls to simulate the city</div>
        </div>

        <aside className="panel right-panel">
          <div className="panel-title">CITY STATUS</div>
          <div className="health-card"><span>CITY HEALTH INDEX</span><strong>{health}</strong><small>SIMULATED</small></div>
          <div className="metric"><span>AIR QUALITY</span><strong>{aqi} AQI</strong><em className={aqi > 100 ? 'warn' : ''}>{aqi > 100 ? 'Elevated' : 'Moderate'}</em></div>
          <div className="metric"><span>TRAFFIC</span><strong>{congestion}%</strong><em>{congestion > 70 ? 'Heavy' : 'Moving'}</em></div>
          <div className="metric"><span>WATERLOGGING RISK</span><strong>{floodRisk}%</strong><em>{floodRisk > 60 ? 'High' : 'Low'}</em></div>
          <div className="divider" />
          <div className="panel-title">LOCATIONS</div>
          {locations.map((location) => <button className="location-btn" key={location.name}><span>●</span><div><b>{location.name}</b><small>{location.type}</small></div></button>)}
        </aside>
      </section>
    </main>
  );
}
