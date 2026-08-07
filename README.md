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

Either way, no environment variables are required on Vercel — the Supabase URL/key live in `js/config.js` since they're safe to ship to the browser.

## What's wired up

| Feature | Where |
|---|---|
| Browse designs / inventory | Public read via RLS, no login needed |
| Submit a custom order (Customize page) | Public insert; optional artwork upload goes to the `artwork` storage bucket |
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
