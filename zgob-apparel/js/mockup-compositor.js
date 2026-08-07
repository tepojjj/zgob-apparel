/* zgob-mockup-compositor.js
   Real-photo "smart object" compositor: perspective-warps uploaded artwork
   onto a quad you define on a real garment photo, then re-derives the
   fabric's own shading from that same photo and multiplies it back over
   the artwork, so the print reads as printed-on-fabric instead of a flat
   sticker. No dependencies, no build step — plain canvas 2D.

   This module does NOT know or care where the base photo came from. It
   only needs: an <img>, and four pixel coordinates on that image marking
   the corners of the print area. See ZGOB_MOCKUP_CONFIG below for where
   those four points live once you have real photos.

   ---------------------------------------------------------------------
   THE FOUR-CORNER QUAD
   ---------------------------------------------------------------------
   Corners are given TOP-LEFT, TOP-RIGHT, BOTTOM-RIGHT, BOTTOM-LEFT, in the
   base photo's own pixel coordinates (not the canvas's — the photo's).
   This is exactly the "place 4 pins" step every mockup tool makes you do
   once per garment/angle. See markQuad() below for a tiny helper page to
   click those four points on a photo and print out the coordinates.

   ---------------------------------------------------------------------
   PIPELINE
   ---------------------------------------------------------------------
   1. Draw the base garment photo full-size onto the output canvas.
   2. Homography-warp the artwork image into the quad (perspective warp,
      not just a skew — this is what makes it track a mannequin's chest
      curve/turn instead of sitting on it like a decal).
   3. Crop the *same quad region from the base photo itself*, convert to
      luminance, and use it as a multiply/soft-light layer over the warped
      artwork. This is the "shading" — because it's sampled directly from
      the real photo's own folds and lighting, it always matches, no matter
      what artwork or garment color you throw at it.
   4. Composite that shaded artwork back onto the canvas at the quad,
      slightly favoring the photo's shadows over its highlights so the
      print doesn't blow out on the lit side of the fold.
*/

const ZgobMockupCompositor = (() => {

  // ---- 1. Homography (projective 4-point → 4-point transform) --------
  // Solves for the 3x3 matrix mapping the unit square (0,0)-(1,0)-(1,1)-(0,1)
  // to an arbitrary quad, via the standard adjugate/basis-vector method.
  // Reference construction: Heckbert 1989, "Fundamentals of Texture Mapping".
  function computeSquareToQuad(quad) {
    const [p0, p1, p2, p3] = quad; // TL, TR, BR, BL
    const x0 = p0[0], y0 = p0[1], x1 = p1[0], y1 = p1[1];
    const x2 = p2[0], y2 = p2[1], x3 = p3[0], y3 = p3[1];

    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
    const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;

    let a, b, c, d, e, f, g, h;
    if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
      // Affine case (parallelogram) — g/h are 0, no perspective term needed.
      a = x1 - x0; b = x2 - x1; c = x0;
      d = y1 - y0; e = y2 - y1; f = y0;
      g = 0; h = 0;
    } else {
      const det = dx1 * dy2 - dx2 * dy1;
      g = (dx3 * dy2 - dx2 * dy3) / det;
      h = (dx1 * dy3 - dx3 * dy1) / det;
      a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0;
      d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0;
    }
    return [a, b, c, d, e, f, g, h, 1];
  }

  function invert3x3(m) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
    const G = b * f - c * e, H = -(a * f - c * d), I = a * e - b * d;
    const det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-12) return null;
    const invDet = 1 / det;
    return [A * invDet, D * invDet, G * invDet,
            B * invDet, E * invDet, H * invDet,
            C * invDet, F * invDet, I * invDet];
  }

  function apply3x3(m, x, y) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const w = g * x + h * y + i;
    return [(a * x + b * y + c) / w, (d * x + e * y + f) / w];
  }

  // ---- 2. Perspective-warp a source image into an arbitrary quad ------
  // Inverse-mapping + bilinear sampling: for every destination pixel in the
  // quad's bounding box, look up where it came from in source-image space.
  // outW/outH define the destination canvas the quad is drawn onto (i.e.
  // the full mockup canvas) — only the quad's bbox is actually touched.
  function warpImageToQuad(sourceCanvasOrImg, quad, outW, outH) {
    const srcCanvas = toCanvas(sourceCanvasOrImg);
    const sctx = srcCanvas.getContext('2d');
    const srcData = sctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const sw = srcCanvas.width, sh = srcCanvas.height;

    const out = document.createElement('canvas');
    out.width = outW; out.height = outH;
    const octx = out.getContext('2d');
    const outImg = octx.createImageData(outW, outH);

    const squareToQuad = computeSquareToQuad(quad);
    const quadToSquare = invert3x3(squareToQuad);
    if (!quadToSquare) return out; // degenerate quad, bail with blank

    const xs = quad.map(p => p[0]), ys = quad.map(p => p[1]);
    const minX = Math.max(0, Math.floor(Math.min(...xs)));
    const maxX = Math.min(outW, Math.ceil(Math.max(...xs)));
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxY = Math.min(outH, Math.ceil(Math.max(...ys)));

    for (let y = minY; y < maxY; y++) {
      for (let x = minX; x < maxX; x++) {
        const [u, v] = apply3x3(quadToSquare, x + 0.5, y + 0.5);
        if (u < 0 || u > 1 || v < 0 || v > 1) continue; // outside quad
        const sx = u * (sw - 1), sy = v * (sh - 1);
        const [r, g, b, a] = bilinearSample(srcData, sw, sh, sx, sy);
        if (a === 0) continue;
        const di = (y * outW + x) * 4;
        outImg.data[di] = r; outImg.data[di + 1] = g;
        outImg.data[di + 2] = b; outImg.data[di + 3] = a;
      }
    }
    octx.putImageData(outImg, 0, 0);
    return out;
  }

  function bilinearSample(imgData, w, h, x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
    const fx = x - x0, fy = y - y0;
    const px = (xx, yy) => {
      const idx = (yy * w + xx) * 4;
      return [imgData.data[idx], imgData.data[idx + 1], imgData.data[idx + 2], imgData.data[idx + 3]];
    };
    const p00 = px(x0, y0), p10 = px(x1, y0), p01 = px(x0, y1), p11 = px(x1, y1);
    const lerp = (a, b, t) => a + (b - a) * t;
    const out = [0, 0, 0, 0];
    for (let c = 0; c < 4; c++) {
      const top = lerp(p00[c], p10[c], fx);
      const bot = lerp(p01[c], p11[c], fx);
      out[c] = lerp(top, bot, fy);
    }
    return out;
  }

  function toCanvas(imgOrCanvas) {
    if (imgOrCanvas instanceof HTMLCanvasElement) return imgOrCanvas;
    const c = document.createElement('canvas');
    c.width = imgOrCanvas.naturalWidth || imgOrCanvas.width;
    c.height = imgOrCanvas.naturalHeight || imgOrCanvas.height;
    c.getContext('2d').drawImage(imgOrCanvas, 0, 0);
    return c;
  }

  // ---- 3. Pull the shading straight out of the base photo -------------
  // Crops the quad's bbox from the base photo, converts to a normalized
  // grey ("what this patch of fabric's lighting looks like, independent
  // of the garment's actual color"), and hands back a canvas ready to be
  // multiply/soft-light blended over the warped artwork.
  function extractShadingLayer(basePhotoImg, quad, outW, outH) {
    const baseCanvas = toCanvas(basePhotoImg);
    const bctx = baseCanvas.getContext('2d');
    const xs = quad.map(p => p[0]), ys = quad.map(p => p[1]);
    const minX = Math.max(0, Math.floor(Math.min(...xs)));
    const maxX = Math.min(baseCanvas.width, Math.ceil(Math.max(...xs)));
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxY = Math.min(baseCanvas.height, Math.ceil(Math.max(...ys)));
    const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);

    const region = bctx.getImageData(minX, minY, w, h);
    let sum = 0;
    const grey = new Uint8ClampedArray(w * h);
    for (let p = 0; p < w * h; p++) {
      const i = p * 4;
      const lum = 0.299 * region.data[i] + 0.587 * region.data[i + 1] + 0.114 * region.data[i + 2];
      grey[p] = lum;
      sum += lum;
    }
    const mean = sum / (w * h) || 128;

    const out = document.createElement('canvas');
    out.width = outW; out.height = outH;
    const octx = out.getContext('2d');
    const outImg = octx.createImageData(outW, outH);
    // Place the cropped shading patch back at the quad's bbox position so it
    // lines up 1:1 with the warped artwork drawn at the same bbox.
    for (let y = 0; y < h && (minY + y) < outH; y++) {
      for (let x = 0; x < w && (minX + x) < outW; x++) {
        // Normalize around the patch's own mean so a dark navy photo and a
        // white photo both center at neutral grey — only the *shape* of the
        // lighting (folds, highlight, shadow) should carry through.
        const centered = 128 + (grey[y * w + x] - mean);
        const di = ((minY + y) * outW + (minX + x)) * 4;
        outImg.data[di] = centered; outImg.data[di + 1] = centered;
        outImg.data[di + 2] = centered; outImg.data[di + 3] = 255;
      }
    }
    octx.putImageData(outImg, 0, 0);
    return out;
  }

  // ---- 4. Full pipeline ------------------------------------------------
  // basePhotoImg: loaded <img> of the real garment photo
  // artworkImg:   loaded <img> of the user's uploaded design
  // quad:         [[x,y],[x,y],[x,y],[x,y]] TL,TR,BR,BL in basePhoto pixel space
  // opts.shadeStrength: 0..1, how much of the photo's own shading to reapply
  //                      (0.55–0.75 usually reads as "printed on fabric";
  //                      much above that starts crushing the artwork's own colors)
  function renderMockup(canvas, basePhotoImg, artworkImg, quad, opts = {}) {
    const shadeStrength = opts.shadeStrength ?? 0.65;
    const w = basePhotoImg.naturalWidth || basePhotoImg.width;
    const h = basePhotoImg.naturalHeight || basePhotoImg.height;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');

    // base photo
    ctx.drawImage(basePhotoImg, 0, 0, w, h);

    // warped artwork, drawn to an offscreen layer first so we can blend it
    const warped = warpImageToQuad(artworkImg, quad, w, h);
    const shading = extractShadingLayer(basePhotoImg, quad, w, h);

    const layer = document.createElement('canvas');
    layer.width = w; layer.height = h;
    const lctx = layer.getContext('2d');
    lctx.drawImage(warped, 0, 0);
    lctx.globalAlpha = shadeStrength;
    lctx.globalCompositeOperation = 'multiply';
    lctx.drawImage(shading, 0, 0);
    // multiply alone only darkens — re-punch through the warped artwork's
    // own alpha so the print doesn't pick up a grey halo outside its edges
    lctx.globalAlpha = 1;
    lctx.globalCompositeOperation = 'destination-in';
    lctx.drawImage(warped, 0, 0);

    ctx.drawImage(layer, 0, 0);
    return canvas;
  }

  // ---- 5. One-time helper: click 4 corners on a photo to get a quad ---
  // Not used at runtime — run this once per garment/color/angle photo to
  // find its print-area quad, then hardcode the result into
  // ZGOB_MOCKUP_CONFIG (see mockup-config.js). Usage:
  //   ZgobMockupCompositor.markQuad(document.getElementById('myPhoto'))
  // then click the 4 corners (TL, TR, BR, BL order) and read the console.
  function markQuad(imgEl) {
    const pts = [];
    const labels = ['TL', 'TR', 'BR', 'BL'];
    console.log('Click the print-area corners on the image, in order: TL, TR, BR, BL');
    imgEl.style.cursor = 'crosshair';
    imgEl.addEventListener('click', function handler(e) {
      const rect = imgEl.getBoundingClientRect();
      const scaleX = imgEl.naturalWidth / rect.width;
      const scaleY = imgEl.naturalHeight / rect.height;
      const x = Math.round((e.clientX - rect.left) * scaleX);
      const y = Math.round((e.clientY - rect.top) * scaleY);
      pts.push([x, y]);
      console.log(`${labels[pts.length - 1]}: [${x}, ${y}]`);
      if (pts.length === 4) {
        console.log('quad:', JSON.stringify(pts));
        imgEl.removeEventListener('click', handler);
        imgEl.style.cursor = '';
      }
    });
  }

  return { renderMockup, warpImageToQuad, extractShadingLayer, markQuad };
})();
