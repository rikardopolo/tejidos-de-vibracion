-- Migración · `orders.acceso_enviado_at` · desacopla la ENTREGA del acceso del
-- registro del pago.
--
-- POR QUÉ. El email con el enlace de acceso colgaba de `isFirstEffect` (el
-- booleano que devuelve `persistOrderAtomic` cuando la fila es nueva). Si el
-- envío fallaba, el webhook devolvía 500 para que Lemon Squeezy reintentara —
-- pero la orden ya estaba persistida, así que en el reintento el upsert con
-- `ignoreDuplicates` no insertaba nada, `isFirstEffect` era false y el email NO
-- se reenviaba jamás. Resultado posible: compra pagada, fila correcta, y un
-- comprador sin su enlace.
--
-- Esta columna es el candado de la entrega, independiente del de la fila:
--   claim   → update ... .eq(ls_order_id, X).is('acceso_enviado_at', null)
--   release → update ... set acceso_enviado_at = null   (si el envío falló)
-- Solo envía quien gana la carrera; el resto ve 0 filas afectadas. Es el mismo
-- patrón de transición única que ya usa el refund con `.neq('status','refunded')`.
--
-- NULL = aún no entregado. Las filas preexistentes YA recibieron su enlace bajo el
-- régimen anterior (`isFirstEffect`), así que dejarlas en NULL haría que una
-- reentrega de Lemon Squeezy sobre una orden vieja la reclamara y mandara el email
-- OTRA VEZ. Por eso el backfill de abajo NO es opcional.
--
-- IDEMPOTENTE: `add column if not exists` + backfill acotado a `is null`, aplicable
-- sobre la tabla viva y repetible sin efecto.
--
-- APLICACIÓN: MANUAL vía Supabase SQL Editor por Ricardo. NO aplicada por esta
-- sesión (gate de Ricardo · regla del proyecto: nada de `supabase db push` ni MCP
-- sin GO).

alter table public.orders
  add column if not exists acceso_enviado_at timestamptz;

comment on column public.orders.acceso_enviado_at is
  'Cuándo se envió el email con el enlace de acceso. NULL = pendiente de entrega. '
  'Es el candado atómico de la entrega: el webhook lo reclama exigiendo además '
  'status = ''paid'' (una orden reembolsada no entrega acceso) y lo libera si el '
  'envío falla, para que el reintento de Lemon Squeezy lo recupere.';

-- BACKFILL OBLIGATORIO. Las órdenes ya pagadas recibieron su enlace bajo el régimen
-- anterior; sin esto, una reentrega de Lemon Squeezy sobre cualquiera de ellas vería
-- NULL, la reclamaría y mandaría un email duplicado a un comprador antiguo.
-- Acotado a `is null` → repetible sin efecto.
update public.orders
   set acceso_enviado_at = coalesce(updated_at, created_at)
 where status = 'paid'
   and acceso_enviado_at is null;

-- Índice parcial sobre la consulta caliente REAL: "pagadas sin entregar", que es
-- exactamente lo que filtra el candado (`status = 'paid' and acceso_enviado_at is
-- null`) y también la pregunta de cualquier revisión de entregas perdidas.
create index if not exists orders_acceso_pendiente_idx
  on public.orders (ls_order_id)
  where acceso_enviado_at is null and status = 'paid';
