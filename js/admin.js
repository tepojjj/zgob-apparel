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
    const [orders, inventory, messages] = await Promise.all([
      ZgobStore.getOrders(), ZgobStore.getInventory(), ZgobStore.getMessages()
    ]);
    renderStats(orders, inventory, messages);
    renderOrders(orders);
    renderInventory(inventory);
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
