/* Hand-drawn garment silhouettes (no stock art / no licensed marks).
   zgobGarmentSVG(type, bodyColor) -> svg markup string, with a
   #print-area group whose position customize.js can move. */
function zgobGarmentSVG(type, bodyColor){
  const c = bodyColor || '#ede6d6';
  const stroke = '#14120d';

  const sleeves = {
    'Tee':        'M78,64 L34,96 L58,132 L92,102 Z M222,64 L266,96 L242,132 L208,102 Z',
    'Crewneck':   'M74,66 L26,100 L52,138 L92,104 Z M226,66 L274,100 L248,138 L208,104 Z',
    'Long Sleeve':'M78,64 L26,100 L36,220 L84,214 L92,102 Z M222,64 L274,100 L264,220 L216,214 L208,102 Z',
    'Hoodie':     'M74,72 L22,108 L48,148 L92,110 Z M226,72 L278,108 L252,148 L208,110 Z',
    'Tank':       ''
  };

  const neck = {
    'Tee':      'M118,20 Q150,46 182,20',
    'Crewneck': 'M112,18 Q150,52 188,18',
    'Long Sleeve':'M118,20 Q150,46 182,20',
    'Hoodie':   'M108,16 Q150,10 192,16',
    'Tank':     'M126,18 Q150,40 174,18'
  };

  const hood = type === 'Hoodie'
    ? `<path d="M100,18 C90,4 210,4 200,18 C216,26 220,54 210,66 L192,50 Q150,28 108,50 L90,66 C80,54 84,26 100,18 Z" fill="${c}" stroke="${stroke}" stroke-width="3"/>
       <circle cx="140" cy="40" r="3" fill="${stroke}"/><circle cx="160" cy="40" r="3" fill="${stroke}"/>
       <path d="M140,40 Q150,58 160,40" fill="none" stroke="${stroke}" stroke-width="2"/>`
    : '';

  const pocket = type === 'Hoodie'
    ? `<path d="M112,210 Q150,228 188,210 L188,240 Q150,256 112,240 Z" fill="none" stroke="${stroke}" stroke-width="2.5" opacity=".8"/>`
    : '';

  const isTank = type === 'Tank';
  const bodyTop = isTank ? 'M120,22 L96,50 L108,74 L192,74 L204,50 L180,22' : 'M96,60 L96,300 L204,300 L204,60';

  return `
  <svg viewBox="0 0 300 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${type} mockup">
    <path d="${sleeves[type] || ''}" fill="${c}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M96,60 Q96,20 118,20 Q150,46 182,20 Q214,20 204,60 L204,300 L96,300 Z"
          fill="${c}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/>
    ${isTank ? `<path d="M118,20 L96,60 M182,20 L204,60" stroke="${stroke}" stroke-width="3" fill="none"/>` : ''}
    <path d="${neck[type]}" fill="none" stroke="${stroke}" stroke-width="2.5"/>
    ${pocket}
    ${hood}
    <g id="print-area" transform="translate(100,110)">
      <rect x="0" y="0" width="100" height="100" fill="none" stroke="#d6432a" stroke-width="1.5" stroke-dasharray="5 4" rx="2"/>
      <text id="print-label" x="50" y="55" text-anchor="middle" font-family="Space Mono, monospace" font-size="9" fill="#d6432a">YOUR DESIGN</text>
    </g>
  </svg>`;
}
