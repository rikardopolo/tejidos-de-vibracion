/**
 * Coherencia cita <-> ficha en el aparato crítico.
 *
 * QUÉ COMPRUEBA
 *   (a) toda clave citada en el cuerpo — `*(Autor, Año)*` — tiene ficha en la lista
 *       `**Referencias:**` de SU PROPIA sección;
 *   (b) toda ficha de esa lista se menciona en el cuerpo de esa sección, sea por cita
 *       formal o por el apellido en prosa.
 *
 * QUÉ NO COMPRUEBA — y no puede
 *   Que la obra exista, que el DOI resuelva, que la cita diga lo que la fuente dice.
 *   Nada de eso es automatizable. La campaña de referencias del Cap. 1 encontró 90
 *   hallazgos que este test NO habría visto; habría cazado 11 de ellos.
 *
 * ALCANCE — declarado, no supuesto
 *   El libro tiene DOS superficies bibliográficas:
 *     · la caja `**Referencias:**` con citas autor-año  -> cubierta aquí
 *     · los bloques `## **Notas**` con superíndice        -> FUERA
 *   Y dos formatos de cita inline. Solo el de cursiva `*(Autor, Año)*` es regular:
 *   el de paréntesis planos `(Autor, Año)` es indistinguible de una acotación —
 *   `(París, 1636)`, `(Leipzig, 1948)` — así que se deja fuera a propósito.
 *   Resultado: entran las secciones con al menos una cita en cursiva. Hoy, el Cap. 1.
 *   Los caps. 2 y 4 usan notas al pie y no entran. Si mañana adoptan el sistema
 *   autor-año, entran solas.
 *
 * POR QUÉ EXISTE
 *   Un bloque `**Referencias:**` con tres fichas inventadas y formato impecable pasa
 *   los cinco pasos del CI. Los tres cerrojos de content-lint miran el rótulo y el
 *   separador; ninguno mira el contenido.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = process.env.TDV_CONTENT_DIR
  ?? join(fileURLToPath(new URL('../src/content/chapter-sections', import.meta.url)));

/** Una ficha: párrafo que abre con Apellido y lleva `(Año).` */
const RE_FICHA = /^([A-ZÁÉÍÓÚÑÜÖ][^(]{0,120}?)\((\d{4}[a-z]?)\)\./;
/** Una cita: `*(...)*` en cursiva, sin negrita. */
const RE_CITA = /\*\(([^)*]+)\)\*/g;

const apellido = (s) => (s.match(/[A-Za-zÁÉÍÓÚÑÜÖáéíóúñüöß'-]+/) ?? [s])[0];

/**
 * Fichas de `**Referencias:**` que NO se mencionan en el cuerpo y están justificadas:
 * obras de respaldo temático del pasaje, no de una frase concreta. Verificadas a mano
 * una por una. Es una allowlist: cualquier ficha nueva sin mención hace fallar el test.
 */
const FICHAS_DE_CONTEXTO = new Map([
  ['02-aum-primordial.mdx|Milonni|1994', 'The Quantum Vacuum: manual de referencia del pasaje sobre el vacío, no citado en una frase'],
  ['02-aum-primordial.mdx|Weinberg|1989', 'The cosmological constant problem: respaldo de fondo del mismo pasaje'],
  ['06-catedrales.mdx|Beranek|2004', 'Concert Halls and Opera Houses: obra de referencia acústica del pasaje entero'],
]);

function secciones() {
  const out = [];
  for (const cap of readdirSync(RAIZ)) {
    const dir = join(RAIZ, cap);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.mdx')).sort()) {
      out.push({ cap, f, ruta: `${cap}/${f}`, lineas: readFileSync(join(dir, f), 'utf8').split(/\r?\n/) });
    }
  }
  return out;
}

/** El bloque va del rótulo a la primera línea no vacía que ya no es ficha.
 *  No se puede delimitar con `**Para profundizar:**`: hay secciones que no lo tienen. */
function fichasDe(lineas) {
  const i = lineas.findIndex((l) => l.trim() === '**Referencias:**');
  if (i === -1) return [];
  const out = [];
  for (let j = i + 1; j < lineas.length; j++) {
    const l = lineas[j].trim();
    if (!l) continue;
    const m = l.match(RE_FICHA);
    if (!m) break;
    out.push({ apellido: apellido(m[1]), anio: m[2], linea: l });
  }
  return out;
}

function clavesDe(lineas, fichas) {
  const esFicha = new Set(fichas.map((x) => x.linea));
  const cuerpo = lineas.filter((l) => !esFicha.has(l.trim())).join('\n');
  const claves = [...cuerpo.matchAll(RE_CITA)]
    .flatMap((m) => m[1].split(';'))
    .map((s) => s.trim().match(/^(.+?),\s*(\d{4}[a-z]?)$/))
    .filter(Boolean)
    .map((m) => ({ apellido: apellido(m[1]), anio: m[2], raw: `${m[1].trim()}, ${m[2]}` }));
  const uniq = [...new Map(claves.map((c) => [`${c.apellido}|${c.anio}`, c])).values()];
  return { cuerpo, claves: uniq };
}

const datos = secciones().map((s) => {
  const fichas = fichasDe(s.lineas);
  return { ...s, fichas, ...clavesDe(s.lineas, fichas) };
});
const enAlcance = datos.filter((s) => s.claves.length > 0);

// ── control positivo ────────────────────────────────────────────────────────────
// Un capítulo sin citas y un regex roto se ven IGUAL desde dentro del test.
// Solo uno de los dos es un problema del capítulo.

test('control positivo: los patrones siguen encontrando material', () => {
  const AVISO = 'revisar este test antes que el código';
  const nClaves = enAlcance.reduce((n, s) => n + s.claves.length, 0);
  const nFichas = enAlcance.reduce((n, s) => n + s.fichas.length, 0);

  // Umbrales bajos a propósito: distinguen «el patrón se rompió» (cae a 0 o casi) de
  // «hay menos material que antes», que es una edición normal. Hoy: 6 / 23 / 36.
  assert.ok(enAlcance.length >= 3,
    `solo ${enAlcance.length} secciones en alcance: el patrón de cita dejó de casar — ${AVISO}`);
  assert.ok(nClaves >= 10,
    `solo ${nClaves} claves extraídas en todo el libro: RE_CITA dejó de casar — ${AVISO}`);
  assert.ok(nFichas >= 15,
    `solo ${nFichas} fichas extraídas en todo el libro: RE_FICHA o el delimitador del bloque dejaron de casar — ${AVISO}`);
});

// ── invariantes ─────────────────────────────────────────────────────────────────

test('(a) toda cita del cuerpo tiene ficha en su propia sección', () => {
  const huerfanas = [];
  for (const s of enAlcance)
    for (const c of s.claves)
      if (!s.fichas.some((x) => x.apellido === c.apellido && x.anio === c.anio))
        huerfanas.push(`${s.ruta}  →  *(${c.raw})*`);

  assert.deepEqual(huerfanas, [],
    `${huerfanas.length} cita(s) sin ficha en su sección.\n` +
    'Cada sección se lee suelta con su propia URL: una ficha en §1.3 no resuelve una cita de §1.1.\n' +
    huerfanas.map((h) => `  · ${h}`).join('\n'));
});

test('(b) toda ficha se menciona en el cuerpo de su sección', () => {
  const sinUso = [];
  for (const s of enAlcance)
    for (const x of s.fichas) {
      if (FICHAS_DE_CONTEXTO.has(`${s.f}|${x.apellido}|${x.anio}`)) continue;
      const re = new RegExp(`\\b${x.apellido.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (!re.test(s.cuerpo)) sinUso.push(`${s.ruta}  →  ${x.apellido} (${x.anio})`);
    }

  assert.deepEqual(sinUso, [],
    `${sinUso.length} ficha(s) que el cuerpo no menciona ni cita.\n` +
    'Si es respaldo temático del pasaje y no de una frase, decláralo en FICHAS_DE_CONTEXTO con su motivo.\n' +
    sinUso.map((h) => `  · ${h}`).join('\n'));
});

test('las excepciones declaradas siguen existiendo', () => {
  // Una excepción que ya no corresponde a ninguna ficha es basura que tapa fallos futuros.
  const vivas = new Set(
    datos.flatMap((s) => s.fichas.map((x) => `${s.f}|${x.apellido}|${x.anio}`)));
  const muertas = [...FICHAS_DE_CONTEXTO.keys()].filter((k) => !vivas.has(k));
  assert.deepEqual(muertas, [],
    `excepciones que ya no apuntan a ninguna ficha — retíralas de FICHAS_DE_CONTEXTO:\n` +
    muertas.map((m) => `  · ${m}`).join('\n'));
});
