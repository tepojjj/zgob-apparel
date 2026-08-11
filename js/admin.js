document.addEventListener('DOMContentLoaded', async () => {
  const loginView = document.getElementById('loginView');
  const dashboardView = document.getElementById('dashboardView');
  const loginError = document.getElementById('loginError');
  let designsCache = []; // must be declared before the first render can run
  let inventoryCache = []; // kept in sync so the design form can look up live garment prices
  let analyticsOrders = []; // raw orders, re-filtered locally whenever the range buttons change
  let analyticsInventory = []; // for estimating revenue on pre-price-tracking orders
  let currentAnalyticsRange = '30';
  let currentUserRole = 'staff'; // fetched fresh after every sign-in; fails closed to least-privileged if the fetch errors
  let currentUserId = null; // this user's own id, so the Staff tab can stop them removing/demoting themselves
  let orderGroupsCache = []; // orders grouped into job orders, kept for the Receipt button's click handler

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
    currentUserRole = await ZgobStore.getMyRole();
    currentUserId = await ZgobStore.getMyId();
    applyRolePermissions();
    await renderAll();
  }

  // hides/disables everything staff shouldn't touch. Elements here are static (present once
  // in the page, not re-rendered per row) — dynamic per-row controls (order/design/message
  // action buttons, editable inventory cells) are gated inside their own render functions
  // below instead, since those get rebuilt on every refresh.
  function applyRolePermissions(){
    const isAdmin = currentUserRole === 'admin';
    const roleBadge = document.getElementById('roleBadge');
    if(roleBadge) roleBadge.textContent = isAdmin ? 'Admin' : 'Staff (view & print only)';

    document.querySelectorAll('.admin-tab[data-tab="analytics"]').forEach(el => el.style.display = isAdmin ? '' : 'none');
    const analyticsPanel = document.getElementById('tab-analytics');
    if(analyticsPanel && !isAdmin) analyticsPanel.classList.remove('active');

    document.querySelectorAll('.admin-tab[data-tab="staff"]').forEach(el => el.style.display = isAdmin ? '' : 'none');
    const staffPanel = document.getElementById('tab-staff');
    if(staffPanel && !isAdmin) staffPanel.classList.remove('active');

    const viewCancelledBtn = document.getElementById('viewCancelledBtn');
    if(viewCancelledBtn) viewCancelledBtn.style.display = isAdmin ? '' : 'none';
    const cancelledPanel = document.getElementById('cancelledPanel');
    if(cancelledPanel && !isAdmin) cancelledPanel.style.display = 'none';

    const resetBtn = document.getElementById('resetReceiptSeqBtn');
    if(resetBtn){
      resetBtn.style.display = isAdmin ? '' : 'none';
      const hint = resetBtn.nextElementSibling;
      if(hint && hint.tagName === 'P') hint.style.display = isAdmin ? '' : 'none';
    }

    const refPhotosLink = document.getElementById('refPhotosLink');
    if(refPhotosLink) refPhotosLink.style.display = isAdmin ? '' : 'none';

    // the whole "add/edit a design" form, including the bulk-link button — staff can still
    // browse the Designs table itself (rendered further down), just not change it
    const designFormCard = document.getElementById('designFormCard');
    if(designFormCard) designFormCard.style.display = isAdmin ? '' : 'none';
    const bulkLinkBtn = document.getElementById('bulkLinkDesignsBtn');
    if(bulkLinkBtn) bulkLinkBtn.style.display = isAdmin ? '' : 'none';
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
    const isAdmin = currentUserRole === 'admin';
    const [orders, inventory, designs, messages, voidedReceipts, profiles] = await Promise.all([
      ZgobStore.getOrders(), ZgobStore.getInventory(), ZgobStore.getDesigns(), ZgobStore.getMessages(),
      isAdmin ? ZgobStore.getVoidedReceipts() : Promise.resolve([]), // staff can't read this table at all — don't even ask
      isAdmin ? ZgobStore.getAllProfiles() : Promise.resolve([])     // Staff tab is admin-only too
    ]);
    analyticsOrders = orders;
    analyticsInventory = inventory;
    renderStats(orders, inventory, messages);
    renderOrders(orders, inventory);
    renderCancelled(voidedReceipts);
    renderAnalytics(orders, inventory);
    renderInventory(inventory);
    renderDesigns(designs);
    renderMessages(messages);
    if(isAdmin) renderStaff(profiles);
  }

  function renderStats(orders, inventory, messages){
    const lowStock = inventory.filter(item => Object.values(item.sizes).some(n => n <= 5)).length;
    document.getElementById('statNewOrders').textContent = orders.filter(o => o.status === 'new').length;
    document.getElementById('statTotalOrders').textContent = orders.length;
    document.getElementById('statLowStock').textContent = lowStock;
    document.getElementById('statUnread').textContent = messages.filter(m => !m.read).length;
  }

  // A customer submits one order form but each size/quantity they entered is stored as
  // its own row (see customize.html). Rows from the same submission share an
  // order_group_id (see js/store.js addOrder). Older rows placed before that column
  // existed don't have one, so as a fallback we regroup them by name + email + the
  // "Part of a multi-size order: …" note customize.html already wrote identically onto
  // every row of that submission. Anything left over is treated as its own single-line
  // job order.
  function orderGroupKey(o){
    if(o.order_group_id) return 'g:' + o.order_group_id;
    if(o.notes && /multi-size order/i.test(o.notes)) return 'legacy:' + o.name + '|' + o.email + '|' + o.notes;
    return 'single:' + o.id;
  }

  function groupOrderRows(orders){
    const map = new Map();
    orders.forEach(o => {
      const key = orderGroupKey(o);
      if(!map.has(key)) map.set(key, []);
      map.get(key).push(o);
    });
    return Array.from(map.values());
  }

  // Per-line unit/total price, falling back to the garment's current inventory price
  // (flagged as estimated) for rows placed before unit_price/total_price were tracked.
  function getLineAmounts(o, inventory){
    if(o.unit_price != null || o.total_price != null){
      const total = o.total_price != null ? Number(o.total_price) : Number(o.unit_price) * (Number(o.quantity) || 0);
      const unit = o.unit_price != null ? Number(o.unit_price) : (o.quantity ? total / o.quantity : 0);
      return { unit, total, estimated: false };
    }
    const item = inventory.find(i => i.name === o.garment);
    const unit = item ? Number(item.price) : 0;
    return { unit, total: unit * (Number(o.quantity) || 0), estimated: true };
  }

  // Sequential receipt numbers (JO-000123) are assigned server-side per submission (see
  // customize.html + next_receipt_no() in schema.sql) and are admin-editable afterwards.
  // Orders placed before this existed fall back to a short id-based number so every
  // order still shows something in that column.
  function displayReceiptNo(primary){
    if(primary.receipt_no) return primary.receipt_no;
    return 'JO-' + (primary.order_group_id || primary.id).replace(/-/g, '').slice(0, 6).toUpperCase();
  }

  function renderOrders(orders, inventory){
    const body = document.getElementById('ordersBody');
    document.getElementById('ordersEmpty').style.display = orders.length ? 'none' : 'block';

    const groups = groupOrderRows(orders);
    orderGroupsCache = groups;

    body.innerHTML = groups.map((group, gi) => {
      const primary = group[0];
      const key = primary.id; // unique per group — first row's id
      const lines = group.map(o => Object.assign({}, o, getLineAmounts(o, inventory)));
      const totalQty = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
      const groupTotal = lines.reduce((s, l) => s + l.total, 0);
      const anyEstimated = lines.some(l => l.estimated);
      const sizesSummary = lines.map(l => `${l.size} ×${l.quantity}`).join(', ');
      const ids = group.map(o => o.id).join(',');
      const receiptNo = displayReceiptNo(primary);

      const detailRows = lines.map(l => `
        <tr>
          <td style="padding-left:26px;">${zgobEscape(l.size)}</td>
          <td>${l.quantity}</td>
          <td>₱${l.unit.toFixed(2)}</td>
          <td>₱${l.total.toFixed(2)}${l.estimated ? ' · est.' : ''}</td>
        </tr>
      `).join('');

      return `
      <tr>
        <td>
          <input type="text" class="order-receipt-no" data-ids="${ids}" value="${zgobEscape(receiptNo)}"
            style="font-family:'Space Mono',monospace; font-size:12px; width:100px; background:transparent; border:1px solid var(--line-dark); border-radius:2px; padding:5px 6px; color:inherit;">
        </td>
        <td>${zgobFormatDate(primary.created_at)}</td>
        <td>
          <div>${zgobEscape(primary.name)}</div>
          <div class="graphite-text" style="font-size:12px;">${zgobEscape(primary.email)}</div>
        </td>
        <td>
          <div>${zgobEscape(primary.garment)} · ${zgobEscape(primary.color)}</div>
          ${primary.design_text ? `<div class="graphite-text" style="font-size:12px;">"${zgobEscape(primary.design_text)}"</div>` : ''}
          ${primary.notes ? `<div class="graphite-text" style="font-size:12px;">Note: ${zgobEscape(primary.notes)}</div>` : ''}
          ${primary.artwork_url ? `<div style="font-size:12px;"><a href="${primary.artwork_url}" target="_blank" rel="noopener" style="color:var(--thread);">View artwork ↗</a></div>` : ''}
          ${primary.reference_mockup_url ? `<div style="font-size:12px;"><a href="${primary.reference_mockup_url}" target="_blank" rel="noopener" style="color:var(--thread);">View their mockup ↗</a></div>` : ''}
        </td>
        <td>
          <div>${zgobEscape(sizesSummary)}</div>
          <div class="graphite-text" style="font-size:12px;">${totalQty} total</div>
        </td>
        <td>${zgobEscape(primary.placement || '—')}</td>
        <td>
          <div>₱${groupTotal.toFixed(2)}</div>
          <div class="graphite-text" style="font-size:12px;">${lines.length} line${lines.length > 1 ? 's' : ''}${anyEstimated ? ' · est.' : ''}</div>
        </td>
        <td>
          <select class="order-status" data-ids="${ids}" style="font-family:'Space Mono',monospace; font-size:12px; background:var(--ink-2); color:var(--canvas); border:1px solid var(--line); border-radius:2px; padding:6px 8px;">
            <option value="new" ${primary.status==='new'?'selected':''}>New</option>
            <option value="progress" ${primary.status==='progress'?'selected':''}>In progress</option>
            <option value="done" ${primary.status==='done'?'selected':''}>Fulfilled</option>
            <option value="cancelled" ${primary.status==='cancelled'?'selected':''}>Cancelled</option>
          </select>
        </td>
        <td style="display:flex; flex-direction:column; gap:6px;">
          <button class="icon-btn toggle-order-details" data-key="${key}">Details</button>
          <button class="icon-btn print-order-receipt" data-key="${key}">Receipt</button>
          <button class="icon-btn delete-order" data-ids="${ids}" data-key="${key}">Delete</button>
        </td>
      </tr>
      <tr class="order-detail-row" id="order-detail-${key}" style="display:none;">
        <td colspan="9" style="background:rgba(20,18,13,0.04);">
          <div class="graphite-text" style="font-family:'Space Mono',monospace; font-size:11px; text-transform:uppercase; letter-spacing:.06em; margin:10px 0 8px 26px;">Full order breakdown</div>
          <table style="width:100%;">
            <thead>
              <tr>
                <th style="padding-left:26px;">Size</th><th>Qty</th><th>Unit price</th><th>Line total</th>
              </tr>
            </thead>
            <tbody>${detailRows}</tbody>
            <tfoot>
              <tr>
                <td style="padding-left:26px;" colspan="3"><strong>Total amount</strong></td>
                <td><strong>₱${groupTotal.toFixed(2)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </td>
      </tr>
    `;
    }).join('');

    body.querySelectorAll('.order-receipt-no').forEach(input => {
      const commit = async () => {
        const ids = input.dataset.ids.split(',');
        const value = input.value.trim();
        try{
          await Promise.all(ids.map(id => ZgobStore.setReceiptNo(id, value)));
          zgobToast('Receipt number updated.');
        }catch(err){
          zgobToast('Could not update the receipt number.');
          console.error(err);
        }
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', e => {
        if(e.key === 'Enter'){ e.preventDefault(); input.blur(); }
      });
    });
    body.querySelectorAll('.toggle-order-details').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = document.getElementById('order-detail-' + btn.dataset.key);
        const showing = row.style.display !== 'none';
        row.style.display = showing ? 'none' : 'table-row';
        btn.textContent = showing ? 'Details' : 'Hide details';
      });
    });
    body.querySelectorAll('.print-order-receipt').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = orderGroupsCache.find(g => g[0].id === btn.dataset.key);
        if(group) printJobOrderReceipt(group, inventory);
      });
    });
    body.querySelectorAll('.order-status').forEach(sel => {
      sel.addEventListener('change', async () => {
        const ids = sel.dataset.ids.split(',');
        await Promise.all(ids.map(id => ZgobStore.setOrderStatus(id, sel.value)));
        zgobToast('Order status updated.');
        renderAll();
      });
    });
    body.querySelectorAll('.delete-order').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ids = btn.dataset.ids.split(',');
        const group = orderGroupsCache.find(g => g[0].id === btn.dataset.key);
        const primary = group ? group[0] : null;
        const receiptNo = primary ? displayReceiptNo(primary) : null;
        const msg = ids.length > 1
          ? `Remove this order? It has ${ids.length} size lines — all of them will be deleted. This cannot be undone.`
          : 'Remove this order? This cannot be undone.';
        if(!confirm(msg)) return;

        // Log why this receipt number no longer has an order attached, so the gap
        // in the numbering is explained rather than just disappearing.
        const remarks = prompt(
          `Optional: why is ${receiptNo || 'this order'} being cancelled? (e.g. "Customer cancelled", "Duplicate order")\nLeave blank to skip the note.`,
          ''
        );
        if(remarks !== null && receiptNo){
          try{
            await ZgobStore.addVoidedReceipt(receiptNo, primary ? primary.name : null, remarks.trim() || null);
          }catch(err){
            console.error('Failed to log the voided receipt:', err);
          }
        }

        await Promise.all(ids.map(id => ZgobStore.deleteOrder(id)));
        renderAll();
      });
    });

    // staff can view, print, and update an order's status, but can't edit the
    // receipt number or delete an order
    if(currentUserRole !== 'admin'){
      body.querySelectorAll('.order-receipt-no').forEach(el => el.disabled = true);
      body.querySelectorAll('.delete-order').forEach(el => el.style.display = 'none');
    }
  }

  function renderCancelled(voidedReceipts){
    const body = document.getElementById('cancelledBody');
    document.getElementById('cancelledEmpty').style.display = voidedReceipts.length ? 'none' : 'block';
    body.innerHTML = voidedReceipts.map(v => `
      <tr>
        <td>${zgobEscape(v.receipt_no)}</td>
        <td>${zgobEscape(v.customer_name || '—')}</td>
        <td style="white-space:normal; max-width:320px;">${zgobEscape(v.remarks || '—')}</td>
        <td>${zgobFormatDate(v.voided_at)}</td>
        <td><button class="icon-btn delete-voided" data-id="${v.id}">Remove</button></td>
      </tr>
    `).join('');
    body.querySelectorAll('.delete-voided').forEach(btn => {
      btn.addEventListener('click', async () => {
        if(confirm('Remove this log entry? This cannot be undone.')){
          await ZgobStore.deleteVoidedReceipt(btn.dataset.id);
          renderAll();
        }
      });
    });
  }

  const cancelledPanel = document.getElementById('cancelledPanel');
  const viewCancelledBtn = document.getElementById('viewCancelledBtn');
  viewCancelledBtn.addEventListener('click', () => {
    const showing = cancelledPanel.style.display !== 'none';
    cancelledPanel.style.display = showing ? 'none' : 'block';
    viewCancelledBtn.textContent = showing ? 'Cancelled / voided receipts' : 'Hide cancelled / voided receipts';
  });

  document.getElementById('resetReceiptSeqBtn').addEventListener('click', async () => {
    const ok = confirm(
      'Reset job order numbering to JO-000001?\n\nThis is meant for testing — the next order placed on the site will get JO-000001, and so on from there. It does NOT change the receipt numbers on any orders already saved.\n\nUse this right before you publish, not after you have real customer orders.'
    );
    if(!ok) return;
    const btn = document.getElementById('resetReceiptSeqBtn');
    btn.disabled = true;
    try{
      await ZgobStore.resetReceiptSequence(1);
      zgobToast('Job order numbering reset — the next new order will be JO-000001.');
    }catch(err){
      zgobToast('Could not reset the numbering.');
      console.error(err);
    }finally{
      btn.disabled = false;
    }
  });

  // Opens a printable Job Order Receipt for one customer's order (every size line from
  // the same submission, as a single receipt). The name on the receipt is the sender /
  // customer who placed the order, not the individual size lines.
  function printJobOrderReceipt(group, inventory){
    const primary = group[0];
    const lines = group.map(o => Object.assign({}, o, getLineAmounts(o, inventory)));
    const totalQty = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
    const grandTotal = lines.reduce((s, l) => s + l.total, 0);
    const receiptNo = displayReceiptNo(primary);
    const issued = new Date();

    const rowsHtml = lines.map(l => `
      <tr>
        <td>${zgobEscape(l.size)}</td>
        <td style="text-align:center;">${l.quantity}</td>
        <td style="text-align:right;">₱${l.unit.toFixed(2)}</td>
        <td style="text-align:right;">₱${l.total.toFixed(2)}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Job Order Receipt — ${zgobEscape(receiptNo)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', 'Space Mono', monospace; color:#121212; background:#fff; max-width:480px; margin:24px auto; padding:0 16px; font-size:13px; }
  h1 { font-size:18px; margin:0 0 2px; letter-spacing:.04em; }
  .sub { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#666; margin-bottom:18px; }
  .row { display:flex; justify-content:space-between; padding:4px 0; }
  .cut { border-top:1px dashed #999; margin:14px 0; }
  table { width:100%; border-collapse:collapse; margin-top:10px; }
  th, td { padding:6px 4px; text-align:left; border-bottom:1px solid #ddd; font-size:12px; }
  th { text-transform:uppercase; font-size:10px; letter-spacing:.05em; color:#666; }
  tfoot td { border-bottom:none; border-top:2px solid #121212; font-weight:bold; padding-top:10px; }
  .label { color:#666; }
  .btn-print { display:block; width:100%; margin-top:22px; padding:10px; background:#121212; color:#fff; border:none; font-family:inherit; font-size:13px; cursor:pointer; text-transform:uppercase; letter-spacing:.06em; }
  @media print { .btn-print { display:none; } body { margin:0 auto; } }
</style>
</head>
<body>
  <h1>Zgob Apparel</h1>
  <div class="sub">Job Order Receipt</div>

  <div class="row"><span class="label">Receipt No.</span><span>${zgobEscape(receiptNo)}</span></div>
  <div class="row"><span class="label">Order date</span><span>${zgobEscape(zgobFormatDate(primary.created_at))}</span></div>
  <div class="row"><span class="label">Printed</span><span>${zgobEscape(issued.toLocaleString())}</span></div>
  <div class="row"><span class="label">Status</span><span>${zgobEscape(primary.status)}</span></div>

  <div class="cut"></div>

  <div class="row"><span class="label">Customer</span><span>${zgobEscape(primary.name)}</span></div>
  <div class="row"><span class="label">Email</span><span>${zgobEscape(primary.email)}</span></div>
  <div class="row"><span class="label">Garment</span><span>${zgobEscape(primary.garment)} · ${zgobEscape(primary.color)}</span></div>
  <div class="row"><span class="label">Placement</span><span>${zgobEscape(primary.placement || '—')}</span></div>
  ${primary.design_text ? `<div class="row"><span class="label">Design text</span><span>"${zgobEscape(primary.design_text)}"</span></div>` : ''}
  ${primary.notes ? `<div class="row" style="flex-direction:column;"><span class="label">Notes</span><span>${zgobEscape(primary.notes)}</span></div>` : ''}

  <div class="cut"></div>

  <table>
    <thead>
      <tr><th>Size</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Unit price</th><th style="text-align:right;">Line total</th></tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr><td colspan="1">Total qty</td><td style="text-align:center;">${totalQty}</td><td colspan="2" style="text-align:right;">₱${grandTotal.toFixed(2)}</td></tr>
    </tfoot>
  </table>

  <div class="cut"></div>
  <p style="font-size:11px; color:#666;">Thank you for ordering with Zgob Apparel. This receipt reflects the price at the time the order was placed.</p>

  <button class="btn-print" onclick="window.print()">Print receipt</button>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=520,height=760');
    if(!w){ zgobToast('Please allow pop-ups to print the receipt.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  /* ---------------- analytics ---------------- */

  // Revenue only counts orders that are actually being worked (in progress) or completed
  // (fulfilled) — a new order isn't confirmed revenue yet, and a cancelled one never
  // becomes revenue at all.
  function orderCountsTowardRevenue(order){
    return order.status === 'progress' || order.status === 'done';
  }

  // The order's revenue: use the price captured at order time if we have it (unit_price/
  // total_price were added after launch), otherwise fall back to estimating from the
  // garment's current inventory price — flagged so the dashboard can disclose the estimate.
  function getOrderRevenue(order, inventory){
    if(!orderCountsTowardRevenue(order)) return { amount: 0, estimated: false };
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
      { key: 'done', label: 'Fulfilled' },
      { key: 'cancelled', label: 'Cancelled' }
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

    let revenue = 0, units = 0, estimatedUsed = false, revenueOrderCount = 0;
    const statusCounts = { new: 0, progress: 0, done: 0, cancelled: 0 };
    const garmentStats = {};

    filtered.forEach(o => {
      const { amount, estimated } = getOrderRevenue(o, inventory);
      revenue += amount;
      if(estimated) estimatedUsed = true;
      if(orderCountsTowardRevenue(o)) revenueOrderCount += 1;
      units += Number(o.quantity) || 0;
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
      if(!garmentStats[o.garment]) garmentStats[o.garment] = { orders: 0, units: 0, revenue: 0 };
      garmentStats[o.garment].orders += 1;
      garmentStats[o.garment].units += Number(o.quantity) || 0;
      garmentStats[o.garment].revenue += amount;
    });

    document.getElementById('statRevenue').textContent = `₱${revenue.toFixed(2)}`;
    document.getElementById('statOrderCount').textContent = filtered.length;
    document.getElementById('statAvgOrder').textContent = `₱${(revenueOrderCount ? revenue / revenueOrderCount : 0).toFixed(2)}`;
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

    // staff can see stock and pricing, but not change them
    if(currentUserRole !== 'admin'){
      body.querySelectorAll('.price-input').forEach(el => el.disabled = true);
      body.querySelectorAll('.stock-input').forEach(el => el.disabled = true);
    }
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

    // staff can browse the design catalogue, but not edit or delete entries
    if(currentUserRole !== 'admin'){
      body.querySelectorAll('.edit-design').forEach(el => el.style.display = 'none');
      body.querySelectorAll('.delete-design').forEach(el => el.style.display = 'none');
    }
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

    // staff can read the inbox, but not mark messages read/unread or delete them
    if(currentUserRole !== 'admin'){
      body.querySelectorAll('.toggle-read').forEach(el => el.style.display = 'none');
      body.querySelectorAll('.delete-message').forEach(el => el.style.display = 'none');
    }
  }

  /* ---------------- staff (admin-only tab) ---------------- */
  function renderStaff(profiles){
    const body = document.getElementById('staffBody');
    document.getElementById('staffEmpty').style.display = profiles.length ? 'none' : 'block';

    body.innerHTML = profiles.map(p => {
      const isSelf = p.id === currentUserId;
      return `
      <tr>
        <td>${zgobEscape(p.email || '(no email on file)')}${isSelf ? ' <span class="graphite-text" style="font-size:11px;">(you)</span>' : ''}</td>
        <td>
          <select class="staff-role" data-id="${p.id}" ${isSelf ? 'disabled title="You can\'t change your own role."' : ''}
            style="font-family:'Space Mono',monospace; font-size:12px; background:var(--ink-2); color:var(--canvas); border:1px solid var(--line); border-radius:2px; padding:6px 8px;">
            <option value="staff" ${p.role==='staff'?'selected':''}>Staff — view & print only</option>
            <option value="admin" ${p.role==='admin'?'selected':''}>Admin — full access</option>
          </select>
        </td>
        <td>${zgobFormatDate(p.created_at)}</td>
        <td>${isSelf ? '' : `<button class="icon-btn delete-staff" data-id="${p.id}" data-email="${zgobEscape(p.email||'this account')}">Remove</button>`}</td>
      </tr>
    `;
    }).join('');

    body.querySelectorAll('.staff-role').forEach(sel => {
      sel.addEventListener('change', async () => {
        const prevValue = sel.value === 'admin' ? 'staff' : 'admin'; // for revert-on-failure
        try{
          await ZgobStore.setUserRole(sel.dataset.id, sel.value);
          zgobToast('Role updated.');
          renderAll();
        }catch(err){
          zgobToast('Could not update the role.');
          console.error(err);
          sel.value = prevValue;
        }
      });
    });
    body.querySelectorAll('.delete-staff').forEach(btn => {
      btn.addEventListener('click', async () => {
        if(!confirm(`Remove ${btn.dataset.email}'s account? They'll immediately lose access. This cannot be undone.`)) return;
        const result = await ZgobStore.deleteStaffAccount(btn.dataset.id);
        if(result.ok){
          zgobToast('Account removed.');
          renderAll();
        }else{
          zgobToast(result.message || 'Could not remove the account.');
        }
      });
    });
  }

  document.getElementById('staffCreateBtn').addEventListener('click', async () => {
    const btn = document.getElementById('staffCreateBtn');
    const errorEl = document.getElementById('staffCreateError');
    const emailInput = document.getElementById('staffEmail');
    const passwordInput = document.getElementById('staffPassword');
    const roleSelect = document.getElementById('staffRole');
    errorEl.style.display = 'none';

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const role = roleSelect.value;
    if(!email || !password){
      errorEl.textContent = 'Email and a temporary password are both required.';
      errorEl.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating…';
    try{
      const result = await ZgobStore.createStaffAccount(email, password, role);
      if(result.ok){
        zgobToast(`Account created for ${email}.`);
        emailInput.value = ''; passwordInput.value = ''; roleSelect.value = 'staff';
        renderAll();
      }else{
        errorEl.textContent = result.message || 'Could not create the account.';
        errorEl.style.display = 'block';
      }
    }catch(err){
      errorEl.textContent = 'Could not create the account.';
      errorEl.style.display = 'block';
      console.error(err);
    }finally{
      btn.disabled = false;
      btn.textContent = 'Create account →';
    }
  });
});