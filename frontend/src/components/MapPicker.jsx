import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Lot « Commande simplifiée » : petite carte OpenStreetMap où le client pose un point quand sa position est refusée
// ou imprécise. Chargée à part (seulement quand la carte s'ouvre). Le prix se calcule ensuite comme avec le GPS.
// value : { latitude, longitude } ou null ; center : point de départ (le restaurant) ; onPick({ lat, lng }).
export default function MapPicker({ value, center, onPick, hint }) {
  const box = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    const start = value || center;
    const m = L.map(box.current, { center: [start.latitude, start.longitude], zoom: value ? 16 : 14 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(m);
    m.on('click', (e) => pick.current(e.latlng));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      marker.current = null;
    };
  }, []); // la carte est créée une seule fois

  // Point du client : un rond rouge Belchicken (pas d'image à charger)
  useEffect(() => {
    if (!map.current || !value) return;
    const at = [value.latitude, value.longitude];
    if (marker.current) marker.current.setLatLng(at);
    else marker.current = L.circleMarker(at, { radius: 11, color: '#7c0f13', weight: 3, fillColor: '#a3161b', fillOpacity: 0.9 }).addTo(map.current);
  }, [value]);

  return (
    <div className="cs-map-wrap">
      {hint && <p className="cs-muted">{hint}</p>}
      <div ref={box} className="cs-map" />
    </div>
  );
}
