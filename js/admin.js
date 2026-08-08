document.addEventListener('DOMContentLoaded', async () => {
  const loginView = document.getElementById('loginView');
  const dashboardView = document.getElementById('dashboardView');
  const loginError = document.getElementById('loginError');

  async function showDashboard(){
    loginView.style.display = 'none';
    dashboardView.style.display = 'block';
    await renderAll();
  }

  if(await ZgobStore.isLoggedIn()) await showDashboard();

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type=submit]');
    submitBtn.disabled = true; submitBtn.textContent = 'Signing in…';
    const email = document.getElementById('email').value.trim();
    const pw = document.getElementById('pw').value;
    const result = await ZgobStore.login(email, pw);
    submitBtn.disabled = false; submitBtn.textContent = 'Sign in →';
    if(result.ok){
      loginError.style.display = 'none';
      await showDashboard();
    }else{
      loginError.style.display = 'block';
      loginError.textContent = result.message || 'Sign in failed — check your email and password.';
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await ZgobStore.logout();
    dashboardView.style.display = 'none';
    loginView.style.display = 'block';
    document.getElementById('pw').value = '';
  });

  // tab switching
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  async function renderAll(){
    const [orders, inventory, designs, messages] = await Promise.all([
      ZgobStore.getOrders(), ZgobStore.getInventory(), ZgobStore.getDesigns(), ZgobStore.getMessages()
    ]);
    renderStats(orders, inventory, messages);
    renderOrders(orders);
    renderInventory(inventory);
    renderDesigns(designs);
    renderMessages(messages);
  }

  function renderStats(orders, inventory, messages){
    const lowStock = inventory.filter(item => Object.values(item.sizes).some(n => n <= 5)).length;
    document.getElementById('statNewOrders').textContent = orders.filter(o => o.status === 'new').length;
    document.getElementById('statTotalOrders').textContent = orders.length;
    document.getElementById('statLowStock').textContent = lowStock;
    document.getElementById('statUnread').textContent = messages.filter(m => !m.read).length;
  }

  function renderOrders(orders){
    const body = document.getElementById('ordersBody');
    document.getElementById('ordersEmpty').style.display = orders.length ? 'none' : 'block';

    body.innerHTML = orders.map(o => `
      <tr>
        <td>${zgobFormatDate(o.created_at)}</td>
        <td>
          <div>${zgobEscape(o.name)}</div>
          <div class="graphite-text" style="font-size:12px;">${zgobEscape(o.email)}</div>
        </td>
        <td>
          <div>${zgobEscape(o.garment)} · ${zgobEscape(o.color)}</div>
          ${o.design_text ? `<div class="graphite-text" style="font-size:12px;">"${zgobEscape(o.design_text)}"</div>` : ''}
          ${o.artwork_url ? `<div style="font-size:12px;"><a href="${o.artwork_url}" target="_blank" rel="noopener" style="color:var(--thread);">View artwork ↗</a></div>` : ''}
        </td>
        <td>${o.size} / ${o.quantity}</td>
        <td>${zgobEscape(o.placement || '—')}</td>
        <td>
          <select class="order-status" data-id="${o.id}" style="font-family:'Space Mono',monospace; font-size:12px; background:var(--ink-2); color:var(--canvas); border:1px solid var(--line); border-radius:2px; padding:6px 8px;">
            <option value="new" ${o.status==='new'?'selected':''}>New</option>
            <option value="progress" ${o.status==='progress'?'selected':''}>In progress</option>
            <option value="done" ${o.status==='done'?'selected':''}>Fulfilled</option>
          </select>
        </td>
        <td><button class="icon-btn delete-order" data-id="${o.id}">Delete</button></td>
      </tr>
    `).join('');

    body.querySelectorAll('.order-status').forEach(sel => {
      sel.addEventListener('change', async () => {
        await ZgobStore.setOrderStatus(sel.dataset.id, sel.value);
        zgobToast('Order status updated.');
        renderAll();
      });
    });
    body.querySelectorAll('.delete-order').forEach(btn => {
      btn.addEventListener('click', async () => {
        if(confirm('Remove this order? This cannot be undone.')){
          await ZgobStore.deleteOrder(btn.dataset.id);
          renderAll();
        }
      });
    });
  }

  function renderInventory(inventory){
    const body = document.getElementById('inventoryBody');
    const sizeKeys = ['S','M','L','XL','XXL'];

    body.innerHTML = inventory.map(item => {
      const low = Object.values(item.sizes).some(n => n <= 5);
      return `
        <tr>
          <td><strong>${zgobEscape(item.name)}</strong><div class="graphite-text" style="font-size:12px;">${zgobEscape(item.category)}</div></td>
          <td>$${Number(item.price).toFixed(2)}</td>
          ${sizeKeys.map(sz => `
            <td>
              <input type="number" min="0" value="${item.sizes[sz] ?? 0}" data-id="${item.id}" data-size="${sz}"
                class="stock-input" style="width:56px; padding:6px 8px; font-family:'Space Mono',monospace; font-size:13px;
                background:var(--ink-2); color:var(--canvas); border:1px solid var(--line); border-radius:2px;">
            </td>
          `).join('')}
          <td><span class="status ${low ? 'status-low' : 'status-ok'}">${low ? 'Low stock' : 'In stock'}</span></td>
        </tr>
      `;
    }).join('');

    body.querySelectorAll('.stock-input').forEach(input => {
      input.addEventListener('change', async () => {
        await ZgobStore.updateStock(input.dataset.id, input.dataset.size, input.value);
        zgobToast('Inventory updated.');
        renderAll();
      });
    });
  }

  /* ---------------- designs ---------------- */
  let designPhotoFile = null;      // File picked but not yet uploaded
  let designPhotoUrl = null;       // URL already on the row being edited (kept if no new file is picked)
  let designsCache = [];

  const designTitle = document.getElementById('designTitle');
  const designCategory = document.getElementById('designCategory');
  const designColorway = document.getElementById('designColorway');
  const designPrice = document.getElementById('designPrice');
  const designPhotoInput = document.getElementById('designPhoto');
  const designPhotoName = document.getElementById('designPhotoName');
  const designPhotoPreviewWrap = document.getElementById('designPhotoPreviewWrap');
  const designPhotoPreview = document.getElementById('designPhotoPreview');
  const designEditingId = document.getElementById('designEditingId');
  const designFormTitle = document.getElementById('designFormTitle');
  const designSaveBtn = document.getElementById('designSaveBtn');
  const designCancelEditBtn = document.getElementById('designCancelEditBtn');

  function resetDesignForm(){
    designEditingId.value = '';
    designFormTitle.textContent = 'Add a design';
    designSaveBtn.textContent = 'Save design →';
    designCancelEditBtn.style.display = 'none';
    designTitle.value = ''; designCategory.value = ''; designColorway.value = ''; designPrice.value = '';
    designPhotoInput.value = '';
    designPhotoFile = null; designPhotoUrl = null;
    designPhotoName.style.display = 'none'; designPhotoName.textContent = '';
    designPhotoPreviewWrap.style.display = 'none'; designPhotoPreview.src = '';
  }

  designPhotoInput.addEventListener('change', () => {
    const file = designPhotoInput.files[0];
    if(!file) return;
    designPhotoFile = file;
    designPhotoName.style.display = 'block';
    designPhotoName.textContent = file.name;
    designPhotoPreviewWrap.style.display = 'block';
    designPhotoPreview.src = URL.createObjectURL(file);
  });

  designCancelEditBtn.addEventListener('click', resetDesignForm);

  designSaveBtn.addEventListener('click', async () => {
    const title = designTitle.value.trim();
    const category = designCategory.value.trim();
    const colorway = designColorway.value.trim();
    const price = Number(designPrice.value);
    if(!title || !category || !colorway || !(price >= 0)){
      zgobToast('Fill in title, category, colourway and price.');
      return;
    }

    designSaveBtn.disabled = true;
    designSaveBtn.textContent = designPhotoFile ? 'Uploading photo…' : 'Saving…';

    try{
      let imageUrl = designPhotoUrl;
      if(designPhotoFile){
        imageUrl = await ZgobStore.uploadDesignPhoto(designPhotoFile);
      }

      const editingId = designEditingId.value;
      const payload = { title, category, colorway, price, tags: category ? [category] : [], swatch: ['#ede6d6'], imageUrl };

      if(editingId){
        await ZgobStore.updateDesign(editingId, payload);
        zgobToast('Design updated.');
      }else{
        const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
        await ZgobStore.addDesign(Object.assign({ id }, payload));
        zgobToast('Design added.');
      }
      resetDesignForm();
      renderAll();
    }catch(err){
      zgobToast('Something went wrong saving the design.');
      console.error(err);
    }finally{
      designSaveBtn.disabled = false;
      designSaveBtn.textContent = 'Save design →';
    }
  });

  function renderDesigns(designs){
    designsCache = designs;
    const body = document.getElementById('designsBody');
    document.getElementById('designsEmpty').style.display = designs.length ? 'none' : 'block';

    body.innerHTML = designs.map(d => `
      <tr>
        <td>${d.image_url
          ? `<img src="${d.image_url}" alt="" style="width:48px; height:48px; object-fit:cover; border-radius:2px; border:1px solid var(--line);">`
          : `<span class="graphite-text" style="font-size:11px;">Sketch only</span>`}</td>
        <td><strong>${zgobEscape(d.title)}</strong></td>
        <td>${zgobEscape(d.category)}</td>
        <td>$${Number(d.price).toFixed(2)}</td>
        <td style="display:flex; gap:6px;">
          <button class="icon-btn edit-design" data-id="${d.id}">Edit</button>
          <button class="icon-btn delete-design" data-id="${d.id}">Delete</button>
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('.edit-design').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = designsCache.find(x => x.id === btn.dataset.id);
        if(!d) return;
        designEditingId.value = d.id;
        designFormTitle.textContent = `Editing "${d.title}"`;
        designSaveBtn.textContent = 'Save changes →';
        designCancelEditBtn.style.display = 'inline-block';
        designTitle.value = d.title;
        designCategory.value = d.category;
        designColorway.value = d.colorway;
        designPrice.value = d.price;
        designPhotoFile = null;
        designPhotoUrl = d.image_url || null;
        designPhotoInput.value = '';
        if(d.image_url){
          designPhotoPreviewWrap.style.display = 'block';
          designPhotoPreview.src = d.image_url;
        }else{
          designPhotoPreviewWrap.style.display = 'none';
        }
        window.scrollTo({ top: document.querySelector('.card').offsetTop - 20, behavior: 'smooth' });
      });
    });
    body.querySelectorAll('.delete-design').forEach(btn => {
      btn.addEventListener('click', async () => {
        if(confirm('Delete this design? This cannot be undone.')){
          await ZgobStore.deleteDesign(btn.dataset.id);
          renderAll();
        }
      });
    });
  }

  function renderMessages(messages){
    const body = document.getElementById('messagesBody');
    document.getElementById('messagesEmpty').style.display = messages.length ? 'none' : 'block';

    body.innerHTML = messages.map(m => `
      <tr>
        <td>${zgobFormatDate(m.created_at)}</td>
        <td>
          <div>${zgobEscape(m.name)}</div>
          <div class="graphite-text" style="font-size:12px;">${zgobEscape(m.email)}</div>
        </td>
        <td>${zgobEscape(m.subject)}</td>
        <td style="white-space:normal; max-width:320px;">${zgobEscape(m.message)}</td>
        <td><span class="status ${m.read ? 'status-done' : 'status-new'}">${m.read ? 'Read' : 'Unread'}</span></td>
        <td style="display:flex; gap:6px;">
          <button class="icon-btn toggle-read" data-id="${m.id}" data-read="${m.read}">${m.read ? 'Mark unread' : 'Mark read'}</button>
          <button class="icon-btn delete-message" data-id="${m.id}">Delete</button>
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('.toggle-read').forEach(btn => {
      btn.addEventListener('click', async () => {
        const isRead = btn.dataset.read === 'true';
        await ZgobStore.markMessageRead(btn.dataset.id, !isRead);
        renderAll();
      });
    });
    body.querySelectorAll('.delete-message').forEach(btn => {
      btn.addEventListener('click', async () => {
        if(confirm('Delete this message? This cannot be undone.')){
          await ZgobStore.deleteMessage(btn.dataset.id);
          renderAll();
        }
      });
    });
  }
});
