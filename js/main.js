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
