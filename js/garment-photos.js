/* =========================================================
   ZGOB APPAREL — garment reference photo cache
   Real blank-garment photos are managed in Admin → Garment
   reference photos and stored in Supabase. This file just
   loads them once per page and keeps a "<Garment>" lookup so
   other scripts can check for them synchronously.

   A garment can have MULTIPLE reference photos (different
   angles, alternate shots, etc.) — every photo is a plain
   white garment; the photo doesn't change with the fabric
   colour the customer picks (Canvas, Ink, Denim, etc. are
   just what gets ordered/printed on). Each photo can carry
   its own optional extra price/surcharge.
   ========================================================= */

let ZGOB_GARMENT_PHOTOS = {}; // { [garmentName]: [{ id, photoUrl, quad, extraPrice }, ...] }
let zgobGarmentPhotosLoaded = false;

/** Fetch every reference photo from Supabase and build the lookup cache. Safe to call more than once. */
async function zgobLoadGarmentPhotos(){
  try{
    const rows = await ZgobStore.getGarmentPhotos();
    ZGOB_GARMENT_PHOTOS = {};
    rows.forEach(row => {
      (ZGOB_GARMENT_PHOTOS[row.garment] = ZGOB_GARMENT_PHOTOS[row.garment] || []).push({
        id: row.id,
        photoUrl: row.image_url,
        quad: row.quad || null,
        extraPrice: Number(row.extra_price) || 0
      });
    });
  }catch(err){
    console.error('Could not load garment reference photos:', err);
  }finally{
    zgobGarmentPhotosLoaded = true;
  }
}

/** Returns every reference photo for this garment (may be an empty array). */
function zgobGarmentPhotoList(garmentName){
  return ZGOB_GARMENT_PHOTOS[garmentName] || [];
}

/** Returns a single reference photo for this garment — the one at `index`, clamped to a valid
    range, or null if there are none yet. Convenient default (index 0) for callers that don't
    need to let the customer pick between multiple photos. */
function zgobFindGarmentPhoto(garmentName, index){
  const list = zgobGarmentPhotoList(garmentName);
  if(!list.length) return null;
  const i = Math.max(0, Math.min(index || 0, list.length - 1));
  return list[i];
}
