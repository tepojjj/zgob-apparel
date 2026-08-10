/* Shared chrome behavior for every page */
document.addEventListener('DOMContentLoaded', () => {
  // active nav link
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    if(a.getAttribute('href') === here) a.classList.add('active');
  });

  // mobile nav toggle
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if(toggle && links){
    toggle.addEventListener('click', () => links.classList.toggle('open'));
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
  }

  // footer year
  const yearEl = document.getElementById('year');
  if(yearEl) yearEl.textContent = new Date().getFullYear();
});

function zgobToast(message){
  let toast = document.getElementById('toast');
  if(!toast){
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(window.__zgobToastTimer);
  window.__zgobToastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function zgobFormatDate(iso){
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
}

function zgobEscape(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** Plain placeholder shown wherever a real garment/design photo hasn't been added yet
    (Admin → Garment reference photos, or a design's own photo). Deliberately blank/neutral —
    not a drawn mockup — so nobody mistakes it for what the actual product looks like. */
function zgobPhotoPlaceholder(label, sublabel){
  return `
    <div style="width:100%; height:100%; min-height:160px; display:flex; flex-direction:column;
                align-items:center; justify-content:center; gap:6px; background:#fff; border-radius:2px; padding:20px; box-sizing:border-box;">
      <span style="font-family:'Space Mono',monospace; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:#8a8a8a;">${zgobEscape(label || 'Photo coming soon')}</span>
      ${sublabel ? `<span style="font-size:12px; color:#b0b0b0; text-align:center;">${zgobEscape(sublabel)}</span>` : ''}
    </div>`;
}
