/* =========================================================
   ZGOB APPAREL — Printful Mockup Generator helper
   Used by api/mockup-create.js and api/mockup-status.js.
   Docs: https://developers.printful.com/docs/edm/ (Mockup Generator API)
   ========================================================= */

const PRINTFUL_API = 'https://api.printful.com';

/* ---------------------------------------------------------
   Map Zgob garment names -> Printful catalog product IDs.
   71 (Bella+Canvas 3001 Unisex Staple Tee) is Printful's real,
   commonly-used catalog ID for a basic tee — a safe starting
   point. EVERY id below still needs to be confirmed against
   YOUR Printful account before going live: log into Printful →
   Catalog (or call GET https://api.printful.com/products) and
   copy the numeric id of the product you want each garment to
   render as. Getting this wrong just means the mockup call
   fails with a clear "product not found" error, not silent
   wrong output.
   --------------------------------------------------------- */
export const PRINTFUL_PRODUCTS = {
  'Classic Tee': 71,          // Bella+Canvas 3001 Unisex Staple T-Shirt — verified real catalog id
  'Cropped Tee': 71,          // no dedicated cropped tee mapped yet — reusing the classic tee as a placeholder
  'Heavyweight Hoodie': null, // TODO: set to your chosen hoodie's Printful catalog product id
  'Long Sleeve Tee': null,    // TODO
  'Crewneck Sweatshirt': null,// TODO
  'Tank Top': null            // TODO
};

/* Our placement labels -> Printful placement keys. Valid keys are
   product-specific; "front"/"back" are safe for most DTG apparel.
   Confirm exact keys for a product via:
   GET https://api.printful.com/mockup-generator/printfiles/{product_id} */
const PLACEMENT_MAP = {
  'Front, centered': 'front',
  'Left chest': 'front',   // most basic DTG tee templates only expose front/back —
  'Back, full': 'back',    // swap to a chest-specific key once you confirm one for your product
  'Sleeve': 'front'
};

/* ---------------------------------------------------------
   Our theme colours don't match Printful's real dye names
   (there's no "Canvas" or "Denim" in their catalog), so we
   match by keyword instead of exact name. First keyword that
   appears in an available colour name wins; order matters —
   put the most specific synonym first.
   --------------------------------------------------------- */
const COLOR_SYNONYMS = {
  'Canvas':      ['natural', 'soft cream', 'sand', 'off white', 'cream'],
  'Ink':         ['black'],
  'Denim':       ['navy', 'steel blue', 'true royal', 'denim'],
  'Thread Red':  ['red', 'cranberry'],
  'Mustard':     ['mustard', 'gold', 'yellow'],
  'Chalk':       ['white']
};

function authHeaders(){
  const headers = {
    'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY}`,
    'Content-Type': 'application/json'
  };
  if(process.env.PRINTFUL_STORE_ID){
    headers['X-PF-Store-Id'] = process.env.PRINTFUL_STORE_ID;
  }
  return headers;
}

/** Fetch a catalog product's variants and find the one matching a colour + size. */
export async function findVariant(productId, color, size){
  const res = await fetch(`${PRINTFUL_API}/products/${productId}`, { headers: authHeaders() });
  const data = await res.json();
  if(!res.ok) throw new Error(data?.result || `Printful catalog lookup failed (${res.status})`);

  const variants = data.result?.variants || [];
  const sizeMatches = variants.filter(v => v.size?.toLowerCase() === String(size).toLowerCase());
  const pool = sizeMatches.length ? sizeMatches : variants;

  // 1. exact/substring match against our own colour name (works if the product happens to share it)
  let match = pool.find(v => v.color?.toLowerCase().includes(String(color).toLowerCase()));

  // 2. keyword synonym match against Printful's real colour names
  if(!match){
    const synonyms = COLOR_SYNONYMS[color] || [];
    for(const word of synonyms){
      match = pool.find(v => v.color?.toLowerCase().includes(word));
      if(match) break;
    }
  }

  if(!match){
    const colors = [...new Set(pool.map(v => v.color))].slice(0, 15).join(', ');
    throw new Error(`Couldn't match "${color}" to a real colour on product ${productId} in size ${size}. Available colours: ${colors}. Add a synonym for "${color}" in COLOR_SYNONYMS (server/printful.js) to fix this.`);
  }
  return match.id;
}

/** Kick off an async mockup generation task. Returns the task_key. */
export async function createMockupTask({ productId, variantId, placement, imageUrl }){
  const pfPlacement = PLACEMENT_MAP[placement] || 'front';
  const res = await fetch(`${PRINTFUL_API}/mockup-generator/create-task/${productId}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      variant_ids: [variantId],
      format: 'jpg',
      files: [{ placement: pfPlacement, image_url: imageUrl }]
    })
  });
  const data = await res.json();
  if(!res.ok) throw new Error(data?.result?.error || data?.result || `Printful task creation failed (${res.status})`);
  return data.result.task_key;
}

/** Poll a mockup generation task. Returns { status, mockupUrl } — mockupUrl is null until completed. */
export async function getMockupTask(taskKey){
  const res = await fetch(`${PRINTFUL_API}/mockup-generator/task?task_key=${encodeURIComponent(taskKey)}`, {
    headers: authHeaders()
  });
  const data = await res.json();
  if(!res.ok) throw new Error(data?.result || `Printful task lookup failed (${res.status})`);

  const result = data.result;
  const mockupUrl = result.status === 'completed' && result.mockups?.[0]?.mockup_url
    ? result.mockups[0].mockup_url
    : null;
  return { status: result.status, mockupUrl };
}
