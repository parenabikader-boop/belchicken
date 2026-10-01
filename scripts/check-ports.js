// Vérifie avant "npm run dev" que les ports de l'API et du site sont libres.
// Sinon, un autre terminal fait déjà tourner le projet : on s'arrête avec un message clair
// au lieu de laisser l'API planter et le site partir sur un autre port.
const net = require('node:net');

const PORTS = [
  { port: 3006, name: "l'API (backend)" },
  { port: 5173, name: 'le site (frontend)' },
];

// Un port est pris si quelque chose y répond déjà sur localhost (IPv4 ou IPv6)
const answers = (port, host) =>
  new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
const isFree = async (port) => !(await answers(port, '127.0.0.1')) && !(await answers(port, '::1'));

(async () => {
  const busy = [];
  for (const p of PORTS) if (!(await isFree(p.port))) busy.push(p);
  if (!busy.length) return;
  console.error('');
  for (const p of busy) console.error(`Le port ${p.port} est déjà utilisé : ${p.name} tourne sans doute déjà dans un autre terminal.`);
  console.error('Arrêtez-le (Ctrl+C dans ce terminal), puis relancez "npm run dev".');
  console.error('');
  process.exit(1);
})();
