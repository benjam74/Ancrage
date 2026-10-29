import type { CharacterId, Slot } from '../core/model';

/**
 * Drawings in a shared 120 × 160 frame, so every item fits every character.
 * Head centred at (60, 48), torso from y 74 to 118, legs to 146, right hand at (90, 110).
 */

const INK = '#3a2e2a';
const S = `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`;

export interface Species {
  fur: string;
  light: string;
  inner: string;
  /** Ears, drawn behind the head. */
  ears: string;
  /** Muzzle, nose and whiskers, drawn over the face. */
  face: string;
}

export const SPECIES: Record<CharacterId, Species> = {
  renard: {
    fur: '#e8763a',
    light: '#fff4e6',
    inner: '#3a2e2a',
    ears: `<path d="M37 36 L40 8 L58 27 Z" fill="#e8763a" ${S}/><path d="M83 36 L80 8 L62 27 Z" fill="#e8763a" ${S}/><path d="M42 30 L43 15 L52 26 Z" fill="#3a2e2a"/><path d="M78 30 L77 15 L68 26 Z" fill="#3a2e2a"/>`,
    face: `<path d="M38 52 Q60 82 82 52 Q72 62 60 60 Q48 62 38 52 Z" fill="#fff4e6"/><ellipse cx="60" cy="58" rx="4" ry="3" fill="${INK}"/>`,
  },
  loutre: {
    fur: '#8a5a3c',
    light: '#e8c9a4',
    inner: '#5c3a26',
    ears: `<circle cx="37" cy="34" r="7" fill="#8a5a3c" ${S}/><circle cx="83" cy="34" r="7" fill="#8a5a3c" ${S}/>`,
    face: `<ellipse cx="60" cy="59" rx="16" ry="11" fill="#e8c9a4"/><ellipse cx="60" cy="55" rx="5" ry="3.5" fill="${INK}"/><path d="M44 58 L32 55 M44 61 L32 62 M76 58 L88 55 M76 61 L88 62" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>`,
  },
  ourson: {
    fur: '#7a5236',
    light: '#d8b48a',
    inner: '#d8b48a',
    ears: `<circle cx="38" cy="28" r="10" fill="#7a5236" ${S}/><circle cx="82" cy="28" r="10" fill="#7a5236" ${S}/><circle cx="38" cy="28" r="5" fill="#d8b48a"/><circle cx="82" cy="28" r="5" fill="#d8b48a"/>`,
    face: `<ellipse cx="60" cy="58" rx="13" ry="10" fill="#d8b48a"/><ellipse cx="60" cy="54" rx="5" ry="3.5" fill="${INK}"/>`,
  },
  lapin: {
    fur: '#d9d3cc',
    light: '#ffffff',
    inner: '#f4a7b9',
    ears: `<ellipse cx="48" cy="14" rx="8" ry="22" fill="#d9d3cc" ${S}/><ellipse cx="72" cy="14" rx="8" ry="22" fill="#d9d3cc" ${S}/><ellipse cx="48" cy="15" rx="4" ry="16" fill="#f4a7b9"/><ellipse cx="72" cy="15" rx="4" ry="16" fill="#f4a7b9"/>`,
    face: `<ellipse cx="60" cy="58" rx="12" ry="9" fill="#ffffff"/><path d="M57 53 L63 53 L60 57 Z" fill="#e57a95"/>`,
  },
};

/** The head itself, shared: eyes, cheeks, smile. */
export function head(sp: Species): string {
  return `${sp.ears}<ellipse cx="60" cy="48" rx="27" ry="25" fill="${sp.fur}" ${S}/>${sp.face}` +
    `<circle cx="50" cy="44" r="3.4" fill="${INK}"/><circle cx="70" cy="44" r="3.4" fill="${INK}"/>` +
    `<circle cx="51.2" cy="42.8" r="1.1" fill="#fff"/><circle cx="71.2" cy="42.8" r="1.1" fill="#fff"/>` +
    `<circle cx="42" cy="53" r="3.5" fill="#f28b82" opacity=".45"/><circle cx="78" cy="53" r="3.5" fill="#f28b82" opacity=".45"/>` +
    `<path d="M55 64 Q60 68 65 64" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`;
}

/** Hands, feet and neck in fur colour, drawn under and over the clothes. */
export const feet = (sp: Species) => `<ellipse cx="50" cy="149" rx="10" ry="5" fill="${sp.fur}" ${S}/><ellipse cx="70" cy="149" rx="10" ry="5" fill="${sp.fur}" ${S}/>`;
export const ankles = (sp: Species) => `<rect x="44" y="130" width="12" height="18" rx="5" fill="${sp.fur}" ${S}/><rect x="64" y="130" width="12" height="18" rx="5" fill="${sp.fur}" ${S}/>`;
export const hands = (sp: Species) => `<circle cx="30" cy="112" r="6.5" fill="${sp.fur}" ${S}/><circle cx="90" cy="110" r="6.5" fill="${sp.fur}" ${S}/>`;

const TORSO = 'M40 78 Q60 70 80 78 L84 116 Q60 122 36 116 Z';
const SLEEVES = 'M41 79 Q30 90 28 108 L36 110 Q38 96 46 88 Z M79 79 Q90 88 92 106 L84 108 Q82 96 74 88 Z';

/** A top: torso and sleeves in one colour, then details. */
function top(fill: string, extra = '', sleeve = fill): string {
  return `<path d="${SLEEVES}" fill="${sleeve}" ${S}/><path d="${TORSO}" fill="${fill}" ${S}/>${extra}`;
}

/** Trousers: two legs from the waist; `to` is where they stop (146 = full length). */
function trousers(fill: string, to = 146, extra = ''): string {
  return `<path d="M38 112 L82 112 L80 ${to} L62 ${to} L60 124 L58 ${to} L40 ${to} Z" fill="${fill}" ${S}/>${extra}`;
}

/** The ugly pyjama everyone starts with: mustard and lilac stripes, odd buttons, checks too short. */
export const PYJAMA_TOP = top(
  '#e3c15f',
  [82, 90, 98, 106].map((y) => `<path d="M39 ${y} L81 ${y}" stroke="#b49bd6" stroke-width="4"/>`).join('') +
    `<circle cx="60" cy="86" r="2.6" fill="#d9534f" ${S}/><circle cx="60" cy="96" r="2.2" fill="#4a90d9" ${S}/><circle cx="61" cy="106" r="3" fill="#5cb85c" ${S}/>` +
    `<path d="M52 76 L60 84 L68 76" fill="none" ${S}/>`,
  '#b49bd6',
);
export const PYJAMA_BOTTOM = trousers(
  '#8cc7b5',
  136,
  `<path d="M42 120 L56 120 M42 128 L56 128 M64 120 L78 120 M64 128 L78 128 M47 113 L47 136 M53 113 L53 136 M67 113 L67 136 M73 113 L73 136" stroke="#5e9c88" stroke-width="2"/>`,
);

const HAT_BRIM = (fill: string) => `<ellipse cx="60" cy="27" rx="30" ry="5" fill="${fill}" ${S}/>`;

/** Every catalogue item, by id. */
export const ART: Record<string, { slot: Slot; svg: string }> = {
  // --- haut ---
  tshirt: { slot: 'haut', svg: top('#f7f7f2', `<path d="M52 76 Q60 82 68 76" fill="none" ${S}/>`) },
  sweat: { slot: 'haut', svg: top('#6c8ebf', `<path d="M48 104 L72 104 L70 114 L50 114 Z" fill="#5a7aa8" ${S}/><path d="M56 80 L55 92 M64 80 L65 92" ${S}/>`) },
  mariniere: { slot: 'haut', svg: top('#ffffff', [84, 92, 100, 108].map((y) => `<path d="M39 ${y} L81 ${y}" stroke="#1f4e8c" stroke-width="3.2"/>`).join(''), '#ffffff') },
  'chemise-lin': { slot: 'haut', svg: top('#e9dcc3', `<path d="M60 76 L60 118" ${S}/><path d="M52 75 L60 84 L68 75" fill="#f4ecdb" ${S}/>${[90, 100, 110].map((y) => `<circle cx="62.5" cy="${y}" r="1.4" fill="${INK}"/>`).join('')}`) },
  'pull-torsade': { slot: 'haut', svg: top('#c0392b', `<path d="M50 80 Q46 90 50 100 Q54 110 50 118 M60 80 Q56 90 60 100 Q64 110 60 118 M70 80 Q66 90 70 100 Q74 110 70 118" fill="none" stroke="#962d22" stroke-width="2.4"/><path d="M38 112 Q60 120 82 112" fill="none" stroke="#962d22" stroke-width="3"/>`) },
  'veste-coach': { slot: 'haut', svg: top('#13505e', `<path d="M52 76 L60 104 L68 76" fill="#f7f7f2" ${S}/><path d="M52 76 L46 96 L58 100 Z M68 76 L74 96 L62 100 Z" fill="#0b3540" ${S}/><circle cx="60" cy="108" r="2" fill="#f3b324"/><rect x="70" y="100" width="8" height="2.5" rx="1" fill="#f3b324"/>`) },
  'blazer-velours': { slot: 'haut', svg: top('#6d2e46', `<path d="M52 76 L60 102 L68 76" fill="#2b2b2b" ${S}/><path d="M52 76 L45 98 L58 101 Z M68 76 L75 98 L62 101 Z" fill="#4f1f32" ${S}/><circle cx="60" cy="108" r="2.2" fill="#d4af37"/><path d="M71 92 L77 90 L77 96 Z" fill="#f3b324"/>`) },
  'costume-maitre': { slot: 'haut', svg: top('#1d1f33', `<path d="M51 76 L60 106 L69 76" fill="#ffffff" ${S}/><path d="M57 80 L60 100 L63 80 Z" fill="#d4af37"/><path d="M51 76 L44 100 L58 104 Z M69 76 L76 100 L62 104 Z" fill="#2c2f4d" ${S}/><path d="M70 88 L78 86" stroke="#d4af37" stroke-width="2.5"/><circle cx="60" cy="110" r="2" fill="#d4af37"/><circle cx="60" cy="116" r="2" fill="#d4af37"/>`) },

  // --- bas ---
  jean: { slot: 'bas', svg: trousers('#4a6fa5', 146, `<path d="M58 112 L58 120 M44 140 L56 140 M64 140 L78 140" stroke="#38598a" stroke-width="2"/>`) },
  short: { slot: 'bas', svg: trousers('#e07a5f', 128) },
  jogging: { slot: 'bas', svg: trousers('#7d8597', 146, `<path d="M42 113 L42 146 M78 113 L78 146" stroke="#f7f7f2" stroke-width="2.4"/><path d="M40 142 L58 142 M62 142 L80 142" stroke="#5f6676" stroke-width="3"/>`) },
  chino: { slot: 'bas', svg: trousers('#cdb38b', 146, `<path d="M49 116 L49 146 M71 116 L71 146" stroke="#b39a72" stroke-width="1.6"/>`) },
  tailleur: { slot: 'bas', svg: trousers('#2c2f4d', 146, `<path d="M49 114 L49 146 M71 114 L71 146" stroke="#4a4e78" stroke-width="1.6"/>`) },
  kilt: { slot: 'bas', svg: `<path d="M37 112 L83 112 L88 134 L32 134 Z" fill="#2e7d4f" ${S}/><path d="M44 112 L42 134 M54 112 L53 134 M66 112 L67 134 M76 112 L78 134 M35 122 L85 122" stroke="#c0392b" stroke-width="2.4"/><rect x="62" y="114" width="8" height="10" rx="2" fill="#e3c15f" ${S}/>` },

  // --- chapeau ---
  bonnet: { slot: 'chapeau', svg: `<path d="M34 34 Q36 6 60 6 Q84 6 86 34 Z" fill="#d9534f" ${S}/><rect x="32" y="28" width="56" height="9" rx="4" fill="#b8433f" ${S}/><circle cx="60" cy="6" r="6" fill="#f7f7f2" ${S}/>` },
  bandeau: { slot: 'chapeau', svg: `<path d="M34 32 Q60 22 86 32 L86 39 Q60 29 34 39 Z" fill="#f3b324" ${S}/><path d="M36 36 L84 36" stroke="#13505e" stroke-width="2"/>` },
  casquette: { slot: 'chapeau', svg: `<path d="M35 31 Q37 9 60 9 Q83 9 85 31 Z" fill="#2f8f5b" ${S}/><path d="M60 31 Q86 28 98 34 Q86 38 60 35 Z" fill="#1f6a41" ${S}/><circle cx="60" cy="10" r="2.5" fill="#1f6a41"/>` },
  bob: { slot: 'chapeau', svg: `${HAT_BRIM('#9bb37a')}<path d="M40 27 Q42 10 60 10 Q78 10 80 27 Z" fill="#b5cc92" ${S}/>` },
  beret: { slot: 'chapeau', svg: `<ellipse cx="56" cy="22" rx="30" ry="11" fill="#2b2b2b" ${S}/><path d="M56 11 L58 5" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` },
  paille: { slot: 'chapeau', svg: `<ellipse cx="60" cy="27" rx="38" ry="7" fill="#e9cf8a" ${S}/><path d="M40 27 Q42 8 60 8 Q78 8 80 27 Z" fill="#f0d999" ${S}/><path d="M41 22 Q60 26 79 22 L79 18 Q60 22 41 18 Z" fill="#c0392b"/>` },
  'haut-de-forme': { slot: 'chapeau', svg: `${HAT_BRIM('#2b2b2b')}<rect x="42" y="-6" width="36" height="33" rx="3" fill="#2b2b2b" ${S}/><rect x="42" y="18" width="36" height="6" fill="#8e44ad"/>` },
  laurier: { slot: 'chapeau', svg: `${[...Array(6)].map((_, i) => { const a = Math.PI * (0.95 + i * 0.22); const x = 60 + 30 * Math.cos(a); const y = 36 + 18 * Math.sin(a); return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="7" ry="3.5" transform="rotate(${((a * 180) / Math.PI + 60).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="#6aa84f" ${S}/>`; }).join('')}${[...Array(6)].map((_, i) => { const a = Math.PI * (0.05 - i * 0.22); const x = 60 + 30 * Math.cos(a); const y = 36 + 18 * Math.sin(a); return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="7" ry="3.5" transform="rotate(${((a * 180) / Math.PI - 60).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="#6aa84f" ${S}/>`; }).join('')}` },
  couronne: { slot: 'chapeau', svg: `<path d="M38 30 L38 8 L49 20 L60 4 L71 20 L82 8 L82 30 Z" fill="#f3c623" ${S}/><circle cx="60" cy="22" r="3.5" fill="#d9534f" ${S}/><circle cx="46" cy="25" r="2.5" fill="#4a90d9"/><circle cx="74" cy="25" r="2.5" fill="#2f8f5b"/>` },

  // --- lunettes ---
  'lunettes-rondes': { slot: 'lunettes', svg: `<circle cx="50" cy="44" r="7.5" fill="#ffffff" fill-opacity=".25" ${S}/><circle cx="70" cy="44" r="7.5" fill="#ffffff" fill-opacity=".25" ${S}/><path d="M57.5 44 L62.5 44" ${S}/>` },
  'lunettes-soleil': { slot: 'lunettes', svg: `<path d="M41 40 L59 40 L57 50 Q50 53 43 50 Z M61 40 L79 40 L77 50 Q70 53 63 50 Z" fill="#1d1f33" ${S}/><path d="M59 42 L61 42" ${S}/><path d="M45 42 L50 42" stroke="#fff" stroke-width="1.5" opacity=".7"/>` },
  'lunettes-coeur': { slot: 'lunettes', svg: `${[50, 70].map((x) => `<path d="M${x} 50 C${x - 12} 42 ${x - 6} 34 ${x} 40 C${x + 6} 34 ${x + 12} 42 ${x} 50 Z" fill="#e8567a" fill-opacity=".85" ${S}/>`).join('')}<path d="M57 42 L63 42" ${S}/>` },
  monocle: { slot: 'lunettes', svg: `<circle cx="70" cy="44" r="8" fill="#ffffff" fill-opacity=".25" stroke="#d4af37" stroke-width="2.6"/><path d="M77 49 Q82 62 78 76" fill="none" stroke="#d4af37" stroke-width="1.4"/>` },
  'lunettes-or': { slot: 'lunettes', svg: `<rect x="41" y="38" width="17" height="12" rx="4" fill="#f3c623" fill-opacity=".35" stroke="#d4af37" stroke-width="2.6"/><rect x="62" y="38" width="17" height="12" rx="4" fill="#f3c623" fill-opacity=".35" stroke="#d4af37" stroke-width="2.6"/><path d="M58 43 L62 43" stroke="#d4af37" stroke-width="2.6"/>` },

  // --- cou ---
  echarpe: { slot: 'cou', svg: `<path d="M38 72 Q60 82 82 72 L82 80 Q60 90 38 80 Z" fill="#d9534f" ${S}/><path d="M70 80 L74 104 L66 104 L64 82 Z" fill="#d9534f" ${S}/><path d="M66 92 L73 92 M67 98 L74 98" stroke="#f7f7f2" stroke-width="2.4"/><path d="M48 76 L48 84 M56 78 L56 86" stroke="#f7f7f2" stroke-width="2.4"/>` },
  noeud: { slot: 'cou', svg: `<path d="M60 78 L48 71 L48 85 Z M60 78 L72 71 L72 85 Z" fill="#8e44ad" ${S}/><circle cx="60" cy="78" r="3.5" fill="#6c3483" ${S}/>` },
  cravate: { slot: 'cou', svg: `<path d="M56 76 L64 76 L62 82 L66 106 L60 112 L54 106 L58 82 Z" fill="#c0392b" ${S}/><path d="M57 92 L64 88 M56 100 L65 96" stroke="#f3b324" stroke-width="1.8"/>` },
  foulard: { slot: 'cou', svg: `<path d="M44 74 Q60 84 76 74 L68 94 Q60 98 52 94 Z" fill="#f3b324" ${S}/><path d="M50 80 Q60 86 70 80" fill="none" stroke="#e8763a" stroke-width="2"/><circle cx="56" cy="88" r="1.6" fill="#e8763a"/><circle cx="64" cy="88" r="1.6" fill="#e8763a"/>` },
  perles: { slot: 'cou', svg: [...Array(11)].map((_, i) => { const a = Math.PI * (0.12 + (i * 0.76) / 10); return `<circle cx="${(60 + 19 * Math.cos(a)).toFixed(1)}" cy="${(74 + 10 * Math.sin(a)).toFixed(1)}" r="2.8" fill="#fbf7ef" ${S.replace('2.2', '1')}/>`; }).join('') },
  medaille: { slot: 'cou', svg: `<path d="M50 74 L58 98 M70 74 L62 98" stroke="#4a90d9" stroke-width="5"/><circle cx="60" cy="102" r="9" fill="#f3c623" ${S}/><path d="M60 96 L62 100 L66 100 L63 103 L64 107 L60 105 L56 107 L57 103 L54 100 L58 100 Z" fill="#d4af37"/>` },

  // --- objet ---
  tasse: { slot: 'objet', svg: `<path d="M90 98 L104 98 L102 114 L92 114 Z" fill="#f7f7f2" ${S}/><path d="M104 101 Q110 102 108 108 Q106 111 103 110" fill="none" ${S}/><path d="M94 94 Q95 90 94 87 M99 94 Q100 90 99 87" fill="none" stroke="${INK}" stroke-width="1.2" opacity=".5"/>` },
  carnet: { slot: 'objet', svg: `<rect x="88" y="96" width="16" height="21" rx="2" fill="#e07a5f" ${S}/><path d="M92 101 L101 101 M92 106 L101 106" stroke="#fff" stroke-width="1.6"/><rect x="88" y="96" width="3.5" height="21" fill="#b85f48"/>` },
  plume: { slot: 'objet', svg: `<path d="M90 114 Q96 96 110 84 Q106 100 92 113 Z" fill="#f7f7f2" ${S}/><path d="M91 114 L104 92" stroke="${INK}" stroke-width="1.2"/>` },
  livre: { slot: 'objet', svg: `<path d="M84 100 L97 104 L110 100 L110 118 L97 122 L84 118 Z" fill="#8b5a2b" ${S}/><path d="M97 104 L97 122" ${S}/><path d="M86 103 L95 106 M99 106 L108 103" stroke="#f3c623" stroke-width="1.4"/>` },
  micro: { slot: 'objet', svg: `<rect x="92" y="100" width="6" height="18" rx="2" fill="#2b2b2b" ${S}/><circle cx="95" cy="96" r="7" fill="#9aa5b1" ${S}/><path d="M90 95 L100 95 M90 98 L100 98" stroke="#6b7682" stroke-width="1.2"/>` },
  boussole: { slot: 'objet', svg: `<circle cx="98" cy="104" r="10" fill="#d4af37" ${S}/><circle cx="98" cy="104" r="7" fill="#fbf7ef"/><path d="M98 98 L100.5 104 L98 110 L95.5 104 Z" fill="#d9534f"/><path d="M98 104 L100.5 104 L98 110 L95.5 104 Z" fill="#3a2e2a"/>` },
  lanterne: { slot: 'objet', svg: `<path d="M95 86 L101 86 M98 84 L98 88" ${S}/><path d="M91 90 L105 90 L103 116 L93 116 Z" fill="#f3c623" fill-opacity=".9" ${S}/><circle cx="98" cy="103" r="5" fill="#fff6c9"/><path d="M98 99 L98 95" stroke="#e8763a" stroke-width="2"/><circle cx="108" cy="92" r="1.6" fill="#f3c623"/><circle cx="88" cy="98" r="1.2" fill="#f3c623"/><circle cx="110" cy="106" r="1" fill="#f3c623"/>` },

  // --- compagnon ---
  escargot: { slot: 'compagnon', svg: `<path d="M92 152 Q90 144 98 144 L116 144 Q118 152 112 152 Z" fill="#c8d96f" ${S}/><circle cx="106" cy="140" r="9" fill="#d98c5f" ${S}/><path d="M106 140 m-4 0 a4 4 0 1 0 8 0 a6 6 0 1 0 -12 0" fill="none" stroke="#a8603a" stroke-width="1.8"/><path d="M95 144 L93 136 M98 144 L98 137" ${S}/><circle cx="93" cy="135" r="1.6" fill="${INK}"/><circle cx="98" cy="136" r="1.6" fill="${INK}"/>` },
  chaton: { slot: 'compagnon', svg: `<ellipse cx="104" cy="146" rx="11" ry="7" fill="#f0a35e" ${S}/><circle cx="104" cy="133" r="8" fill="#f0a35e" ${S}/><path d="M97 129 L98 121 L103 126 Z M111 129 L110 121 L105 126 Z" fill="#f0a35e" ${S}/><circle cx="101" cy="132" r="1.4" fill="${INK}"/><circle cx="107" cy="132" r="1.4" fill="${INK}"/><path d="M114 144 Q120 136 116 130" fill="none" stroke="#f0a35e" stroke-width="3.5" stroke-linecap="round"/>` },
  hibou: { slot: 'compagnon', svg: `<ellipse cx="104" cy="140" rx="10" ry="12" fill="#8d6e63" ${S}/><ellipse cx="104" cy="144" rx="6" ry="7" fill="#d7ccc8"/><circle cx="100" cy="134" r="4" fill="#fff" ${S}/><circle cx="108" cy="134" r="4" fill="#fff" ${S}/><circle cx="100" cy="134" r="1.8" fill="${INK}"/><circle cx="108" cy="134" r="1.8" fill="${INK}"/><path d="M102.5 138 L104 141 L105.5 138 Z" fill="#f3b324"/><path d="M96 128 L99 125 M112 128 L109 125" ${S}/>` },
  dragon: { slot: 'compagnon', svg: `<path d="M112 144 Q122 140 118 130" fill="none" stroke="#2f8f5b" stroke-width="4" stroke-linecap="round"/><ellipse cx="103" cy="145" rx="11" ry="8" fill="#4cc283" ${S}/><path d="M98 138 L92 126 L102 134 Z" fill="#a3e4bf" ${S}/><circle cx="100" cy="132" r="7" fill="#4cc283" ${S}/><path d="M96 126 L95 121 M103 126 L104 121" ${S}/><circle cx="98" cy="131" r="1.4" fill="${INK}"/><path d="M94 135 Q88 134 86 130" fill="none" stroke="#f3b324" stroke-width="2" stroke-linecap="round"/>` },

  // --- décor (full frame, drawn behind) ---
  parc: { slot: 'decor', svg: `<rect y="-14" width="120" height="174" fill="#cfe8f5"/><rect y="118" width="120" height="42" fill="#9ccc65"/><circle cx="100" cy="24" r="10" fill="#ffe082"/>${[12, 26, 96, 110].map((x, i) => `<circle cx="${x}" cy="${130 + (i % 2) * 8}" r="3" fill="${['#f48fb1', '#fff176', '#ce93d8', '#ef9a9a'][i]}"/>`).join('')}<circle cx="16" cy="96" r="14" fill="#66bb6a"/><rect x="14" y="104" width="4" height="16" fill="#8d6e63"/>` },
  plage: { slot: 'decor', svg: `<rect y="-14" width="120" height="174" fill="#ffe0b2"/><rect y="0" width="120" height="70" fill="#81d4fa"/><rect y="70" width="120" height="40" fill="#4fc3f7"/><path d="M0 108 Q30 100 60 108 T120 108 L120 160 L0 160 Z" fill="#ffe082"/><circle cx="22" cy="22" r="11" fill="#fff176"/><path d="M98 108 L104 60" stroke="#8d6e63" stroke-width="3"/><path d="M104 60 Q92 58 86 66 M104 60 Q116 58 118 66 M104 60 Q100 50 92 50" fill="none" stroke="#43a047" stroke-width="4" stroke-linecap="round"/>` },
  bibliotheque: { slot: 'decor', svg: `<rect y="-14" width="120" height="174" fill="#6d4c41"/>${[20, 58, 96].map((y) => `<rect x="4" y="${y + 30}" width="112" height="4" fill="#4e342e"/>${[...Array(14)].map((_, i) => `<rect x="${6 + i * 8}" y="${y + 6 + (i % 3) * 2}" width="6" height="${24 - (i % 3) * 2}" fill="${['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad'][i % 5]}"/>`).join('')}`).join('')}` },
  nuit: { slot: 'decor', svg: `<rect y="-14" width="120" height="174" fill="#1a2340"/><circle cx="92" cy="26" r="12" fill="#f5f0c8"/><circle cx="97" cy="22" r="11" fill="#1a2340"/>${[[14, 18], [30, 40], [52, 14], [70, 50], [20, 70], [108, 70], [44, 86], [86, 98]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="#fff"/>`).join('')}<rect y="130" width="120" height="30" fill="#24304f"/>` },
  sommet: { slot: 'decor', svg: `<rect y="-14" width="120" height="174" fill="#b3e5fc"/><path d="M-10 160 L40 60 L70 110 L95 70 L130 160 Z" fill="#78909c"/><path d="M40 60 L30 80 L40 76 L48 84 L52 72 Z M95 70 L88 84 L96 80 L102 86 Z" fill="#ffffff"/><path d="M38 60 L38 40 L52 46 L38 52" fill="#d9534f" stroke="${INK}" stroke-width="1.4"/><rect y="146" width="120" height="14" fill="#eceff1"/>` },
};

export const LAYER_ORDER: Slot[] = ['decor', 'compagnon', 'bas', 'haut', 'cou', 'lunettes', 'chapeau', 'objet'];
