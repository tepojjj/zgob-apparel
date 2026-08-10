# Zgob Apparel — Supabase + Vercel setup

This site is a static frontend (plain HTML/CSS/JS, no build step) backed by
Supabase for the database, file storage, and admin authentication. Deploying
takes about 10 minutes.

> **Already have this deployed?** This version removes the Printful mockup
> integration (client-side real-photo compositing is now the only mockup
> path) and adds three garment categories — Basketball Jersey, Volleyball
> Jersey, Polo Shirt. Re-run the full `supabase/schema.sql` in your Supabase
> SQL Editor to add those three to your `inventory` table — every statement
> in it is safe to run again (it uses `if not exists` / `upsert` throughout),
> so this won't touch your existing data. You can also delete any
> `PRINTFUL_API_KEY` / `PRINTFUL_STORE_ID` environment variables from your
> Vercel project — they're no longer used.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick any name/region and a database password (you won't need the password day-to-day — Supabase Auth handles admin login separately).
2. Once it's ready, open **SQL Editor → New query**, paste in the entire contents of `supabase/schema.sql`, and click **Run**.
   This creates the `designs`, `inventory`, `orders`, and `messages` tables, locks them down with Row Level Security, creates the public `artwork` storage bucket, and seeds the starting designs/inventory.
3. Open **Project Settings → API**. Copy the **Project URL** and the **anon public** key.

## 2. Create your admin login

1. Go to **Authentication → Users → Add user**.
2. Enter the email and password you want to sign in with on the `/admin` page. Confirm the email automatically (toggle **Auto Confirm User** if shown) so you can sign in right away.
3. You can add more admin users the same way later — anyone who can sign in gets full access to orders, inventory, and messages.

## 3. Connect the frontend to your project

Open `js/config.js` and replace the placeholders:

```js
const ZGOB_SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const ZGOB_SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
```

The anon key is meant to be public in frontend code — it only allows what the Row Level Security policies in `schema.sql` permit (public read on designs/inventory, public insert on orders/messages, everything else requires an authenticated admin session).

## 4. Deploy to Vercel

**Option A — Vercel dashboard**
1. Push this folder to a GitHub repo.
2. In Vercel, **Add New → Project**, import the repo.
3. Framework preset: **Other** (it's a static site, no build command needed).
4. Deploy.

**Option B — Vercel CLI**
```bash
npm i -g vercel
cd zgob-apparel
vercel --prod
```

Either way, no environment variables are required on Vercel — the Supabase URL/key live in `js/config.js` since they're safe to ship to the browser. The photo-realistic preview (below) is entirely client-side too, no server or API key involved.

## 5. Real product-photo compositing (no external API)

The Customize page's "Generate photo-realistic preview" renders the customer's
design onto a **real garment photo** you supply, entirely client-side. No API
key, no network round trip, no third-party mockup service, no per-garment
catalog mapping. This is the only mockup path — a garment/colour without a
calibrated photo simply shows a plain "reference photo needed" placeholder
instead of a preview, rather than a fake or illustrated one.

**How it works:** `js/compositor.js` splits the print area into two triangles
and solves an affine transform for each (the standard trick for warping a
flat image onto an arbitrary quadrilateral in a `<canvas>`, since Canvas 2D
has no native 4-point perspective transform). It then re-draws the original
photo on top with an `overlay` blend, clipped to that same area — this
reapplies the fabric's own folds and shading so the design looks printed on,
not pasted on.

**Setup:**
1. Get one clean, front-facing, well-lit photo per garment/colour you want
   this to work for — **shoot the blank garment against a plain white
   background.** You need to supply or license these; I can't generate or
   provide stock photography.
2. Open `/calibrate.html` (linked from the admin dashboard). Pick the garment
   + colour, upload the photo, then **click the four corners of the print
   area directly on the photo**, in order: top-left → top-right →
   bottom-right → bottom-left. Each click plots a numbered point and the tool
   draws the outline live as you go, so you can see exactly what you're
   calibrating.
3. Use **Preview with test design** to composite a quick test pattern onto
   your four points before committing — if it looks skewed, click **Reset
   points** and try again.
4. Click **Save reference photo**. That's it — no config file to edit, no
   redeploy needed. The photo and its four corners are stored in Supabase
   (`garment_photos` table) and Customize picks it up automatically the next
   time that garment/colour is selected.
5. To fix a photo you calibrated before, click **Calibrate** on its card in
   the saved-photos grid — it reloads the same photo so you can re-plot the
   corners and re-save.

The garment dropdown on `/calibrate.html` now includes **Basketball Jersey**,
**Volleyball Jersey**, and **Polo Shirt** in addition to the original six —
those three also need a row added to the `inventory` table before they'll
show up as pickable garments on Customize (see the note at the top of this
file about re-running `schema.sql`).

Until a garment/colour combo is calibrated, Customize shows a plain "no
reference photo yet" placeholder instead of a preview — it's not blocking,
shoppers can still fill in the rest of the form and submit, but they won't
see a mockup until you've added the photo.

## 6. Customers uploading their own design or mockup

Customize supports two different things a shopper might hand you, and they're intentionally kept separate:

- **"Upload artwork"** — a print-ready file (logo, graphic, text) meant to go *onto* the garment. This feeds the photo-realistic compositor preview, and gets attached to the order as the file to print.
- **"Already have your own mockup or reference image?"** — for a shopper who's already put together their own mockup elsewhere (their own composite, a reference photo, whatever) and just wants to show you what they're picturing. Uploading here replaces our own preview entirely with their image, skips mockup generation, and attaches their file to the order as reference — it's not treated as print-ready artwork.

Both end up as URLs on the order (`artwork_url` and `reference_mockup_url`) that show up as links in the admin orders table.




| Feature | Where |
|---|---|
| Browse designs / inventory | Public read via RLS, no login needed |
| Submit a custom order (Customize page) | Public insert; optional artwork upload goes to the `artwork` storage bucket |
| Photo-realistic mockup preview | `js/compositor.js` (real-photo warp+shade) — no preview shown until a garment/colour is calibrated |
| Customer's own already-made mockup | Separate upload field on Customize — bypasses our preview, attaches as `reference_mockup_url` on the order |
| Calibrating a garment photo | `/calibrate.html` — click 4 corners, save directly (stored in Supabase, no config file to edit) |
| Send a message (Contact page) | Public insert |
| Admin panel (`/admin`) | Real Supabase Auth sign-in; view/update/delete orders, edit stock, manage messages |

## Local preview without Supabase

You can still open the pages directly, but every data call will fail until
`js/config.js` has real values — the pages show a friendly inline error in
that case rather than breaking silently.

## Extending it later

- **More admin users:** add them in Authentication → Users.
- **Editing the design catalogue:** for now, do it via the Supabase Table Editor (`designs` table) or add an "Add design" tab to the admin panel — the `designs` table already has an "admins manage" RLS policy ready for it.
- **Order emails:** Supabase has a [Database Webhooks](https://supabase.com/docs/guides/database/webhooks) feature — you can trigger a Vercel serverless function or an email service (e.g. Resend) whenever a row is inserted into `orders` or `messages`.
