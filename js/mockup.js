/* =========================================================
   ZGOB APPAREL — mockup client helper
   Talks to /api/mockup-create + /api/mockup-status (Printful
   Mockup Generator, proxied server-side so the API key never
   reaches the browser).
   ========================================================= */

/** Render plain text onto a transparent PNG so text-only designs can still be sent to Printful. */
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
  textToImageBlob: zgobTextToImageBlob,

  /** POST /api/mockup-create, then poll /api/mockup-status until done. onStatus(status) fires on each poll. */
  async generate({ garment, color, size, placement, imageUrl }, onStatus){
    const createRes = await fetch('/api/mockup-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garment, color, size, placement, imageUrl })
    });
    const created = await createRes.json();
    if(!createRes.ok) throw new Error(created.error || 'Could not start mockup generation.');

    const taskKey = created.taskKey;
    const maxAttempts = 20;
    for(let attempt = 0; attempt < maxAttempts; attempt++){
      await new Promise(r => setTimeout(r, 1500));
      const statusRes = await fetch(`/api/mockup-status?taskKey=${encodeURIComponent(taskKey)}`);
      const statusData = await statusRes.json();
      if(!statusRes.ok) throw new Error(statusData.error || 'Could not check mockup status.');
      onStatus && onStatus(statusData.status);
      if(statusData.status === 'completed' && statusData.mockupUrl) return statusData.mockupUrl;
      if(statusData.status === 'failed') throw new Error('Printful could not generate this mockup.');
    }
    throw new Error('Mockup generation timed out — please try again.');
  }
};
