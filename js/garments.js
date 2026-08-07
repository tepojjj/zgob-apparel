/* Realistic flat-lay garment mockups (SVG, no stock art / no licensed marks).
   zgobGarmentSVG(type, bodyColor) -> svg markup string.

   Structure per garment:
     1. drop shadow (grounds the garment like a product photo)
     2. base silhouette, filled with the chosen colour
     3. #print-area group (rect/text placeholder -- customize.js repositions
        it and swaps in uploaded artwork). It sits UNDER the shading layers
        so light, shadow and fold lines fall across the print exactly like
        they fall across the fabric, and a fabric-warp filter keeps hard
        edges (text, uploaded logos) from reading as a flat sticker.
     4. lighting overlay (linear side-shade + soft chest highlight)
     5. crisp outline redrawn on top so the edge stays sharp
     6. garment-specific trim: ribbed collar/cuffs/hem, hood, pocket, straps

   All five types share one torso/hem silhouette so proportions stay
   consistent; only the collar, sleeves and trim change per type. */

const TORSO_TOP = 'L206,145 L212,250 Q150,262 88,250 L94,145';

function garmentDefs(){
  return `
    <defs>
      <linearGradient id="gBodyShade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#000" stop-opacity="0.20"/>
        <stop offset="0.16" stop-color="#000" stop-opacity="0.03"/>
        <stop offset="0.5" stop-color="#fff" stop-opacity="0.12"/>
        <stop offset="0.84" stop-color="#000" stop-opacity="0.03"/>
        <stop offset="1" stop-color="#000" stop-opacity="0.24"/>
      </linearGradient>
      <radialGradient id="gChestLight" cx="0.5" cy="0.08" r="0.8">
        <stop offset="0" stop-color="#fff" stop-opacity="0.16"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
      <filter id="gSoftShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#000" flood-opacity="0.30"/>
      </filter>
      <filter id="gFabricWarp" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.05 0.08" numOctaves="2" seed="7" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
    </defs>`;
}

// picks ink or chalk for the placeholder outline/text so it stays legible
// against any garment colour (red-on-red, navy-on-navy, etc. would vanish)
function contrastFor(hex){
  const h = (hex || '#ede6d6').replace('#','');
  if(h.length !== 6) return '#14120d';
  const num = parseInt(h, 16);
  const r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
  const luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
  return luminance > 0.55 ? '#14120d' : '#f7f3e8';
}

function shell(outlinePath, fillColor, extraBefore, extraAfter, shadowRx){
  // extraBefore: trim that should sit BEHIND shading (same fabric, gets shaded too -- hood, cuffs, hem band)
  // extraAfter: trim that should sit ON TOP of shading (stitch lines, drawstrings, pocket outline)
  return `
    <ellipse cx="150" cy="272" rx="${shadowRx}" ry="11" fill="#000" opacity="0.16"/>
    <g filter="url(#gSoftShadow)">
      <path d="${outlinePath}" fill="${fillColor}" stroke="#14120d" stroke-width="2.5" stroke-linejoin="round"/>
      ${extraBefore || ''}

      <g id="print-area" transform="translate(100,110)" filter="url(#gFabricWarp)">
        <rect width="100" height="100" rx="2" fill="none" stroke="${contrastFor(fillColor)}" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.8"/>
        <text id="print-label" x="50" y="55" text-anchor="middle" font-family="Space Mono, monospace" font-size="9" fill="${contrastFor(fillColor)}" opacity="0.85">YOUR DESIGN</text>
      </g>

      <path d="${outlinePath}" fill="url(#gBodyShade)"/>
      <path d="${outlinePath}" fill="url(#gChestLight)"/>
      <path d="${outlinePath}" fill="none" stroke="#14120d" stroke-width="2.5" stroke-linejoin="round"/>
      ${extraAfter || ''}
    </g>`;
}

function collarRing(c){
  const ribbed = shadeHex(c, -0.12);
  return `<path d="M124,36 Q150,54 176,36 Q178,44 176,50 Q150,68 124,50 Q122,44 124,36 Z" fill="${ribbed}" stroke="#14120d" stroke-width="1.5"/>`;
}

// lightens/darkens a #rrggbb hex colour by `amt` (-1..1) for ribbing/trim shades
function shadeHex(hex, amt){
  const h = (hex || '#ede6d6').replace('#','');
  if(h.length !== 6) return hex;
  const num = parseInt(h, 16);
  let r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
  const adjust = (v) => Math.max(0, Math.min(255, Math.round(v + (amt < 0 ? v : 255 - v) * amt)));
  r = adjust(r); g = adjust(g); b = adjust(b);
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

function zgobGarmentSVG(type, bodyColor){
  const c = bodyColor || '#ede6d6';
  const trim = shadeHex(c, -0.14);

  let body, shoulders, before = '', after = '', shadowRx = 105;

  if(type === 'Tank'){
    body = 'M126,34 Q150,52 174,34 L196,42 Q206,66 202,112 L206,150 L212,250 Q150,262 88,250 L94,150 L98,112 Q94,66 104,42 Z';
    shoulders = '<path d="M196,42 L202,112" fill="none" stroke="#000" stroke-width="1" opacity="0.14"/><path d="M104,42 L98,112" fill="none" stroke="#000" stroke-width="1" opacity="0.14"/>';
    before = `<path d="M126,36 Q150,48 174,36" fill="none" stroke="#14120d" stroke-width="2"/>`;
    shadowRx = 95;
  } else if(type === 'Long Sleeve'){
    body = `M118,34 Q150,58 182,34 L214,42 L252,70 L246,150 L232,206 L206,196 Q210,150 200,96 ${TORSO_TOP} Q90,150 100,96 L94,196 L68,206 L54,150 L48,70 L86,42 Z`;
    shoulders = '<path d="M214,42 L200,96" fill="none" stroke="#000" stroke-width="1" opacity="0.14"/><path d="M86,42 L100,96" fill="none" stroke="#000" stroke-width="1" opacity="0.14"/><path d="M246,150 L232,206" fill="none" stroke="#000" stroke-width="1" opacity="0.12"/><path d="M54,150 L68,206" fill="none" stroke="#000" stroke-width="1" opacity="0.12"/>';
    before = collarRing(c);
    after = `<path d="M206,196 L232,206 L230,216 L204,206 Z" fill="${trim}" stroke="#14120d" stroke-width="1.5"/>
              <path d="M94,196 L68,206 L70,216 L96,206 Z" fill="${trim}" stroke="#14120d" stroke-width="1.5"/>`;
    shadowRx = 115;
  } else if(type === 'Hoodie'){
    const hood = 'M104,40 C96,14 204,14 196,40 C214,44 218,72 206,84 L192,60 Q150,42 108,60 L94,84 C82,72 86,44 104,40 Z';
    body = `M118,34 Q150,58 182,34 L214,42 L256,66 L270,100 L240,122 Q214,110 200,96 ${TORSO_TOP} Q86,110 100,96 L60,122 L30,100 L44,66 L86,42 Z`;
    shoulders = '<path d="M214,42 L200,96" fill="none" stroke="#000" stroke-width="1" opacity="0.14"/><path d="M86,42 L100,96" fill="none" stroke="#000" stroke-width="1" opacity="0.14"/>';
    before = `<path d="${hood}" fill="${c}" stroke="#14120d" stroke-width="2.5" stroke-linejoin="round"/>
               <path d="${hood}" fill="url(#gBodyShade)"/>
               <path d="${hood}" fill="none" stroke="#14120d" stroke-width="2.5" stroke-linejoin="round"/>
               <circle cx="132" cy="58" r="2.6" fill="#14120d"/><circle cx="168" cy="58" r="2.6" fill="#14120d"/>
               <path d="M132,60 Q150,74 168,60" fill="none" stroke="#14120d" stroke-width="2"/>
               <path d="M238,104 L268,82 L272,92 L242,116 Z" fill="${trim}" stroke="#14120d" stroke-width="1.5"/>
               <path d="M62,104 L32,82 L28,92 L58,116 Z" fill="${trim}" stroke="#14120d" stroke-width="1.5"/>
               <path d="M90,238 Q150,250 210,238 L212,250 Q150,262 88,250 Z" fill="${trim}" stroke="#14120d" stroke-width="1.5"/>`;
    after = `<path d="M116,178 Q150,196 184,178 L184,206 Q150,222 116,206 Z" fill="none" stroke="#14120d" stroke-width="2" opacity="0.85"/>`;
  } else if(type === 'Crewneck'){
    body = `M118,34 Q150,58 182,34 L214,42 L256,66 L270,100 L240,122 Q214,110 200,96 ${TORSO_TOP} Q86,110 100,96 L60,122 L30,100 L44,66 L86,42 Z`;
    shoulders = '<path d="M214,42 L200,96" fill="none" stroke="#000" stroke-width="1" opacity="0.14"/><path d="M86,42 L100,96" fill="none" stroke="#000" stroke-width="1" opacity="0.14"/>';
    before = `<path d="M120,34 Q150,58 180,34 Q184,46 180,54 Q150,76 120,54 Q116,46 120,34 Z" fill="${trim}" stroke="#14120d" stroke-width="1.5"/>
               <path d="M238,104 L268,82 L272,92 L242,116 Z" fill="${trim}" stroke="#14120d" stroke-width="1.5"/>
               <path d="M62,104 L32,82 L28,92 L58,116 Z" fill="${trim}" stroke="#14120d" stroke-width="1.5"/>
               <path d="M90,238 Q150,250 210,238 L212,250 Q150,262 88,250 Z" fill="${trim}" stroke="#14120d" stroke-width="1.5"/>`;
  } else { // 'Tee' (default)
    body = `M118,34 Q150,58 182,34 L214,42 L256,66 L270,100 L240,122 Q214,110 200,96 ${TORSO_TOP} Q86,110 100,96 L60,122 L30,100 L44,66 L86,42 Z`;
    shoulders = '<path d="M214,42 L200,96" fill="none" stroke="#000" stroke-width="1" opacity="0.14"/><path d="M86,42 L100,96" fill="none" stroke="#000" stroke-width="1" opacity="0.14"/>';
    before = collarRing(c);
  }

  const folds = `
    <path d="M110,128 Q150,138 190,128" fill="none" stroke="#000" stroke-width="1" opacity="0.07"/>
    <path d="M106,190 Q150,202 194,190" fill="none" stroke="#000" stroke-width="1" opacity="0.06"/>`;

  return `
  <svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${type} mockup">
    ${garmentDefs()}
    ${shell(body, c, before, shoulders + after + folds, shadowRx)}
  </svg>`;
}