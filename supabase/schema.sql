-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Categories
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null,
  type text not null check (type in ('income', 'expense', 'investment')),
  parent_id uuid references public.categories on delete cascade,
  is_fixed boolean not null default false,
  sort_order integer,
  created_at timestamptz not null default now()
);

-- Accounts
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null,
  type text not null check (type in ('cash', 'debit', 'credit', 'paypal', 'bank', 'other')),
  emoji text,
  currency text not null check (currency in ('EUR', 'USD')),
  opening_balance numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- Transactions
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  account_id uuid not null references public.accounts on delete restrict,
  category_id uuid not null references public.categories on delete restrict,
  type text not null check (type in ('income', 'expense', 'investment', 'transfer')),
  flow text not null check (flow in ('in', 'out')),
  amount numeric(14, 2) not null,
  currency text not null check (currency in ('EUR', 'USD')),
  date date not null,
  note text,
  created_at timestamptz not null default now()
);

-- Holdings
create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null,
  asset_class text not null,
  emoji text,
  target_pct numeric(5, 2),
  quantity numeric(14, 2) not null,
  avg_cost numeric(14, 2) not null,
  total_cap numeric(14, 2) not null,
  current_value numeric(14, 2) not null,
  currency text not null check (currency in ('EUR', 'USD')),
  start_date date not null,
  note text,
  created_at timestamptz not null default now()
);

-- Goals
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  category_id uuid references public.categories on delete set null,
  title text not null,
  emoji text,
  target_amount numeric(14, 2) not null,
  due_date date not null,
  created_at timestamptz not null default now()
);

-- Settings
create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users on delete cascade,
  base_currency text not null check (base_currency in ('EUR', 'USD')) default 'EUR',
  emergency_fund numeric(14, 2) not null default 0,
  cash_target_cap numeric(14, 2),
  target_cash_pct numeric(5, 2) not null default 20,
  target_etf_pct numeric(5, 2) not null default 50,
  target_bond_pct numeric(5, 2) not null default 20,
  target_emergency_pct numeric(5, 2) not null default 10,
  rebalance_months integer not null default 6,
  updated_at timestamptz not null default now()
);

-- Allocation targets (optional, for custom asset allocation sliders)
create table if not exists public.allocation_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  key text not null,
  label text not null,
  pct numeric(5, 2) not null default 0,
  color text,
  sort_order integer,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists settings_updated_at on public.settings;
create trigger settings_updated_at
before update on public.settings
for each row
execute procedure public.set_updated_at();

-- RLS
alter table public.categories enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.holdings enable row level security;
alter table public.goals enable row level security;
alter table public.settings enable row level security;
alter table public.allocation_targets enable row level security;

create policy "Categories select" on public.categories
  for select using (auth.uid() = user_id);
create policy "Categories insert" on public.categories
  for insert with check (auth.uid() = user_id);
create policy "Categories update" on public.categories
  for update using (auth.uid() = user_id);
create policy "Categories delete" on public.categories
  for delete using (auth.uid() = user_id);

create policy "Accounts select" on public.accounts
  for select using (auth.uid() = user_id);
create policy "Accounts insert" on public.accounts
  for insert with check (auth.uid() = user_id);
create policy "Accounts update" on public.accounts
  for update using (auth.uid() = user_id);
create policy "Accounts delete" on public.accounts
  for delete using (auth.uid() = user_id);

create policy "Allocation targets select" on public.allocation_targets
  for select using (auth.uid() = user_id);
create policy "Allocation targets insert" on public.allocation_targets
  for insert with check (auth.uid() = user_id);
create policy "Allocation targets update" on public.allocation_targets
  for update using (auth.uid() = user_id);
create policy "Allocation targets delete" on public.allocation_targets
  for delete using (auth.uid() = user_id);

create policy "Transactions select" on public.transactions
  for select using (auth.uid() = user_id);
create policy "Transactions insert" on public.transactions
  for insert with check (auth.uid() = user_id);
create policy "Transactions update" on public.transactions
  for update using (auth.uid() = user_id);
create policy "Transactions delete" on public.transactions
  for delete using (auth.uid() = user_id);

create policy "Holdings select" on public.holdings
  for select using (auth.uid() = user_id);
create policy "Holdings insert" on public.holdings
  for insert with check (auth.uid() = user_id);
create policy "Holdings update" on public.holdings
  for update using (auth.uid() = user_id);
create policy "Holdings delete" on public.holdings
  for delete using (auth.uid() = user_id);

create policy "Goals select" on public.goals
  for select using (auth.uid() = user_id);
create policy "Goals insert" on public.goals
  for insert with check (auth.uid() = user_id);
create policy "Goals update" on public.goals
  for update using (auth.uid() = user_id);
create policy "Goals delete" on public.goals
  for delete using (auth.uid() = user_id);

create policy "Settings select" on public.settings
  for select using (auth.uid() = user_id);
create policy "Settings insert" on public.settings
  for insert with check (auth.uid() = user_id);
create policy "Settings update" on public.settings
  for update using (auth.uid() = user_id);
create policy "Settings delete" on public.settings
  for delete using (auth.uid() = user_id);

-- Seed default categories per user
create or replace function public.seed_default_categories()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  parent_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.categories where user_id = v_user_id) then
    return;
  end if;

  insert into public.categories (user_id, name, type) values
    (v_user_id, 'Reddito da Lavoro', 'income')
    returning id into parent_id;
  insert into public.categories (user_id, name, type, parent_id) values
    (v_user_id, 'Stipendio Netto', 'income', parent_id),
    (v_user_id, 'Tredicesima / Quattordicesima', 'income', parent_id),
    (v_user_id, 'Bonus & Premi Produzione', 'income', parent_id),
    (v_user_id, 'Buoni Pasto', 'income', parent_id);

  insert into public.categories (user_id, name, type) values
    (v_user_id, 'Extra & Side Hustle', 'income')
    returning id into parent_id;
  insert into public.categories (user_id, name, type, parent_id) values
    (v_user_id, 'Freelance / Prestazioni Occasionali', 'income', parent_id),
    (v_user_id, 'Vendita Oggetti Usati (Vinted, eBay)', 'income', parent_id),
    (v_user_id, 'Consulenze / Lezioni Private', 'income', parent_id);

  insert into public.categories (user_id, name, type) values
    (v_user_id, 'Regali & Aiuti', 'income')
    returning id into parent_id;
  insert into public.categories (user_id, name, type, parent_id) values
    (v_user_id, 'Regali in denaro ricevuti', 'income', parent_id),
    (v_user_id, 'Supporto familiare / Eredita', 'income', parent_id);

  insert into public.categories (user_id, name, type) values
    (v_user_id, 'Rimborsi & Tecnici', 'income')
    returning id into parent_id;
  insert into public.categories (user_id, name, type, parent_id) values
    (v_user_id, 'Rimborso 730 (Credito d''imposta)', 'income', parent_id),
    (v_user_id, 'Resi (Storno spese)', 'income', parent_id),
    (v_user_id, 'Giroconti (Trasferimenti interni)', 'income', parent_id);

  insert into public.categories (user_id, name, type) values
    (v_user_id, 'Casa & Utenze', 'expense')
    returning id into parent_id;
  insert into public.categories (user_id, name, type, parent_id, is_fixed) values
    (v_user_id, 'Affitto / Mutuo', 'expense', parent_id, true),
    (v_user_id, 'Condominio', 'expense', parent_id, true),
    (v_user_id, 'Energia Elettrica & Gas', 'expense', parent_id, true),
    (v_user_id, 'Acqua & TARI', 'expense', parent_id, true),
    (v_user_id, 'Internet & Telefono', 'expense', parent_id, true),
    (v_user_id, 'Manutenzione & Pulizia', 'expense', parent_id, false);

  insert into public.categories (user_id, name, type) values
    (v_user_id, 'Alimentazione', 'expense')
    returning id into parent_id;
  insert into public.categories (user_id, name, type, parent_id) values
    (v_user_id, 'Spesa Supermercato', 'expense', parent_id),
    (v_user_id, 'Ristoranti & Delivery', 'expense', parent_id),
    (v_user_id, 'Bar, Caffe & Colazioni', 'expense', parent_id),
    (v_user_id, 'Pausa Pranzo Lavoro', 'expense', parent_id);

  insert into public.categories (user_id, name, type) values
    (v_user_id, 'Trasporti', 'expense')
    returning id into parent_id;
  insert into public.categories (user_id, name, type, parent_id, is_fixed) values
    (v_user_id, 'Carburante', 'expense', parent_id, false),
    (v_user_id, 'Assicurazione & Bollo (Rateizzato)', 'expense', parent_id, true),
    (v_user_id, 'Manutenzione & Tagliandi', 'expense', parent_id, false),
    (v_user_id, 'Mezzi Pubblici / Treni / Aerei', 'expense', parent_id, false),
    (v_user_id, 'Pedaggi & Parcheggi', 'expense', parent_id, false);

  insert into public.categories (user_id, name, type) values
    (v_user_id, 'Salute & Cura Personale', 'expense')
    returning id into parent_id;
  insert into public.categories (user_id, name, type, parent_id) values
    (v_user_id, 'Farmacia & Medicine', 'expense', parent_id),
    (v_user_id, 'Visite Mediche & Dentista', 'expense', parent_id),
    (v_user_id, 'Igiene Personale & Cosmetica', 'expense', parent_id),
    (v_user_id, 'Parrucchiere & Estetica', 'expense', parent_id);

  insert into public.categories (user_id, name, type) values
    (v_user_id, 'Svago & Lifestyle', 'expense')
    returning id into parent_id;
  insert into public.categories (user_id, name, type, parent_id) values
    (v_user_id, 'Abbonamenti (Streaming, Cloud, App)', 'expense', parent_id),
    (v_user_id, 'Shopping (Vestiti, Scarpe, Accessori)', 'expense', parent_id),
    (v_user_id, 'Elettronica & Gadget', 'expense', parent_id),
    (v_user_id, 'Hobby, Sport & Libri', 'expense', parent_id),
    (v_user_id, 'Uscite serali & Divertimento', 'expense', parent_id),
    (v_user_id, 'Viaggi & Weekend', 'expense', parent_id);

  insert into public.categories (user_id, name, type) values
    (v_user_id, 'Finanza & Obblighi', 'expense')
    returning id into parent_id;
  insert into public.categories (user_id, name, type, parent_id, is_fixed) values
    (v_user_id, 'Commissioni Bancarie', 'expense', parent_id, true),
    (v_user_id, 'Tasse & Bolli Statali', 'expense', parent_id, true),
    (v_user_id, 'Commercialista', 'expense', parent_id, true),
    (v_user_id, 'Interessi passivi su prestiti', 'expense', parent_id, true);

  insert into public.categories (user_id, name, type) values
    (v_user_id, 'Famiglia & Altro', 'expense')
    returning id into parent_id;
  insert into public.categories (user_id, name, type, parent_id) values
    (v_user_id, 'Spese per Figli (Scuola, Sport)', 'expense', parent_id),
    (v_user_id, 'Animali Domestici (Cibo, Vet)', 'expense', parent_id),
    (v_user_id, 'Regali fatti ad altri', 'expense', parent_id),
    (v_user_id, 'Beneficenza', 'expense', parent_id);

  insert into public.categories (user_id, name, type) values
    (v_user_id, 'Versamenti (Input Capitale)', 'investment')
    returning id into parent_id;
  insert into public.categories (user_id, name, type, parent_id) values
    (v_user_id, 'PAC (Piano Accumulo ETF/Fondi)', 'investment', parent_id),
    (v_user_id, 'Acquisto Azioni Singole / Bond', 'investment', parent_id),
    (v_user_id, 'Versamento Fondo Pensione', 'investment', parent_id),
    (v_user_id, 'Versamento Conto Deposito / Liquidita', 'investment', parent_id),
    (v_user_id, 'Acquisto Crypto / Oro', 'investment', parent_id);

  insert into public.categories (user_id, name, type) values
    (v_user_id, 'Rendita Generata (Flusso Positivo)', 'investment')
    returning id into parent_id;
  insert into public.categories (user_id, name, type, parent_id) values
    (v_user_id, 'Dividendi Azionari', 'investment', parent_id),
    (v_user_id, 'Cedole Obbligazionarie', 'investment', parent_id),
    (v_user_id, 'Interessi da Conto Deposito', 'investment', parent_id),
    (v_user_id, 'Affitti Percepiti', 'investment', parent_id);

  insert into public.categories (user_id, name, type) values
    (v_user_id, 'Disinvestimenti (Output Capitale)', 'investment')
    returning id into parent_id;
  insert into public.categories (user_id, name, type, parent_id) values
    (v_user_id, 'Vendita Titoli (Ritorno in liquidita)', 'investment', parent_id),
    (v_user_id, 'Scadenza Vincoli / Obbligazioni', 'investment', parent_id);
end;
$$;

grant execute on function public.seed_default_categories() to authenticated;

-- Profiles
create table if not exists public.profiles (
  user_id uuid primary key references auth.users on delete cascade default auth.uid(),
  display_name text,
  avatar_url text,
  avatar_path text,
  favorite_avatars text[] not null default '{}',
  recent_avatars text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
before update on public.profiles
for each row
execute procedure public.set_updated_at();

alter table public.profiles enable row level security;

create policy "Profiles select" on public.profiles
  for select using (auth.uid() = user_id);
create policy "Profiles insert" on public.profiles
  for insert with check (auth.uid() = user_id);
create policy "Profiles update" on public.profiles
  for update using (auth.uid() = user_id);
create policy "Profiles delete" on public.profiles
  for delete using (auth.uid() = user_id);

-- Avatar storage
insert into storage.buckets (id, name, public)
values ('Avatar_profile', 'Avatar_profile', false)
on conflict (id) do nothing;

create policy "Avatar_profile select" on storage.objects
  for select using (bucket_id = 'Avatar_profile' and auth.uid() = owner);
create policy "Avatar_profile insert" on storage.objects
  for insert with check (bucket_id = 'Avatar_profile' and auth.uid() = owner);
create policy "Avatar_profile delete" on storage.objects
  for delete using (bucket_id = 'Avatar_profile' and auth.uid() = owner);
