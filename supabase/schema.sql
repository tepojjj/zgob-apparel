-- =========================================================
-- ZGOB APPAREL — Supabase schema
-- Run this whole file once in: Supabase Dashboard → SQL Editor → New query → Run
-- =========================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------

create table if not exists public.designs (
  id          text primary key,
  title       text not null,
  category    text not null,
  colorway    text not null,
  price       numeric not null default 0,  -- snapshot of the last computed price; kept for designs with no linked garment
  garment_id  text,  -- optional link to the blank garment this design is printed on (FK to inventory added below, once that table exists); when set, price = that garment's live inventory price + markup
  markup      numeric not null default 0,  -- print/labour cost added on top of the linked garment's inventory price
  tags        text[] not null default '{}',
  swatch      text[] not null default '{}',
  image_url    text,  -- real photo of the finished garment/design, shown on the Designs page in place of the SVG sketch
  artwork_url  text,  -- the actual print-ready file (transparent PNG/SVG); applied to Customize when a shopper clicks "Use this design"
  created_at  timestamptz not null default now()
);

-- migration for projects that ran an earlier version of this schema before these columns existed:
alter table public.designs add column if not exists image_url text;
alter table public.designs add column if not exists artwork_url text;
alter table public.designs add column if not exists garment_id text;
alter table public.designs add column if not exists markup numeric not null default 0;

create table if not exists public.inventory (
  id          text primary key,
  name        text not null,
  category    text not null,
  price       numeric not null default 0,
  sizes       jsonb not null default '{}',  -- e.g. {"S":42,"M":65,"L":58,"XL":21,"XXL":6}
  created_at  timestamptz not null default now()
);

-- now that inventory exists, link designs.garment_id -> inventory.id
-- (deferred to here because designs is created before inventory above)
do $$ begin
  alter table public.designs
    add constraint designs_garment_id_fkey
    foreign key (garment_id) references public.inventory(id) on delete set null;
exception when duplicate_object then null;
end $$;
create index if not exists designs_garment_id_idx on public.designs(garment_id);

create table if not exists public.orders (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        text not null,
  garment      text not null,
  color        text not null,
  size         text not null,
  quantity     int not null default 1,
  placement    text,
  design_text  text,
  artwork_url  text,
  reference_mockup_url text,  -- a finished mockup/reference image the customer already had and uploaded as-is
  notes        text,
  status       text not null default 'new' check (status in ('new','progress','done')),
  unit_price   numeric,  -- price per item at the moment the order was placed (nullable: orders placed before this column existed won't have it)
  total_price  numeric,  -- unit_price * quantity, captured at order time so later price/inventory edits don't rewrite past sales history
  order_group_id uuid,   -- shared by every size line submitted together on one order form, so the admin panel can show them as a single job order (nullable: rows placed before this column existed won't have it)
  receipt_no   text,     -- sequential job-order/receipt number (e.g. "JO-000123"), assigned once per submission via next_receipt_no() below and shared by every size line in that submission; editable by admins afterwards
  created_at   timestamptz not null default now()
);

-- migration for projects that ran an earlier version of this schema before this column existed:
alter table public.orders add column if not exists reference_mockup_url text;
alter table public.orders add column if not exists unit_price numeric;
alter table public.orders add column if not exists total_price numeric;
alter table public.orders add column if not exists order_group_id uuid;
alter table public.orders add column if not exists receipt_no text;

-- Sequential job-order / receipt numbers. next_receipt_no() is called once per order
-- submission (not once per size line) so every line in the same job order shares one
-- number. It's security definer so the public "anon" role can call it (to number new
-- orders as they come in) without being granted direct access to the sequence — and
-- admins can still freely edit/blank out the stored receipt_no per order afterwards,
-- e.g. after a cancellation, without that affecting the sequence itself.
create sequence if not exists public.orders_receipt_seq start with 1;

create or replace function public.next_receipt_no()
returns text
language sql
security definer
set search_path = public
as $$
  select 'JO-' || lpad(nextval('public.orders_receipt_seq')::text, 6, '0');
$$;

grant execute on function public.next_receipt_no() to anon, authenticated;

-- Lets an admin restart numbering (e.g. resetting to JO-000001 before going live after
-- testing) without touching any orders already saved. Restricted to admins specifically
-- (not just any signed-in user) — this raises an error for staff even if someone calls
-- it directly, not just when the button is hidden from them in the UI.
create or replace function public.reset_receipt_seq(start_at integer default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can reset job order numbering';
  end if;
  perform setval('public.orders_receipt_seq', start_at, false);
end;
$$;

revoke all on function public.reset_receipt_seq(integer) from public;
grant execute on function public.reset_receipt_seq(integer) to authenticated;

-- A lightweight log of cancelled/voided job orders, so a gap in the receipt numbering
-- (e.g. JO-000002 missing) has a visible reason attached instead of just vanishing.
-- Written right before the corresponding order rows are deleted.
create table if not exists public.voided_receipts (
  id            uuid primary key default gen_random_uuid(),
  receipt_no    text not null,
  customer_name text,
  remarks       text,
  voided_at     timestamptz not null default now()
);

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  subject     text not null,
  message     text not null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.garment_photos (
  id          uuid primary key default gen_random_uuid(),
  garment     text not null,  -- matches an inventory item's display name, e.g. "Heavyweight Hoodie"
  color       text not null default 'White',  -- always "White" — every reference photo is a plain white garment
  image_url   text not null,  -- real reference photo of the blank garment
  quad        jsonb,          -- [[x,y],[x,y],[x,y],[x,y]] print-area corners (TL,TR,BR,BL) in the photo's own pixel space — auto-computed, no manual calibration needed
  extra_price numeric not null default 0,  -- if set (>0), this IS the total price a customer pays for this specific look; it replaces the garment's base price rather than adding to it. 0 = just use the garment's base inventory price.
  created_at  timestamptz not null default now()
);

-- migrations for projects that ran an earlier version of this schema:
alter table public.garment_photos add column if not exists quad jsonb;
alter table public.garment_photos add column if not exists extra_price numeric not null default 0;
-- multiple reference photos per garment are now allowed (was previously one per garment+colour):
alter table public.garment_photos drop constraint if exists garment_photos_garment_color_key;

-- ---------------------------------------------------------
-- STAFF ROLES
-- Every signed-in admin-panel user is either 'admin' (full access) or
-- 'staff' (view + print only — no editing, no deleting, no access to
-- Analytics, Cancelled/voided receipts, or the job-order reset button).
-- New signups default to 'staff' (fail-closed) — promote someone to
-- admin manually, see the UPDATE statement below.
-- ---------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  role        text not null default 'staff' check (role in ('admin','staff')),
  created_at  timestamptz not null default now()
);

-- auto-creates a 'staff' profile row the moment someone signs up, so role checks
-- never fail open for a user who has no row yet
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'staff')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- security-definer so it can be called from any RLS policy without those policies
-- needing their own read access into profiles
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;

drop policy if exists "users can view own profile, admins view all" on public.profiles;
create policy "users can view own profile, admins view all"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- ONE-TIME SETUP: after you (the shop owner) sign in to the admin panel for the
-- first time, promote your own account to admin by running this once, with your
-- real email:
--   update public.profiles set role = 'admin' where email = 'you@example.com';
-- Every other signup (staff you create in Supabase → Authentication → Users)
-- stays 'staff' automatically and can be promoted the same way if needed.

-- ---------------------------------------------------------
-- ROW LEVEL SECURITY
-- Public site visitors use the anon key. The admin panel signs
-- in with Supabase Auth (email + password), which upgrades the
-- request to the "authenticated" role. From there, is_admin()
-- (above) gates anything staff shouldn't be able to do.
-- ---------------------------------------------------------

alter table public.designs   enable row level security;
alter table public.inventory enable row level security;
alter table public.orders    enable row level security;
alter table public.messages  enable row level security;
alter table public.garment_photos enable row level security;
alter table public.voided_receipts enable row level security;

-- designs: everyone can browse, only admins manage the catalogue
drop policy if exists "designs are publicly readable" on public.designs;
create policy "designs are publicly readable"
  on public.designs for select
  using (true);

drop policy if exists "admins manage designs" on public.designs;
create policy "admins manage designs"
  on public.designs for all
  using (public.is_admin())
  with check (public.is_admin());

-- inventory: everyone can see stock/price, only admins edit it
drop policy if exists "inventory is publicly readable" on public.inventory;
create policy "inventory is publicly readable"
  on public.inventory for select
  using (true);

drop policy if exists "admins manage inventory" on public.inventory;
create policy "admins manage inventory"
  on public.inventory for all
  using (public.is_admin())
  with check (public.is_admin());

-- orders: anyone can submit a custom order, only admins can view/manage the queue
drop policy if exists "anyone can submit an order" on public.orders;
create policy "anyone can submit an order"
  on public.orders for insert
  with check (true);

drop policy if exists "admins manage orders" on public.orders;
create policy "admins manage orders"
  on public.orders for select using (auth.role() = 'authenticated');

drop policy if exists "admins update orders" on public.orders;
create policy "admins update orders"
  on public.orders for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins delete orders" on public.orders;
create policy "admins delete orders"
  on public.orders for delete
  using (public.is_admin());

-- messages: anyone can send one, only admins can read/manage the inbox
drop policy if exists "anyone can send a message" on public.messages;
create policy "anyone can send a message"
  on public.messages for insert
  with check (true);

drop policy if exists "admins manage messages" on public.messages;
create policy "admins manage messages"
  on public.messages for select using (auth.role() = 'authenticated');

drop policy if exists "admins update messages" on public.messages;
create policy "admins update messages"
  on public.messages for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins delete messages" on public.messages;
create policy "admins delete messages"
  on public.messages for delete
  using (public.is_admin());

-- garment_photos: everyone can see the real reference photos, only admins manage them
drop policy if exists "garment photos are publicly readable" on public.garment_photos;
create policy "garment photos are publicly readable"
  on public.garment_photos for select
  using (true);

drop policy if exists "admins manage garment photos" on public.garment_photos;
create policy "admins manage garment photos"
  on public.garment_photos for all
  using (public.is_admin())
  with check (public.is_admin());

-- voided_receipts: fully admin-only, including viewing it — this is a confidential internal
-- log, not something staff should see at all, unlike orders/messages which staff can view
drop policy if exists "admins manage voided receipts" on public.voided_receipts;
create policy "admins manage voided receipts"
  on public.voided_receipts for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------
-- STORAGE — bucket for uploaded artwork files
-- ---------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('artwork', 'artwork', true)
on conflict (id) do nothing;

drop policy if exists "anyone can upload artwork" on storage.objects;
create policy "anyone can upload artwork"
  on storage.objects for insert
  with check (bucket_id = 'artwork');

drop policy if exists "artwork is publicly viewable" on storage.objects;
create policy "artwork is publicly viewable"
  on storage.objects for select
  using (bucket_id = 'artwork');

drop policy if exists "admins delete artwork" on storage.objects;
create policy "admins delete artwork"
  on storage.objects for delete
  using (bucket_id = 'artwork' and public.is_admin());

-- ---------------------------------------------------------
-- SEED DATA — house designs and starting inventory
-- Safe to re-run: it upserts on the text primary keys.
-- ---------------------------------------------------------

insert into public.designs (id, title, category, colorway, price, tags, swatch) values
  ('dsg_01','Static Bloom','Graphic','Thread on Canvas',32,'{"best seller"}','{"#d6432a","#14120d","#ede6d6"}'),
  ('dsg_02','Cut Line No.7','Minimal','Ink on Chalk',28,'{}','{"#14120d","#f7f3e8"}'),
  ('dsg_03','Registration Marks','Typography','Denim on Canvas',30,'{"new"}','{"#3e5c74","#ede6d6"}'),
  ('dsg_04','Selvage','Streetwear','Mustard on Ink',34,'{}','{"#d4a017","#14120d"}'),
  ('dsg_05','Proof Sheet','Graphic','Multi on Chalk',36,'{"best seller"}','{"#d6432a","#3e5c74","#d4a017"}'),
  ('dsg_06','Loose Thread','Minimal','Canvas on Ink',28,'{}','{"#ede6d6","#14120d"}'),
  ('dsg_07','Overlock','Typography','Ink on Mustard',30,'{"new"}','{"#14120d","#d4a017"}'),
  ('dsg_08','Deadstock','Streetwear','Thread on Chalk',34,'{}','{"#d6432a","#f7f3e8"}')
on conflict (id) do update set
  title = excluded.title, category = excluded.category, colorway = excluded.colorway,
  price = excluded.price, tags = excluded.tags, swatch = excluded.swatch;

insert into public.inventory (id, name, category, price, sizes) values
  ('inv_01','Classic Tee','Tee',24,'{"S":42,"M":65,"L":58,"XL":21,"XXL":6}'),
  ('inv_02','Heavyweight Hoodie','Hoodie',58,'{"S":12,"M":34,"L":30,"XL":15,"XXL":4}'),
  ('inv_03','Long Sleeve Tee','Long Sleeve',30,'{"S":20,"M":28,"L":22,"XL":9,"XXL":0}'),
  ('inv_04','Crewneck Sweatshirt','Crewneck',46,'{"S":18,"M":26,"L":24,"XL":11,"XXL":5}'),
  ('inv_05','Cropped Tee','Tee',26,'{"S":15,"M":19,"L":8,"XL":2,"XXL":0}'),
  ('inv_06','Tank Top','Tank',22,'{"S":24,"M":30,"L":20,"XL":7,"XXL":0}')
on conflict (id) do update set
  name = excluded.name, category = excluded.category, price = excluded.price, sizes = excluded.sizes;
