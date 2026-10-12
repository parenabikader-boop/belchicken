// Lot 8 : vérifie que i18n/fr.js et i18n/en.js ont les mêmes clés, du même genre (texte, fonction, liste
// de même longueur), et que les {valeurs} d'un texte sont les mêmes dans les deux langues.
// Lancer : npm run langues (dans frontend/)
import fr from '../src/i18n/fr.js';
import en from '../src/i18n/en.js';

const problems = [];
const kind = (v) => (Array.isArray(v) ? 'liste' : v === null ? 'vide' : typeof v);
const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

function compare(a, b, path) {
  if (kind(a) !== kind(b)) return problems.push(`${path} : ${kind(a)} en français, ${kind(b)} en anglais`);
  if (Array.isArray(a)) {
    if (a.length !== b.length) problems.push(`${path} : ${a.length} éléments en français, ${b.length} en anglais`);
    a.forEach((x, i) => b[i] !== undefined && compare(x, b[i], `${path}[${i}]`));
  } else if (kind(a) === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a)) problems.push(`${path}.${k} : manque en français`);
      else if (!(k in b)) problems.push(`${path}.${k} : manque en anglais`);
      else compare(a[k], b[k], `${path}.${k}`);
    }
  } else if (typeof a === 'string') {
    if (!b.trim()) problems.push(`${path} : vide en anglais`);
    if (vars(a) !== vars(b)) problems.push(`${path} : valeurs {…} différentes (${vars(a)} / ${vars(b)})`);
  }
}

compare(fr, en, 'textes');
if (problems.length) {
  console.error(`${problems.length} problème(s) :\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('Français et anglais : mêmes clés, rien ne manque.');
