/* =========================================================
   ZGOB APPAREL — garment photo registry
   Maps "<Garment Name>|<Colour Name>" to a real blank-garment
   photo and the 4 points (in that photo's own pixel coordinates)
   marking the print area, in order: top-left, top-right,
   bottom-right, bottom-left.

   Nothing is filled in by default — I can't supply or generate
   these photos. Use calibrate.html to add entries: upload your
   photo, click the 4 corners, and it'll generate the object
   below for you to paste in.
   ========================================================= */

const ZGOB_GARMENT_PHOTOS = {
  // Example (uncomment and adjust once you have a real photo + quad):
  // 'Classic Tee|Canvas': {
  //   photoUrl: '/photos/classic-tee-canvas.jpg',
  //   quad: [[418,176],[682,188],[668,432],[430,420]]
  // },
};

/** Returns { photoUrl, quad } for this garment+colour, or null if nothing's calibrated yet. */
function zgobFindGarmentPhoto(garmentName, colorName){
  return ZGOB_GARMENT_PHOTOS[`${garmentName}|${colorName}`] || null;
}
