import { PRINTFUL_PRODUCTS, findVariant, createMockupTask } from '../server/printful.js';

export default async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if(!process.env.PRINTFUL_API_KEY){
    return res.status(500).json({ error: 'PRINTFUL_API_KEY is not set on the server. Add it in your Vercel project settings.' });
  }

  const { garment, color, size, placement, imageUrl } = req.body || {};
  if(!garment || !color || !size || !imageUrl){
    return res.status(400).json({ error: 'Missing garment, color, size, or imageUrl.' });
  }

  const productId = PRINTFUL_PRODUCTS[garment];
  if(!productId){
    return res.status(400).json({
      error: `No Printful catalog product is mapped for "${garment}" yet. Set it in server/printful.js.`
    });
  }

  try{
    const variantId = await findVariant(productId, color, size);
    const taskKey = await createMockupTask({ productId, variantId, placement, imageUrl });
    res.status(200).json({ taskKey });
  }catch(err){
    res.status(502).json({ error: err.message });
  }
}
