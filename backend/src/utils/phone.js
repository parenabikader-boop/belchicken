// Normalise un numéro burkinabè en +226XXXXXXXX. Renvoie null si invalide.
// Accepte : 76123456, 76 12 34 56, 22676123456, +226 76 12 34 56, 0022676123456.
// Les numéros d'autres pays (+XXX…) sont acceptés s'ils sont plausibles.
export function normalizePhone(input) {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  let digits = raw.replace(/\D/g, '');
  const international = raw.startsWith('+') || raw.startsWith('00');
  if (raw.startsWith('00')) digits = digits.slice(2);

  if (digits.length === 8) return `+226${digits}`;
  if (digits.length === 11 && digits.startsWith('226')) return `+${digits}`;
  if (international && !digits.startsWith('226') && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}
