document.addEventListener('DOMContentLoaded', async () => {
  const loginView = document.getElementById('loginView');
  const dashboardView = document.getElementById('dashboardView');
  const loginError = document.getElementById('loginError');
  let designsCache = []; // must be declared before the first render can run
  let inventoryCache = []; // kept in sync so the design form can look up live garment prices
  let analyticsOrders = []; // raw orders, re-filtered locally whenever the range buttons change
  let analyticsInventory = []; // for estimating revenue on pre-price-tracking orders
  let currentAnalyticsRange = '30';

  // design form fields — declared up here (rather than down near the rest of the
  // designs code) because the very first dashboard render can populate/read them
  // before execution would otherwise reach their old declaration point
  let designPhotoFile = null;      // File picked but not yet uploaded
  let designPhotoUrl = null;       // URL already on the row being edited (kept if no new file is picked)
  let designArtworkFile = null;    // print-ready artwork File picked but not yet uploaded
  let designArtworkUrl = null;     // print-ready artwork URL already on the row being edited

  const designTitle = document.getElementById('designTitle');
  const designCategory = document.getElementById('designCategory');
  const designColorway = document.getElementById('designColorway');
  const designGarment = document.getElementById('designGarment');
  const designMarkupField = document.getElementById('designMarkupField');
  const designMarkup = document.getElementById('designMarkup');
  const designPrice = document.getElementById('designPrice');
  const designPriceLinkedNote = document.getElementById('designPriceLinkedNote');
  const designPhotoInput = document.getElementById('designPhoto');
  const designPhotoName = document.getElementById('designPhotoName');
  const designPhotoPreviewWrap = document.getElementById('designPhotoPreviewWrap');
  const designPhotoPreview = document.getElementById('designPhotoPreview');
  const designArtworkInput = document.getElementById('designArtwork');
  const designArtworkName = document.getElementById('designArtworkName');
  const designEditingId = document.getElementById('designEditingId');
  const designFormTitle = document.getElementById('designFormTitle');
  const designSaveBtn = document.getElementById('designSaveBtn');
  const designCancelEditBtn = document.getElementById('designCancelEditBtn');

  // rebuilds the "match to inventory garment" dropdown from the current inventory list,
  // preserving whichever garment is currently selected (if it still exists)
  function populateDesignGarmentOptions(){
    const current = designGarment.value;
    designGarment.innerHTML = '<option value="">— custom price (not linked to inventory) —</option>' +
      inventoryCache.map(item => `<option value="${item.id}">${zgobEscape(item.name)} — ₱${Number(item.price).toFixed(2)}</option>`).join('');
    if(current && inventoryCache.some(i => i.id === current)) designGarment.value = current;
    updateDesignPriceFromGarment();
  }

  // when a garment is linked, the price field becomes a read-only computed value
  // (garment's live inventory price + markup); when unlinked, it's a normal manual field
  function updateDesignPriceFromGarment(){
    const item = inventoryCache.find(i => i.id === designGarment.value);
    if(item){
      designMarkupField.style.display = 'block';
      designPriceLinkedNote.style.display = 'inline';
      designPrice.readOnly = true;
      designPrice.value = (Number(item.price) + (Number(designMarkup.value) || 0)).toFixed(2);
    }else{
      designMarkupField.style.display = 'none';
      designPriceLinkedNote.style.display = 'none';
      designPrice.readOnly = false;
    }
  }
  designGarment.addEventListener('change', updateDesignPriceFromGarment);
  designMarkup.addEventListener('input', updateDesignPriceFromGarment);

  async function showDashboard(){
    loginView.style.display = 'none';
    dashboardView.style.display = 'block';
    await renderAll();
  }

  // tab switching — wired up before the initial render so a render error
  // can never prevent the tabs themselves from being clickable
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  document.querySelectorAll('.analytics-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.analytics-range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentAnalyticsRange = btn.dataset.range;
      renderAnalytics(analyticsOrders, analyticsInventory);
    });
  });

  try{
    if(await ZgobStore.isLoggedIn()) await showDashboard();
  }catch(err){
    console.error('Failed to load dashboard:', err);
  }

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

  async function renderAll(){
    const [orders, inventory, designs, messages] = await Promise.all([
      ZgobStore.getOrders(), ZgobStore.getInventory(), ZgobStore.getDesigns(), ZgobStore.getMessages()
    ]);
    analyticsOrders = orders;
    analyticsInventory = inventory;
    renderStats(orders, inventory, messages);
    renderOrders(orders, inventory);
    renderAnalytics(orders, inventory);
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

  function renderOrders(orders, inventory){
    const body = document.getElementById('ordersBody');
    document.getElementById('ordersEmpty').style.display = orders.length ? 'none' : 'block';

    body.innerHTML = orders.map(o => {
      const { amount: price, estimated } = getOrderRevenue(o, inventory);
      const unit = o.unit_price != null ? Number(o.unit_price) : (o.quantity ? price / o.quantity : 0);
      return `
      <tr>
        <td>${zgobFormatDate(o.created_at)}</td>
        <td>
          <div>${zgobEscape(o.name)}</div>
          <div class="graphite-text" style="font-size:12px;">${zgobEscape(o.email)}</div>
        </td>
        <td>
          <div>${zgobEscape(o.garment)} · ${zgobEscape(o.color)}</div>
          ${o.design_text ? `<div class="graphite-text" style="font-size:12px;">"${zgobEscape(o.design_text)}"</div>` : ''}
          ${o.notes ? `<div class="graphite-text" style="font-size:12px;">Note: ${zgobEscape(o.notes)}</div>` : ''}
          ${o.artwork_url ? `<div style="font-size:12px;"><a href="${o.artwork_url}" target="_blank" rel="noopener" style="color:var(--thread);">View artwork ↗</a></div>` : ''}
          ${o.reference_mockup_url ? `<div style="font-size:12px;"><a href="${o.reference_mockup_url}" target="_blank" rel="noopener" style="color:var(--thread);">View their mockup ↗</a></div>` : ''}
        </td>
        <td>${o.size} / ${o.quantity}</td>
        <td>${zgobEscape(o.placement || '—')}</td>
        <td>
          <div>₱${price.toFixed(2)}</div>
          <div class="graphite-text" style="font-size:12px;">₱${unit.toFixed(2)} × ${o.quantity}${estimated ? ' · est.' : ''}</div>
        </td>
        <td>
          <select class="order-status" data-id="${o.id}" style="font-family:'Space Mono',monospace; font-size:12px; background:var(--ink-2); color:var(--canvas); border:1px solid var(--line); border-radius:2px; padding:6px 8px;">
            <option value="new" ${o.status==='new'?'selected':''}>New</option>
            <option value="progress" ${o.status==='progress'?'selected':''}>In progress</option>
            <option value="done" ${o.status==='done'?'selected':''}>Fulfilled</option>
          </select>
        </td>
        <td><button class="icon-btn delete-order" data-id="${o.id}">Delete</button></td>
      </tr>
    `;
    }).join('');

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

  /* ---------------- analytics ---------------- */

  // The order's revenue: use the price captured at order time if we have it (unit_price/
  // total_price were added after launch), otherwise fall back to estimating from the
  // garment's current inventory price — flagged so the dashboard can disclose the estimate.
  function getOrderRevenue(order, inventory){
    if(order.total_price != null) return { amount: Number(order.total_price), estimated: false };
    const item = inventory.find(i => i.name === order.garment);
    const price = item ? Number(item.price) : 0;
    return { amount: price * (Number(order.quantity) || 0), estimated: true };
  }

  function filterOrdersByRange(orders, range){
    if(range === 'all') return orders;
    const cutoff = Date.now() - Number(range) * 24 * 60 * 60 * 1000;
    return orders.filter(o => new Date(o.created_at).getTime() >= cutoff);
  }

  function bucketKeyFor(dateStr, granularity){
    const d = new Date(dateStr);
    if(granularity === 'day') return d.toISOString().slice(0, 10);
    if(granularity === 'week'){
      const ws = new Date(d); ws.setHours(0,0,0,0); ws.setDate(ws.getDate() - ws.getDay());
      return ws.toISOString().slice(0, 10);
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function bucketLabelFor(key, granularity){
    if(granularity === 'month'){
      const [y, m] = key.split('-');
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    }
    return new Date(key + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // Builds the ordered sequence of bucket keys to show on the x-axis, including buckets
  // with zero orders, so gaps in activity show as gaps rather than being skipped over.
  function buildBucketSequence(granularity, count, earliestOrderDate){
    const now = new Date();
    const keys = [];
    if(granularity === 'day'){
      for(let i = count - 1; i >= 0; i--){
        const d = new Date(now); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
        keys.push(d.toISOString().slice(0, 10));
      }
    }else if(granularity === 'week'){
      const ws0 = new Date(now); ws0.setHours(0,0,0,0); ws0.setDate(ws0.getDate() - ws0.getDay());
      for(let i = count - 1; i >= 0; i--){
        const d = new Date(ws0); d.setDate(d.getDate() - i * 7);
        keys.push(d.toISOString().slice(0, 10));
      }
    }else{
      const start = count
        ? new Date(now.getFullYear(), now.getMonth() - (count - 1), 1)
        : new Date((earliestOrderDate || now).getFullYear(), (earliestOrderDate || now).getMonth(), 1);
      const cursor = new Date(start);
      while(cursor <= now){
        keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
    return keys;
  }

  function renderRevenueChart(filteredOrders, inventory){
    const container = document.getElementById('revenueChart');
    if(!filteredOrders.length){
      container.innerHTML = '<div class="bar-chart-empty">No orders in this range yet.</div>';
      return;
    }

    let granularity, count;
    if(currentAnalyticsRange === '30'){ granularity = 'day'; count = 30; }
    else if(currentAnalyticsRange === '90'){ granularity = 'week'; count = 13; }
    else if(currentAnalyticsRange === '365'){ granularity = 'month'; count = 12; }
    else { granularity = 'month'; count = null; }

    let earliest = null;
    filteredOrders.forEach(o => {
      const d = new Date(o.created_at);
      if(!earliest || d < earliest) earliest = d;
    });

    const keys = buildBucketSequence(granularity, count, earliest);
    const revenueByKey = new Map(keys.map(k => [k, 0]));
    filteredOrders.forEach(o => {
      const key = bucketKeyFor(o.created_at, granularity);
      if(revenueByKey.has(key)){
        revenueByKey.set(key, revenueByKey.get(key) + getOrderRevenue(o, inventory).amount);
      }
    });

    const max = Math.max(...revenueByKey.values(), 1);
    container.innerHTML = `<div class="bar-chart">${keys.map(k => {
      const v = revenueByKey.get(k);
      const pct = v > 0 ? Math.max((v / max) * 100, 4) : 0;
      return `<div class="bar-chart-col" title="₱${v.toFixed(2)}">
        <div class="bar-chart-bar" style="height:0%" data-final="${pct}"></div>
        <div class="bar-chart-label">${bucketLabelFor(k, granularity)}</div>
      </div>`;
    }).join('')}</div>`;

    requestAnimationFrame(() => {
      container.querySelectorAll('.bar-chart-bar').forEach(el => { el.style.height = el.dataset.final + '%'; });
    });
  }

  function renderStatusChart(statusCounts, total){
    const container = document.getElementById('statusChart');
    if(!total){
      container.innerHTML = '<div class="bar-chart-empty">No orders in this range yet.</div>';
      return;
    }
    const rows = [
      { key: 'new', label: 'New' },
      { key: 'progress', label: 'In progress' },
      { key: 'done', label: 'Fulfilled' }
    ];
    container.innerHTML = rows.map(r => {
      const count = statusCounts[r.key] || 0;
      const pct = total ? (count / total) * 100 : 0;
      return `<div class="status-bar-row">
        <span class="status-bar-label">${r.label}</span>
        <div class="status-bar-track"><div class="status-bar-fill ${r.key}" style="width:0%" data-final="${pct}"></div></div>
        <span class="status-bar-count">${count}</span>
      </div>`;
    }).join('');
    requestAnimationFrame(() => {
      container.querySelectorAll('.status-bar-fill').forEach(el => { el.style.width = el.dataset.final + '%'; });
    });
  }

  function renderTopGarments(garmentStats){
    const body = document.getElementById('topGarmentsBody');
    const rows = Object.entries(garmentStats)
      .map(([name, s]) => ({ name, ...s }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
    document.getElementById('topGarmentsEmpty').style.display = rows.length ? 'none' : 'block';
    body.innerHTML = rows.map(r => `
      <tr>
        <td>${zgobEscape(r.name)}</td>
        <td>${r.orders}</td>
        <td>${r.units}</td>
        <td>₱${r.revenue.toFixed(2)}</td>
      </tr>
    `).join('');
  }

  function renderAnalytics(orders, inventory){
    const filtered = filterOrdersByRange(orders, currentAnalyticsRange);

    let revenue = 0, units = 0, estimatedUsed = false;
    const statusCounts = { new: 0, progress: 0, done: 0 };
    const garmentStats = {};

    filtered.forEach(o => {
      const { amount, estimated } = getOrderRevenue(o, inventory);
      revenue += amount;
      if(estimated) estimatedUsed = true;
      units += Number(o.quantity) || 0;
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
      if(!garmentStats[o.garment]) garmentStats[o.garment] = { orders: 0, units: 0, revenue: 0 };
      garmentStats[o.garment].orders += 1;
      garmentStats[o.garment].units += Number(o.quantity) || 0;
      garmentStats[o.garment].revenue += amount;
    });

    document.getElementById('statRevenue').textContent = `₱${revenue.toFixed(2)}`;
    document.getElementById('statOrderCount').textContent = filtered.length;
    document.getElementById('statAvgOrder').textContent = `₱${(filtered.length ? revenue / filtered.length : 0).toFixed(2)}`;
    document.getElementById('statUnitsSold').textContent = units;
    document.getElementById('analyticsEstimateNote').style.display = estimatedUsed ? 'block' : 'none';

    renderRevenueChart(filtered, inventory);
    renderStatusChart(statusCounts, filtered.length);
    renderTopGarments(garmentStats);
  }

  function renderInventory(inventory){
    inventoryCache = inventory;
    populateDesignGarmentOptions();
    const body = document.getElementById('inventoryBody');
    const sizeKeys = ['S','M','L','XL','XXL'];

    body.innerHTML = inventory.map(item => {
      const low = Object.values(item.sizes).some(n => n <= 5);
      return `
        <tr>
          <td><strong>${zgobEscape(item.name)}</strong><div class="graphite-text" style="font-size:12px;">${zgobEscape(item.category)}</div></td>
          <td>
            <input type="number" min="0" step="0.01" value="${Number(item.price).toFixed(2)}" data-id="${item.id}"
              class="price-input" style="width:76px; padding:6px 8px; font-family:'Space Mono',monospace; font-size:13px;
              background:var(--ink-2); color:var(--canvas); border:1px solid var(--line); border-radius:2px;">
          </td>
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
    body.querySelectorAll('.price-input').forEach(input => {
      input.addEventListener('change', async () => {
        await ZgobStore.updateGarmentPrice(input.dataset.id, input.value);
        zgobToast('Price updated.');
        renderAll();
      });
    });
  }

  /* ---------------- designs ---------------- */
  function resetDesignForm(){
    designEditingId.value = '';
    designFormTitle.textContent = 'Add a design';
    designSaveBtn.textContent = 'Save design →';
    designCancelEditBtn.style.display = 'none';
    designTitle.value = ''; designCategory.value = ''; designColorway.value = ''; designPrice.value = '';
    designGarment.value = ''; designMarkup.value = '0';
    updateDesignPriceFromGarment();
    designPhotoInput.value = '';
    designPhotoFile = null; designPhotoUrl = null;
    designPhotoName.style.display = 'none'; designPhotoName.textContent = '';
    designPhotoPreviewWrap.style.display = 'none'; designPhotoPreview.src = '';
    designArtworkInput.value = '';
    designArtworkFile = null; designArtworkUrl = null;
    designArtworkName.style.display = 'none'; designArtworkName.textContent = '';
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

  designArtworkInput.addEventListener('change', () => {
    const file = designArtworkInput.files[0];
    if(!file) return;
    designArtworkFile = file;
    designArtworkName.style.display = 'block';
    designArtworkName.textContent = file.name;
  });

  designCancelEditBtn.addEventListener('click', resetDesignForm);

  // matches every design whose title exactly matches an inventory item's name (case/whitespace-insensitive)
  // to that item at ₱0 markup, so its price is always identical to — and stays in sync with — the Inventory price.
  // Designs with no exact-name match (different wording, ambiguous duplicates, etc.) are left alone for manual
  // linking via Edit, since guessing wrong would silently mis-price a design.
  document.getElementById('bulkLinkDesignsBtn').addEventListener('click', async () => {
    const btn = document.getElementById('bulkLinkDesignsBtn');
    btn.disabled = true;
    btn.textContent = 'Linking…';
    let linked = 0, skipped = 0;
    try{
      for(const d of designsCache){
        if(d.garment_id) continue; // already linked — leave as-is
        const match = inventoryCache.find(i => i.name.trim().toLowerCase() === d.title.trim().toLowerCase());
        if(!match){ skipped++; continue; }
        await ZgobStore.updateDesign(d.id, {
          title: d.title, category: d.category, colorway: d.colorway,
          price: match.price, garmentId: match.id, markup: 0,
          tags: d.tags, swatch: d.swatch, imageUrl: d.image_url, artworkUrl: d.artwork_url
        });
        linked++;
      }
      zgobToast(skipped
        ? `Linked ${linked} design${linked===1?'':'s'} automatically. ${skipped} need${skipped===1?'s':''} a manual match — their title doesn't exactly match an Inventory item name. Edit each one and pick from "Match to inventory garment".`
        : `Linked ${linked} design${linked===1?'':'s'} automatically — every design now matches its Inventory price.`);
      renderAll();
    }catch(err){
      zgobToast('Something went wrong linking designs.');
      console.error(err);
    }finally{
      btn.disabled = false;
      btn.textContent = 'Link all designs to matching Inventory items (₱0 markup) →';
    }
  });

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
    designSaveBtn.textContent = (designPhotoFile || designArtworkFile) ? 'Uploading…' : 'Saving…';

    try{
      let imageUrl = designPhotoUrl;
      if(designPhotoFile){
        imageUrl = await ZgobStore.uploadDesignPhoto(designPhotoFile);
      }
      let artworkUrl = designArtworkUrl;
      if(designArtworkFile){
        artworkUrl = await ZgobStore.uploadDesignPhoto(designArtworkFile);
      }

      const editingId = designEditingId.value;
      const payload = {
        title, category, colorway, price,
        garmentId: designGarment.value || null,
        markup: Number(designMarkup.value) || 0,
        tags: category ? [category] : [], swatch: ['#ede6d6'], imageUrl, artworkUrl
      };

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

    body.innerHTML = designs.map(d => {
      const garment = inventoryCache.find(i => i.id === d.garment_id);
      // if linked, always show the live inventory price + markup rather than the stored snapshot,
      // so this stays accurate even if the garment's inventory price changed after this design was saved
      const displayPrice = garment ? (Number(garment.price) + Number(d.markup || 0)) : Number(d.price);
      return `
      <tr>
        <td>${d.image_url
          ? `<img src="${d.image_url}" alt="" style="width:48px; height:48px; object-fit:cover; border-radius:2px; border:1px solid var(--line);">`
          : `<span class="graphite-text" style="font-size:11px;">Sketch only</span>`}</td>
        <td><strong>${zgobEscape(d.title)}</strong></td>
        <td>${zgobEscape(d.category)}</td>
        <td>${garment ? zgobEscape(garment.name) : '<span class="graphite-text" style="font-size:12px;">— none —</span>'}</td>
        <td>₱${displayPrice.toFixed(2)}</td>
        <td>${d.artwork_url
          ? `<span class="status status-ok">Ready to use</span>`
          : `<span class="status status-low">None — text only</span>`}</td>
        <td style="display:flex; gap:6px;">
          <button class="icon-btn edit-design" data-id="${d.id}">Edit</button>
          <button class="icon-btn delete-design" data-id="${d.id}">Delete</button>
        </td>
      </tr>
    `;
    }).join('');

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
        designGarment.value = d.garment_id || '';
        designMarkup.value = d.markup || 0;
        updateDesignPriceFromGarment();
        if(!d.garment_id) designPrice.value = d.price;
        designPhotoFile = null;
        designPhotoUrl = d.image_url || null;
        designPhotoInput.value = '';
        if(d.image_url){
          designPhotoPreviewWrap.style.display = 'block';
          designPhotoPreview.src = d.image_url;
        }else{
          designPhotoPreviewWrap.style.display = 'none';
        }
        designArtworkFile = null;
        designArtworkUrl = d.artwork_url || null;
        designArtworkInput.value = '';
        if(d.artwork_url){
          designArtworkName.style.display = 'block';
          designArtworkName.textContent = 'Current: ' + d.artwork_url.split('/').pop();
        }else{
          designArtworkName.style.display = 'none';
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