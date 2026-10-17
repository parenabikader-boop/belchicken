import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RESTAURANT } from '../../restaurant.js';

// Compte Patron simplifié : carte des clients (OpenStreetMap), chargée à part. Une zone = une case d'environ 1 km
// calculée par le serveur (au moins 3 commandes livrées) : un rond rouge, d'autant plus grand et foncé qu'il y a de
// commandes. Jamais un point par client, jamais de nom ni de numéro. Le restaurant : un petit rond brun.
export default function ClientsMap({ zones }) {
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  useEffect(() => {
    const m = L.map(box.current, { center: [RESTAURANT.latitude, RESTAURANT.longitude], zoom: 12, scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 16,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(m);
    L.circleMarker([RESTAURANT.latitude, RESTAURANT.longitude], { radius: 7, color: '#fff', weight: 2, fillColor: '#2a140e', fillOpacity: 1 })
      .bindTooltip('Belchicken, Kamsonghin').addTo(m);
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    layer.current.clearLayers();
    const max = Math.max(1, ...zones.map((z) => z.count));
    for (const z of zones) {
      const share = z.count / max;
      L.circle([z.lat, z.lng], {
        radius: 450, // la case fait environ 1 km de côté
        color: '#7c0f13', weight: 1, fillColor: '#a3161b', fillOpacity: 0.2 + share * 0.55,
      }).bindTooltip(`${z.count} commande${z.count > 1 ? 's' : ''}`).addTo(layer.current);
    }
    if (zones.length) {
      const bounds = L.latLngBounds(zones.map((z) => [z.lat, z.lng])).extend([RESTAURANT.latitude, RESTAURANT.longitude]);
      map.current.fitBounds(bounds.pad(0.2), { maxZoom: 14 });
    }
  }, [zones]);

  return <div ref={box} className="pc-map" role="img" aria-label="Carte des zones d’où viennent les commandes livrées" />;
}
