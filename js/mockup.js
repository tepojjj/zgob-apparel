/* =========================================================
   ZGOB APPAREL — text-to-image helper for the mockup pipeline
   Renders a typed design as a PNG so text-only designs can be
   uploaded/composited the same way uploaded artwork is.
   ========================================================= */

/** Render plain text onto a transparent PNG so text-only designs can be composited the same way uploaded artwork is. */
function zgobTextToImageBlob(text, { width = 800, height = 800 } = {}){
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#14120d';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(width / 10)}px Arial, sans-serif`;
    // simple word wrap so long text doesn't run off the canvas
    const words = text.split(' ');
    const lines = [];
    let line = '';
    words.forEach(word => {
      const test = line ? `${line} ${word}` : word;
      if(ctx.measureText(test).width > width * 0.85 && line){
        lines.push(line);
        line = word;
      }else{
        line = test;
      }
    });
    if(line) lines.push(line);
    const lineHeight = width / 8;
    const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((l, i) => ctx.fillText(l, width / 2, startY + i * lineHeight));
    canvas.toBlob(blob => resolve(blob), 'image/png');
  });
}

const ZgobMockup = {
  textToImageBlob: zgobTextToImageBlob
};
