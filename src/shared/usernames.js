const BLOCKED_USERNAME_WORDS = new Set([
  'mierda', 'mierdas', 'puto', 'puta', 'putos', 'putas', 'putear',
  'weon', 'weona', 'weones', 'huevon', 'huevona', 'huevones', 'aweonao', 'aweonada',
  'culiao', 'culia', 'culiada', 'ctm', 'conchetumadre', 'conchesumadre',
  'chucha', 'chuchas', 'pendejo', 'pendeja', 'pendejos', 'pendejas', 'maricon', 'maricona',
  'fuck', 'fucker', 'fucking', 'motherfucker', 'shit', 'shitty', 'bullshit',
  'bitch', 'bitches', 'bastard', 'bastards', 'asshole', 'dick', 'dickhead',
  'cock', 'cunt', 'whore', 'slut', 'shithead', 'fuckface', 'nazi',
]);

export function hasOffensiveUsernameTerm(value) {
  if (typeof value !== 'string') return false;
  const words = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[013457]/g, (digit) => ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' })[digit])
    .split(/[^a-z]+/);
  return words.some((word) => BLOCKED_USERNAME_WORDS.has(word));
}
