# Migraciones históricas de Supabase

Esta carpeta **no es un ledger activo**. Sus archivos SQL se conservan sin
editar, renombrar, mover ni eliminar como evidencia del origen de `public.orders`:

- `20260628165651_orders.sql`
  — SHA-256 `8998e5eb86f448389a0a5d7437059385d6528726dedc31294c697a66460a2951`
- `20260731190000_orders_acceso_enviado_at.sql` (candado de entrega · PR #95)
  — SHA-256 `10e2decacb644524121197cc538fdcfe33f8a9d75ad06359d78150cee6ea6041`

La lista vive en `scripts/check-supabase-ledger.mjs` y se comprueba en las dos
direcciones: ni un `.sql` de más, ni uno de menos, ni un byte cambiado.

Toda migración nueva para la Supabase compartida TDV/TDR se escribe en:

`E:\dev\tejidos-de-realidad\supabase\migrations`

Los cambios que afecten al libro se prueban en este repo, pero el DDL se propone
y revisa en el ledger del portal. No ejecutar el SQL histórico desde aquí. El
guard `tejidos-de-realidad/scripts/check-supabase-ledger.mjs` falla si aparece
otro `.sql` en esta carpeta o si cambia el archivo conservado.
