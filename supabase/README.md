# Migraciones históricas de Supabase

Esta carpeta **no es un ledger activo**. Sus archivos SQL se conservan sin
editar, renombrar, mover ni eliminar como evidencia del origen de `public.orders`:

- `20260628165651_orders.sql`
  — SHA-256 `3be4e7ac98188af011be73d707903d27d16469a64fc07340834c2bfec062f5ba`
- `20260731190000_orders_acceso_enviado_at.sql` (candado de entrega · PR #95)
  — SHA-256 `477451445f0747ffb17225886c549acb62928a3489831efed0ba866ce6f6b2ed`

Los SHA son del contenido con finales de línea **normalizados a LF** (los mismos
que devuelve `git show HEAD:<ruta> | sha256sum`), no de los bytes del disco: en
un checkout de Windows estos archivos quedan con CRLF y hashearlos crudos haría
saltar el guard según el sistema operativo.

La lista vive en `scripts/check-supabase-ledger.mjs` y se comprueba en las dos
direcciones: ni un `.sql` de más, ni uno de menos, ni un byte cambiado.

Toda migración nueva para la Supabase compartida TDV/TDR se escribe en:

`E:\dev\tejidos-de-realidad\supabase\migrations`

Los cambios que afecten al libro se prueban en este repo, pero el DDL se propone
y revisa en el ledger del portal. No ejecutar el SQL histórico desde aquí. El
guard `tejidos-de-realidad/scripts/check-supabase-ledger.mjs` falla si aparece
otro `.sql` en esta carpeta o si cambia el archivo conservado.
