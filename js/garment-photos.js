/* =========================================================
   ZGOB APPAREL — garment reference photo cache
   Real blank-garment photos are managed in Admin → Garment
   reference photos and stored in Supabase. This file just
   loads them once per page and keeps a "<Garment>|<Colour>"
   lookup so other scripts can check for one synchronously.
   ========================================================= */

let ZGOB_GARMENT_PHOTOS = {};
let zgobGarmentPhotosLoaded = false;

/** Fetch every reference photo from Supabase and build the lookup cache. Safe to call more than once. */
async function zgobLoadGarmentPhotos(){
  try{
    const rows = await ZgobStore.getGarmentPhotos();
    ZGOB_GARMENT_PHOTOS = {};
    rows.forEach(row => {
      ZGOB_GARMENT_PHOTOS[`${row.garment}|${row.color}`] = { photoUrl: row.image_url };
    });
  }catch(err){
    console.error('Could not load garment reference photos:', err);
  }finally{
    zgobGarmentPhotosLoaded = true;
  }
}

/** Returns { photoUrl } for this garment+colour, or null if there's no reference photo (yet, or not loaded yet). */
function zgobFindGarmentPhoto(garmentName, colorName){
  return ZGOB_GARMENT_PHOTOS[`${garmentName}|${colorName}`] || null;
}
