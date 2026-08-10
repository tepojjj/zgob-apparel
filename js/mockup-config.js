/* zgob-mockup-config.js
   Maps garment type + color -> a real base photo and the print-area quad
   on that photo. Add one entry per photo you shoot/license; everything
   else (customize.html, mockup-compositor.js) reads from this and never
   needs to change.

   HOW TO FILL IN A NEW PHOTO:
   1. Save the photo under /photos/garments/, e.g. photos/garments/tee-canvas-front.jpg
   2. Open it in an <img> tag anywhere and run in the console:
        ZgobMockupCompositor.markQuad(document.querySelector('img'))
      then click the print area's four corners in order: top-left,
      top-right, bottom-right, bottom-left (roughly where a chest-print
      would sit — follow the fabric's own perspective/tilt, don't just
      draw a straight rectangle, that's what makes the warp track the
      garment instead of floating on top of it).
   3. Paste the printed quad array in below.

   Until a real entry exists for a given type+color, customize.html shows
   a plain "reference photo needed" placeholder — nothing breaks while
   you're photographing the rest of the catalogue.
*/

const ZGOB_MOCKUP_CONFIG = {
  // 'Tee': {
  //   'Canvas': {
  //     src: 'photos/garments/tee-canvas-front.jpg',
  //     quad: [[612, 340], [1084, 336], [1102, 812], [598, 820]], // TL,TR,BR,BL
  //     shadeStrength: 0.65
  //   }
  // },
};

function zgobGetMockupPhoto(garmentType, colorName) {
  const byType = ZGOB_MOCKUP_CONFIG[garmentType];
  return (byType && byType[colorName]) || null;
}
