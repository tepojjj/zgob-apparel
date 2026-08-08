# Zgob Apparel — Supabase + Vercel setup

This site is a static frontend (plain HTML/CSS/JS, no build step) backed by
Supabase for the database, file storage, and admin authentication. Deploying
takes about 10 minutes.

> **Already have this deployed?** This version adds a `quad` column to
> `garment_photos` and a `reference_mockup_url` column to `orders`. Re-run
> the full `supabase/schema.sql` in your Supabase SQL Editor — every
> statement in it is safe to run again (it uses `if not exists` / `upsert`
> throughout), so this won't touch your existing data.

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

Either way, no environment variables are required on Vercel for the Supabase side — the Supabase URL/key live in `js/config.js` since they're safe to ship to the browser. The Printful mockup feature below does need Vercel-side environment variables.

## 5. Photo-realistic previews (Printful Mockup Generator)

The Customize page's "Generate photo-realistic preview" button renders the
customer's design onto a real product photo using Printful's Mockup
Generator API. This runs through two Vercel serverless functions
(`api/mockup-create.js`, `api/mockup-status.js`) so your Printful API key
never reaches the browser.

1. **Get a Printful API key.** In [Printful's Developer Portal](https://developers.printful.com), create a private token (Account (all stores), or scoped to one store).
2. **Set Vercel environment variables** (Project Settings → Environment Variables):
   - `PRINTFUL_API_KEY` — the token from step 1.
   - `PRINTFUL_STORE_ID` — optional, only needed if your token has access to multiple stores.
3. **Map your garments to Printful catalog products.** Open `server/printful.js` and fill in `PRINTFUL_PRODUCTS`:
   ```js
   export const PRINTFUL_PRODUCTS = {
     'Classic Tee': 71, // Bella+Canvas 3001 — a real, verified Printful catalog id
     'Heavyweight Hoodie': null, // TODO — set to a real catalog product id
     ...
   };
   ```
   Only `'Classic Tee': 71` is a confirmed real id (Printful's Bella+Canvas 3001 tee) — treat it as a working example, not a guarantee it matches what you want. For every other garment, find the product you want in Printful's catalog (printful.com/custom-products, or `GET https://api.printful.com/products`) and copy its numeric id in. Anything left as `null` will show a clear "no product mapped" error instead of failing silently.
4. **Redeploy.** That's it — no other code changes needed for the basic front/back placements.

**How it works end to end:** when the customer clicks the button, the browser uploads their design (or, for text-only designs, a canvas-rendered PNG of the text) to the same Supabase `artwork` bucket used for orders, then calls `POST /api/mockup-create` with the garment/colour/size + that image URL. The function looks up the matching Printful variant, starts an async mockup task, and returns a `task_key`. The browser then polls `GET /api/mockup-status` every ~1.5s until Printful reports `completed`, and swaps in the returned photo.

**Things worth knowing:**
- Mockup generation typically takes 5–30 seconds — the button shows status text while it waits, and times out gracefully after ~30s.
- Only `"front"`/`"back"` placements are mapped by default (see `PLACEMENT_MAP` in `server/printful.js`). "Left chest" and "Sleeve" currently fall back to `"front"` since valid placement keys are product-specific — confirm the exact keys for your chosen product via `GET /mockup-generator/printfiles/{product_id}` and update the map once you know them.
- This calls Printful's free Mockup Generator API directly — no Printful order or charge happens from generating a preview.
- If `PRINTFUL_API_KEY` isn't set, the button will show a clear error rather than hang.

## 6. Real product-photo compositing (no external API)

As an alternative to Printful — or in addition to it — the Customize page can composite designs onto **your own real garment photos**, entirely client-side. No API key, no network round trip, no per-garment catalog mapping required. This is the preferred path whenever it's available: Customize checks for a calibrated photo first and only falls back to Printful if one isn't set up yet.

**How it works:** `js/compositor.js` splits the print area into two triangles and solves an affine transform for each (the standard trick for warping a flat image onto an arbitrary quadrilateral in a `<canvas>`, since Canvas 2D has no native 4-point perspective transform). It then re-draws the original photo on top with an `overlay` blend, clipped to that same area — this reapplies the fabric's own folds and shading so the design looks printed on, not pasted on.

**Setup:**
1. Get one clean, front-facing, well-lit blank-garment photo per garment/colour you want this to work for. You need to supply or license these — I can't generate or provide stock photography.
2. Open `/calibrate.html` (linked from the admin dashboard). Pick the garment + colour, upload the photo, then **click the four corners of the print area directly on the photo**, in order: top-left → top-right → bottom-right → bottom-left. Each click plots a numbered point and the tool draws the outline live as you go, so you can see exactly what you're calibrating.
3. Use **Preview with test design** to composite a quick test pattern onto your four points before committing — if it looks skewed, click **Reset points** and try again.
4. Click **Save reference photo**. That's it — no config file to edit, no redeploy needed. The photo and its four corners are stored in Supabase (`garment_photos` table) and Customize picks it up automatically the next time that garment/colour is selected.
5. To fix a photo you calibrated before, click **Calibrate** on its card in the saved-photos grid — it reloads the same photo so you can re-plot the corners and re-save.

Once a garment/colour combo is calibrated this way, Customize prefers it automatically over Printful — it's instant, with no "pending" wait. Anything not yet calibrated falls back to Printful (if that garment has a catalog product mapped) or shows a quiet "not available yet" note otherwise, without blocking the sketch preview.

## 7. Customers uploading their own design or mockup

Customize supports two different things a shopper might hand you, and they're intentionally kept separate:

- **"Upload artwork"** — a print-ready file (logo, graphic, text) meant to go *onto* the garment. This feeds the sketch preview, the photo-realistic compositor/Printful preview, and gets attached to the order as the file to print.
- **"Already have your own mockup or reference image?"** — for a shopper who's already put together their own mockup elsewhere (their own composite, a reference photo, whatever) and just wants to show you what they're picturing. Uploading here replaces our own preview entirely with their image, skips mockup generation, and attaches their file to the order as reference — it's not treated as print-ready artwork.

Both end up as URLs on the order (`artwork_url` and `reference_mockup_url`) that show up as links in the admin orders table.




| Feature | Where |
|---|---|
| Browse designs / inventory | Public read via RLS, no login needed |
| Submit a custom order (Customize page) | Public insert; optional artwork upload goes to the `artwork` storage bucket |
| Photo-realistic mockup preview | `js/compositor.js` (real-photo warp+shade, preferred) with `api/mockup-create.js`/`api/mockup-status.js` (Printful) as fallback |
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
