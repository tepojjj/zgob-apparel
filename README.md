# Zgob Apparel — Supabase + Vercel setup

This site is a static frontend (plain HTML/CSS/JS, no build step) backed by
Supabase for the database, file storage, and admin authentication. Deploying
takes about 10 minutes.

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

## What's wired up

| Feature | Where |
|---|---|
| Browse designs / inventory | Public read via RLS, no login needed |
| Submit a custom order (Customize page) | Public insert; optional artwork upload goes to the `artwork` storage bucket |
| Photo-realistic mockup preview | `api/mockup-create.js` + `api/mockup-status.js` (Vercel) proxy Printful's Mockup Generator API |
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
