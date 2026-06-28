-- Migración · Compras (Lemon Squeezy) · escalera editorial TDV/TDR.
-- Backbone: la MISMA Supabase que leads/events/reading_* (portal + libro).
--
-- La tabla `orders` YA EXISTE en producción (se creó a mano en el SQL Editor); el
-- repo carecía de la migración versionada. Esta migración la CODIFICA de forma
-- IDEMPOTENTE para que aplicarla sobre la tabla viva sea un no-op seguro:
--   - create table IF NOT EXISTS (no toca la tabla existente).
--   - UNIQUE(ls_order_id) añadido vía DO-block con guard if-not-exists (la
--     idempotencia del webhook depende de este constraint; sin él el upsert por
--     onConflict='ls_order_id' falla).
--   - grants EXPLÍCITOS a service_role (lección PG 42501: las tablas creadas por
--     migración no heredan grants en el sistema de keys sb_secret_*).
--
-- Esquema trazado del código del webhook (src/pages/api/webhooks/lemonsqueezy.ts
-- + src/lib/lemonsqueezy-webhook.mjs): ls_order_id, ls_order_identifier, email,
-- lead_id, product_slug, tipo, amount_cents, currency, status, nivel_otorgado,
-- acceso_expira_at, test_mode, raw, created_at, updated_at.
--
-- APLICACIÓN: MANUAL vía Supabase SQL Editor por Ricardo (regla del proyecto:
-- nada de `supabase db push` ni MCP). NO aplicada por esta sesión.

create extension if not exists "citext";

-- ============================================================================
-- orders · una fila por compra confirmada en Lemon Squeezy
-- ============================================================================

create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  ls_order_id         text not null,                          -- id numérico de LS · clave de idempotencia
  ls_order_identifier text,                                   -- nº de pedido legible (recibo)
  email               citext not null,                        -- comprador · case-insensitive como leads
  lead_id             uuid references public.leads(id) on delete set null,
  product_slug        text not null,                          -- 'bundle-preventa' | 'acto-2' | 'libro-completo' | ...
  variant_id          text,                                   -- variant_id de LS (auditoría · reservado para multi-producto)
  tipo                text not null default 'one-time'
                        check (tipo in ('one-time', 'subscription')),
  amount_cents        int,                                    -- total cobrado (centavos)
  currency            text not null default 'USD',
  status              text not null
                        check (status in ('paid', 'refunded', 'disputed', 'pending')),
  nivel_otorgado      smallint not null
                        check (nivel_otorgado in (2, 3)),     -- 2 comprador · 3 libro completo
  acceso_expira_at    timestamptz,                            -- null = permanente (decisión Nivel 3 abierta)
  test_mode           boolean not null default false,         -- compra en Test Mode de LS
  raw                 jsonb not null default '{}'::jsonb,     -- payload completo del webhook
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- UNIQUE(ls_order_id) · del que depende la idempotencia (onConflict del upsert).
-- DO-block con guard: seguro tanto en tabla nueva como en la tabla ya viva en prod.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_ls_order_id_key'
  ) then
    alter table public.orders add constraint orders_ls_order_id_key unique (ls_order_id);
  end if;
end $$;

create index if not exists orders_email_idx   on public.orders (email);
create index if not exists orders_lead_idx    on public.orders (lead_id);
create index if not exists orders_product_idx on public.orders (product_slug);
create index if not exists orders_status_idx  on public.orders (status);
create index if not exists orders_created_idx on public.orders (created_at desc);

-- trigger de updated_at · reusa la función touch_updated_at() de migraciones previas.
-- Guard: solo crea el trigger si la función existe (no rompe si aún no se creó).
do $$
begin
  if exists (select 1 from pg_proc where proname = 'touch_updated_at') then
    drop trigger if exists orders_touch_updated_at on public.orders;
    create trigger orders_touch_updated_at
      before update on public.orders
      for each row
      execute function public.touch_updated_at();
  end if;
end $$;

-- ============================================================================
-- RLS · cerrado por defecto (igual que leads/events/reading_*)
-- ============================================================================

alter table public.orders enable row level security;

-- Sin policies · solo la key sb_secret_* (service_role) puede operar.
revoke all on public.orders from anon, authenticated;

-- ============================================================================
-- Grants EXPLÍCITOS · sin esto el webhook server-only falla con PG 42501
-- ============================================================================

grant all on public.orders to service_role;
grant all on public.orders to postgres;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

-- ============================================================================
-- Comentarios
-- ============================================================================

comment on table public.orders is 'Compras confirmadas en Lemon Squeezy · fuente de verdad del acceso de pago (Nivel 2/3).';
comment on column public.orders.ls_order_id is 'id de LS · clave de idempotencia · el webhook hace upsert por esta columna.';
comment on column public.orders.product_slug is 'Slug de la escalera: bundle-preventa, bundle-normal, acto-2, acto-3, libro-completo, libro-epub, upgrade-libro.';
comment on column public.orders.nivel_otorgado is '2 = comprador (bundle/actos) · 3 = libro completo. Lo resuelve el webhook desde product_slug.';
comment on column public.orders.acceso_expira_at is 'Null = acceso permanente. Reservado por si el Nivel 3 pasa a recurrente.';
comment on column public.orders.test_mode is 'true = compra en Test Mode de LS · excluir de métricas y conciliación real.';
