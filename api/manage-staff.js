/* =========================================================
   ZGOB APPAREL — Staff account management
   Creates and deletes Supabase Auth accounts for the admin panel's
   Staff tab. This has to run server-side: creating/deleting an
   arbitrary login account requires the Supabase *service_role* key,
   which must never be shipped to the browser (unlike the anon key,
   it bypasses Row Level Security entirely).

   Setup: add SUPABASE_SERVICE_ROLE_KEY as an environment variable in
   your Vercel project settings (Project Settings → Environment
   Variables) — copy it from Supabase Dashboard → Project Settings →
   API → service_role secret. Never commit it, never put it in
   js/config.js, never send it to the client.
   ========================================================= */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://swedzkrubhgvtzvmhyyn.supabase.co';

function adminClient(){
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

// Verifies the request actually comes from a signed-in admin, not just anyone who
// found this URL. The client sends its own Supabase session token; we ask Supabase
// who that token belongs to, then check that user's role in public.profiles.
async function requireAdmin(req, supabase){
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if(!token) return null;
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if(userErr || !userData || !userData.user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userData.user.id).single();
  if(!profile || profile.role !== 'admin') return null;
  return userData.user;
}

export default async function handler(req, res){
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY){
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server. Add it in your Vercel project settings.' });
  }
  const supabase = adminClient();
  const caller = await requireAdmin(req, supabase);
  if(!caller) return res.status(403).json({ error: 'Admins only.' });

  if(req.method === 'POST'){
    const { email, password, role } = req.body || {};
    if(!email || !password) return res.status(400).json({ error: 'Missing email or password.' });
    if(String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const desiredRole = role === 'admin' ? 'admin' : 'staff';

    try{
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email, password, email_confirm: true
      });
      if(createErr) return res.status(400).json({ error: createErr.message });

      // the on_auth_user_created trigger already inserted a 'staff' profile row for them —
      // bump it to admin here if that's what was asked for
      if(desiredRole === 'admin'){
        const { error: roleErr } = await supabase.from('profiles').update({ role: 'admin' }).eq('id', created.user.id);
        if(roleErr) return res.status(500).json({ error: `Account created, but setting the admin role failed: ${roleErr.message}` });
      }
      return res.status(200).json({ ok: true, id: created.user.id });
    }catch(err){
      return res.status(500).json({ error: err.message });
    }
  }

  if(req.method === 'DELETE'){
    const { userId } = req.body || {};
    if(!userId) return res.status(400).json({ error: 'Missing userId.' });
    if(userId === caller.id) return res.status(400).json({ error: "You can't remove your own account." });

    try{
      const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
      if(delErr) return res.status(400).json({ error: delErr.message });
      return res.status(200).json({ ok: true });
    }catch(err){
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
