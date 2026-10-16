/**
 * supabase-falso.test-helper.mjs · Cliente FALSO de supabase-js para `node --test`.
 *
 * No es un test (el glob `src/lib/*.test.mjs` no lo recoge) ni lo importa el código de
 * la aplicación: solo los tests de S-13 (acceso por cuenta, checkout y webhook de
 * suscripciones). Replica lo que esos flujos necesitan de PostgREST:
 *   - `select / insert / upsert / update` encadenables, `maybeSingle()` y `await` directo;
 *   - filtros `eq`, `neq`, `is`, `in` y `or('a.is.null,b.eq.x')`;
 *   - UNIQUE por tabla: `insert` choca (23505, 409) y `upsert` con `ignoreDuplicates`
 *     no inserta ni devuelve la fila (semántica `ON CONFLICT DO NOTHING RETURNING`);
 *   - `update(...).select()` devuelve SOLO las filas afectadas (semántica RETURNING),
 *     que es lo que hace atómicos los CAS;
 *   - fallos por tabla con su `status` HTTP (`fallar`), cuelgues que solo termina la
 *     señal de `abortSignal` (`colgar`), y un registro de llamadas para las aserciones.
 * Respuestas con la forma de supabase-js: `{ data, error, status }`.
 */

/**
 * @param {Record<string, Array<Record<string, any>>>} tablas  filas iniciales (se mutan)
 * @param {{ unicos?: Record<string, string[][]>,
 *           fallar?: Record<string, { status?: number, message?: string, op?: string }>,
 *           colgar?: Record<string, boolean> }} [opts]
 */
export function clienteFalso(tablas = {}, { unicos = {}, fallar = {}, colgar = {} } = {}) {
  const llamadas = [];
  let secuencia = 0;

  function from(tabla) {
    if (!tablas[tabla]) tablas[tabla] = [];
    const st = { op: 'select', payload: null, opts: {}, cols: null, filtros: [], signal: null, single: false };

    const pasa = (fila) =>
      st.filtros.every((f) => {
        const [tipo, col, val] = f;
        if (tipo === 'eq') return igual(fila[col], val);
        if (tipo === 'neq') return !igual(fila[col], val);
        if (tipo === 'is') return (fila[col] ?? null) === val;
        if (tipo === 'in') return val.some((v) => igual(fila[col], v));
        if (tipo === 'or') return val.some(([c, op, v]) => (op === 'is' ? (fila[c] ?? null) === v : igual(fila[c], v)));
        return false;
      });

    const proyectar = (fila) => {
      if (!st.cols || st.cols.trim() === '*') return { ...fila };
      const out = {};
      for (const c of st.cols.split(',').map((x) => x.trim()).filter(Boolean)) out[c] = fila[c] ?? null;
      return out;
    };

    const choca = (fila) =>
      (unicos[tabla] ?? []).some((cols) =>
        tablas[tabla].some((otra) => otra !== fila && cols.every((c) => igual(otra[c], fila[c]))),
      );

    function ejecutar() {
      llamadas.push({ tabla, op: st.op, payload: st.payload, opts: st.opts, filtros: st.filtros, cols: st.cols });
      const f = fallar[tabla];
      if (f && (!f.op || f.op === st.op)) {
        return { data: null, error: { message: f.message ?? 'boom', code: f.code ?? '' }, status: f.status ?? 0 };
      }
      const filas = tablas[tabla];

      if (st.op === 'insert' || st.op === 'upsert') {
        const nuevas = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((r) => ({
          id: `${tabla}-${++secuencia}`,
          ...r,
        }));
        const insertadas = [];
        for (const r of nuevas) {
          if (choca(r)) {
            if (st.op === 'upsert' && st.opts.ignoreDuplicates) continue;
            return { data: null, error: { message: 'duplicate key value', code: '23505' }, status: 409 };
          }
          filas.push(r);
          insertadas.push(r);
        }
        return { data: insertadas.map(proyectar), error: null, status: 201 };
      }

      if (st.op === 'update') {
        const hit = filas.filter(pasa);
        for (const r of hit) Object.assign(r, st.payload);
        return { data: hit.map(proyectar), error: null, status: 200 };
      }

      return { data: filas.filter(pasa).map(proyectar), error: null, status: 200 };
    }

    function resolver() {
      const correr = () => {
        const r = ejecutar();
        if (!st.single || r.error) return r;
        const arr = r.data ?? [];
        if (arr.length > 1) return { data: null, error: { message: 'multiple rows', code: 'PGRST116' }, status: 406 };
        return { ...r, data: arr[0] ?? null };
      };
      if (colgar[tabla]) {
        // Cuelgue: solo la señal lo termina, con la forma que da supabase-js a un abort.
        return new Promise((resolve) => {
          const abortar = () => resolve({ data: null, error: { message: 'AbortError: aborted', code: '' }, status: 0 });
          if (st.signal?.aborted) abortar();
          else st.signal?.addEventListener('abort', abortar, { once: true });
        });
      }
      return Promise.resolve().then(correr);
    }

    const b = {
      select(cols) {
        st.cols = cols ?? '*';
        return b;
      },
      insert(payload) {
        st.op = 'insert';
        st.payload = payload;
        return b;
      },
      upsert(payload, opts) {
        st.op = 'upsert';
        st.payload = payload;
        st.opts = opts ?? {};
        return b;
      },
      update(payload) {
        st.op = 'update';
        st.payload = payload;
        return b;
      },
      eq(col, val) {
        st.filtros.push(['eq', col, val]);
        return b;
      },
      neq(col, val) {
        st.filtros.push(['neq', col, val]);
        return b;
      },
      is(col, val) {
        st.filtros.push(['is', col, val]);
        return b;
      },
      in(col, vals) {
        st.filtros.push(['in', col, vals]);
        return b;
      },
      or(expr) {
        const conds = String(expr)
          .split(',')
          .map((p) => {
            const [c, op, ...resto] = p.split('.');
            const v = resto.join('.');
            return [c, op, op === 'is' && v === 'null' ? null : v];
          });
        st.filtros.push(['or', null, conds]);
        return b;
      },
      abortSignal(signal) {
        st.signal = signal;
        return b;
      },
      maybeSingle() {
        st.single = true;
        return resolver();
      },
      then(onOk, onErr) {
        return resolver().then(onOk, onErr);
      },
    };
    return b;
  }

  return { from, llamadas, tablas };
}

// PostgREST compara texto: un id numérico en la fila casa con su forma en texto.
function igual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return String(a) === String(b);
}
