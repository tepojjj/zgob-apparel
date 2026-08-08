/* =========================================================
   ZGOB APPAREL — real product-photo compositor
   Warps a design onto a real garment photo and reapplies the
   photo's own highlights/shadows so it reads as printed on
   fabric, not pasted on top. Pure canvas, no external API.

   This is the same core trick most "smart object" mockup tools
   use under the hood: split the destination area into two
   triangles, solve an affine transform per triangle (canvas has
   no native 4-point perspective transform), draw the design
   through that, then re-draw the original photo on top with an
   'overlay' blend so the fabric's folds/shadows show through.
   ========================================================= */

function zgobLoadImage(src){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // needed so canvas can read pixels for cross-origin photo/design URLs
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${src}`));
    img.src = src;
  });
}

/** Solve the affine transform (a,b,c,d,e,f) mapping source points s0,s1,s2 -> destination points d0,d1,d2. */
function zgobComputeAffine(s0, s1, s2, d0, d1, d2){
  const [x0, y0] = s0, [x1, y1] = s1, [x2, y2] = s2;
  const [u0, v0] = d0, [u1, v1] = d1, [u2, v2] = d2;

  const D = (x0 - x2) * (y1 - y2) - (x1 - x2) * (y0 - y2);
  if(Math.abs(D) < 1e-6) return null; // degenerate triangle (collinear points)

  const a = ((u0 - u2) * (y1 - y2) - (u1 - u2) * (y0 - y2)) / D;
  const b = ((x0 - x2) * (u1 - u2) - (x1 - x2) * (u0 - u2)) / D;
  const c = u2 - a * x2 - b * y2;

  const d = ((v0 - v2) * (y1 - y2) - (v1 - v2) * (y0 - y2)) / D;
  const e = ((x0 - x2) * (v1 - v2) - (x1 - x2) * (v0 - v2)) / D;
  const f = v2 - d * x2 - e * y2;

  return { a, b, c, d, e, f };
}

/** Draw `img`'s source triangle (s0,s1,s2) warped onto ctx's destination triangle (d0,d1,d2). */
function zgobDrawWarpedTriangle(ctx, img, s0, s1, s2, d0, d1, d2){
  const m = zgobComputeAffine(s0, s1, s2, d0, d1, d2);
  if(!m) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0[0], d0[1]);
  ctx.lineTo(d1[0], d1[1]);
  ctx.lineTo(d2[0], d2[1]);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(m.a, m.d, m.b, m.e, m.c, m.f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/** Warp `img` (its full rectangle) onto `quad` = [topLeft, topRight, bottomRight, bottomLeft] on ctx. */
function zgobWarpImageToQuad(ctx, img, quad){
  const w = img.naturalWidth, h = img.naturalHeight;
  const [tl, tr, br, bl] = quad;
  zgobDrawWarpedTriangle(ctx, img, [0, 0], [w, 0], [0, h], tl, tr, bl);
  zgobDrawWarpedTriangle(ctx, img, [w, 0], [w, h], [0, h], tr, br, bl);
}

/** Re-draw the original photo, clipped to `quad`, using an 'overlay' blend so its shadows/highlights show through the design. */
function zgobApplyFabricShading(ctx, canvas, photoImg, quad, opacity = 0.85){
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(quad[0][0], quad[0][1]);
  for(let i = 1; i < quad.length; i++) ctx.lineTo(quad[i][0], quad[i][1]);
  ctx.closePath();
  ctx.clip();
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = 'overlay';
  ctx.drawImage(photoImg, 0, 0, canvas.width, canvas.height);
  ctx.restore(); // restores globalAlpha, globalCompositeOperation, and the clip
}

/**
 * Composite a design onto a real garment photo.
 * @param {string} photoUrl - blank garment photo (front-facing recommended)
 * @param {[number,number][]} quad - 4 points [TL,TR,BR,BL] in the photo's own pixel coordinates
 * @param {string} designUrl - the uploaded/rendered design image
 * @param {number} [shadeOpacity] - how strongly the fabric's own shading shows through (0–1)
 * @returns {Promise<HTMLCanvasElement>}
 */
async function zgobCompositeMockup({ photoUrl, quad, designUrl, shadeOpacity = 0.85 }){
  const [photoImg, designImg] = await Promise.all([zgobLoadImage(photoUrl), zgobLoadImage(designUrl)]);

  const canvas = document.createElement('canvas');
  canvas.width = photoImg.naturalWidth;
  canvas.height = photoImg.naturalHeight;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(photoImg, 0, 0, canvas.width, canvas.height);
  zgobWarpImageToQuad(ctx, designImg, quad);
  zgobApplyFabricShading(ctx, canvas, photoImg, quad, shadeOpacity);

  return canvas;
}

/** Convenience: composite, then return a blob: URL you can drop straight into an <img src>. Caller should revoke it when done with it. */
async function zgobCompositeMockupToUrl(opts){
  const canvas = await zgobCompositeMockup(opts);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  return URL.createObjectURL(blob);
}
