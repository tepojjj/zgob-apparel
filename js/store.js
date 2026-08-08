/* =========================================================
   ZGOB APPAREL — data + auth layer (Supabase)
   Every page loads: supabase-js CDN -> config.js -> store.js
   All calls are async and return { data, error } is unwrapped
   into plain values/throws, so page code can just await them.
   ========================================================= */

const ZgobStore = (() => {
  const client = window.supabase.createClient(ZGOB_SUPABASE_URL, ZGOB_SUPABASE_ANON_KEY);

  function orThrow(result){
    if(result.error) throw result.error;
    return result.data;
  }

  return {
    client, // exposed for edge cases (e.g. auth state listeners)

    /* ---------------- designs (read on the public site, write in admin) ---------------- */
    async getDesigns(){
      return orThrow(await client.from('designs').select('*').order('title'));
    },
    /** Upload a real garment photo to the public artwork bucket, return its URL. Same bucket/shape as uploadArtwork. */
    async uploadDesignPhoto(fileOrBlob){
      const name = (fileOrBlob.name || 'design.jpg').replace(/\s+/g, '_');
      const path = `designs/${Date.now()}_${name}`;
      const upload = await client.storage.from('artwork').upload(path, fileOrBlob);
      if(upload.error) throw upload.error;
      return client.storage.from('artwork').getPublicUrl(path).data.publicUrl;
    },
    async addDesign(design){
      // design: { id, title, category, colorway, price, tags, swatch, imageUrl, artworkUrl }
      const row = {
        id: design.id,
        title: design.title,
        category: design.category,
        colorway: design.colorway,
        price: design.price,
        tags: design.tags || [],
        swatch: design.swatch || [],
        image_url: design.imageUrl || null,
        artwork_url: design.artworkUrl || null
      };
      return orThrow(await client.from('designs').insert(row).select().single());
    },
    async updateDesign(id, design){
      const row = {
        title: design.title,
        category: design.category,
        colorway: design.colorway,
        price: design.price,
        tags: design.tags || [],
        swatch: design.swatch || [],
        image_url: design.imageUrl || null,
        artwork_url: design.artworkUrl || null
      };
      return orThrow(await client.from('designs').update(row).eq('id', id).select().single());
    },
    async deleteDesign(id){
      orThrow(await client.from('designs').delete().eq('id', id));
    },

    /* ---------------- inventory ---------------- */
    async getInventory(){
      return orThrow(await client.from('inventory').select('*').order('name'));
    },
    async updateStock(garmentId, size, newCount){
      const inv = await this.getInventory();
      const item = inv.find(i => i.id === garmentId);
      if(!item) return;
      const sizes = Object.assign({}, item.sizes, { [size]: Math.max(0, Number(newCount) || 0) });
      orThrow(await client.from('inventory').update({ sizes }).eq('id', garmentId));
    },

    /* ---------------- orders ---------------- */
    async getOrders(){
      return orThrow(await client.from('orders').select('*').order('created_at', { ascending:false }));
    },
    /** Upload a File (or a canvas-rendered Blob) to the public artwork bucket, return its URL. */
    async uploadArtwork(fileOrBlob, filenameHint){
      const name = (filenameHint || fileOrBlob.name || 'artwork.png').replace(/\s+/g, '_');
      const path = `${Date.now()}_${name}`;
      const upload = await client.storage.from('artwork').upload(path, fileOrBlob);
      if(upload.error) throw upload.error;
      return client.storage.from('artwork').getPublicUrl(path).data.publicUrl;
    },
    async addOrder(order){
      // order: { name, email, garment, color, size, quantity, placement, designText, artworkUrl, notes }
      const row = {
        name: order.name,
        email: order.email,
        garment: order.garment,
        color: order.color,
        size: order.size,
        quantity: order.quantity,
        placement: order.placement,
        design_text: order.designText || null,
        artwork_url: order.artworkUrl || null,
        notes: order.notes || null
      };
      return orThrow(await client.from('orders').insert(row).select().single());
    },
    async setOrderStatus(id, status){
      orThrow(await client.from('orders').update({ status }).eq('id', id));
    },
    async deleteOrder(id){
      orThrow(await client.from('orders').delete().eq('id', id));
    },

    /* ---------------- messages ---------------- */
    async getMessages(){
      return orThrow(await client.from('messages').select('*').order('created_at', { ascending:false }));
    },
    async addMessage(msg){
      return orThrow(await client.from('messages').insert({
        name: msg.name, email: msg.email, subject: msg.subject, message: msg.message
      }).select().single());
    },
    async markMessageRead(id, isRead){
      orThrow(await client.from('messages').update({ read: isRead }).eq('id', id));
    },
    async deleteMessage(id){
      orThrow(await client.from('messages').delete().eq('id', id));
    },

    /* ---------------- admin auth (real Supabase Auth) ---------------- */
    async login(email, password){
      const { error } = await client.auth.signInWithPassword({ email, password });
      if(error) return { ok:false, message: error.message };
      return { ok:true };
    },
    async logout(){
      await client.auth.signOut();
    },
    async isLoggedIn(){
      const { data } = await client.auth.getSession();
      return !!data.session;
    }
  };
})();
