/**
 * Alta gratis del libro (S-15) · stdlib node:test + cliente falso de Supabase.
 * Correr: node --test src/lib/alta-libro.test.mjs
 *
 * Cubre lo que pide la sesión: el alta funciona sin nombre; sin la autorización se
 * rechaza; con las Cartas desmarcadas no se suscribe; un lead que ya existe conserva
 * su evidencia y solo recibe el enlace; un nombre vacío o de espacios da saludo
 * neutro. Sustituye a `lead-alta.test.mjs` (S-05): la protección de la fila existente
 * es ahora total (antes se reescribían `consent_text`, ip, ua y geo).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  CONSENT_TEXT_LIBRO,
  ENLACE_PRIVACIDAD,
  NOMBRE_MAX,
  CONSENT_LEGADO_LIBRO,
  cartasAceptadas,
  cartasVigentes,
  evidenciaConsentimiento,
  limpiarNombre,
  partirEnlace,
  registrarAltaLibro,
  saludo,
  validarAltaLibro,
} from './alta-libro.mjs';
import { clienteFalso } from './supabase-falso.test-helper.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');

// ─── Textos de las casillas ─────────────────────────────────────────────────

test('cada texto está atado a su versión: cambiar el texto obliga a cambiar la versión', () => {
  // Si este test falla porque cambiaste un texto: sube su `version` y actualiza aquí
  // la huella. La versión es la evidencia de QUÉ texto aceptó cada lead.
  const HUELLAS = {
    'libro-autorizacion-2026-10-07': 'e0e661923beadfc75378ad286edbdbbbb66942c6bd29d293486f0fb3c6f2eb92',
    'libro-cartas-2026-10-07': '1f1c7546e731b4d195b5e702a6005bccc71b4f6c58ff35ac23fd5515f6c7ce6a',
  };
  for (const { version, texto } of Object.values(CONSENT_TEXT_LIBRO)) {
    assert.equal(HUELLAS[version], sha(texto), `texto cambiado sin cambiar la versión ${version}`);
  }
  assert.notEqual(CONSENT_TEXT_LIBRO.autorizacion.version, CONSENT_TEXT_LIBRO.cartas.version);
});

test('la casilla obligatoria enlaza la política y se reconstruye letra por letra', () => {
  const t = CONSENT_TEXT_LIBRO.autorizacion.texto;
  const p = partirEnlace(t);
  assert.equal(p.enlace, ENLACE_PRIVACIDAD);
  assert.equal(p.antes + p.enlace + p.despues, t, 'lo que se ve es lo que se guarda');
  assert.match(t, /autorizo el tratamiento de mis datos/);
  assert.match(t, /avance de lectura/, 'la medición de lectura se informa como finalidad (v2 §7.8)');
  assert.doesNotMatch(t, /Cartas/, 'las Cartas no van en la casilla obligatoria');
  assert.deepEqual(partirEnlace('sin enlace'), { antes: 'sin enlace', enlace: '', despues: '' });
});

test('la casilla de las Cartas es el texto del v2', () => {
  assert.equal(
    CONSENT_TEXT_LIBRO.cartas.texto,
    'Quiero recibir por correo las Cartas del Tejedor y los avisos de nuevos capítulos.',
  );
});

// ─── Esquema ────────────────────────────────────────────────────────────────

const base = (extra = {}) => ({ correo: 'ana@correo.co', autorizacion: true, website: '', ...extra });

test('sin nombre: el alta es válida y las Cartas quedan desmarcadas por defecto', () => {
  const v = validarAltaLibro(base());
  assert.equal(v.ok, true);
  assert.equal(v.datos.nombre, undefined);
  assert.equal(v.datos.cartas, false);
});

test('nombre vacío, de espacios o invisible → como si no hubiera nombre', () => {
  for (const nombre of ['', '   ', '\n\t ', '​​', null]) {
    const v = validarAltaLibro(base({ nombre }));
    assert.equal(v.ok, true, JSON.stringify(nombre));
    assert.equal(v.datos.nombre, undefined, JSON.stringify(nombre));
  }
});

test('nombre: se recorta, se colapsan los espacios y se quitan los controles', () => {
  const v = validarAltaLibro(base({ nombre: '  Ana \n  María\u0007 ‮' }));
  assert.equal(v.ok, true);
  assert.equal(v.datos.nombre, 'Ana María');
});

test(`nombre: más de ${NOMBRE_MAX} caracteres, con < o >, o que no es texto → rechazo en «nombre»`, () => {
  assert.equal(validarAltaLibro(base({ nombre: 'x'.repeat(NOMBRE_MAX) })).ok, true);
  for (const nombre of ['x'.repeat(NOMBRE_MAX + 1), '<b>Ana</b>', 'Ana >', 42, {}]) {
    const v = validarAltaLibro(base({ nombre }));
    assert.equal(v.ok, false, JSON.stringify(nombre));
    assert.deepEqual(v.issues, ['nombre']);
  }
});

test('sin la autorización → rechazo (ausente, false, «on» o el `acepto` del formulario viejo)', () => {
  const sinAutorizacion = { correo: 'ana@correo.co', website: '' };
  for (const cuerpo of [
    sinAutorizacion,
    { ...sinAutorizacion, autorizacion: false },
    { ...sinAutorizacion, autorizacion: 'on' },
    { ...sinAutorizacion, acepto: true, nombre: 'Ana' },
  ]) {
    const v = validarAltaLibro(cuerpo);
    assert.equal(v.ok, false, JSON.stringify(cuerpo));
    assert.deepEqual(v.issues, ['autorizacion']);
  }
});

test('Cartas: solo booleano; correo recortado y validado; honeypot lleno → rechazo', () => {
  assert.equal(validarAltaLibro(base({ cartas: true })).datos.cartas, true);
  assert.deepEqual(validarAltaLibro(base({ cartas: 'on' })).issues, ['cartas']);
  assert.equal(validarAltaLibro(base({ correo: '  ana@correo.co ' })).datos.correo, 'ana@correo.co');
  assert.deepEqual(validarAltaLibro(base({ correo: 'ana@' })).issues, ['correo']);
  assert.deepEqual(validarAltaLibro(base({ correo: '' })).issues, ['correo']);
  assert.deepEqual(validarAltaLibro(base({ website: 'http://spam' })).issues, ['website']);
  assert.equal(validarAltaLibro(null).ok, false);
});

// ─── Saludo ─────────────────────────────────────────────────────────────────

test('saludo neutro sin nombre (nunca «Hola ,») y con el nombre limpio si lo hay', () => {
  for (const n of [undefined, null, '', '   ', '​', 42]) assert.equal(saludo(n), 'Hola:', JSON.stringify(n));
  assert.equal(saludo('  Ana  '), 'Hola, Ana:');
  assert.equal(saludo('Ana\n María'), 'Hola, Ana María:');
  assert.equal(saludo('x'.repeat(300)).length, 'Hola, :'.length + NOMBRE_MAX);
  assert.equal(limpiarNombre(' ‍ '), '', 'un ZWJ solo no es un nombre');
});

// ─── Evidencia ──────────────────────────────────────────────────────────────

test('evidencia: texto y versión de cada casilla ACEPTADA', () => {
  const sin = JSON.parse(evidenciaConsentimiento({ cartas: false }));
  assert.deepEqual(sin, {
    autorizacion: {
      version: CONSENT_TEXT_LIBRO.autorizacion.version,
      texto: CONSENT_TEXT_LIBRO.autorizacion.texto,
    },
  });
  const con = JSON.parse(evidenciaConsentimiento({ cartas: true }));
  assert.deepEqual(con.cartas, { version: CONSENT_TEXT_LIBRO.cartas.version, texto: CONSENT_TEXT_LIBRO.cartas.texto });
});

test('cartasAceptadas: según la casilla, el texto de antes cuenta como sí, y sin evidencia no', () => {
  assert.equal(cartasAceptadas(evidenciaConsentimiento({ cartas: true })), true);
  assert.equal(cartasAceptadas(evidenciaConsentimiento({ cartas: false })), false);
  const anterior =
    'Acepto recibir por correo los avisos de nuevos capítulos y las cartas del Tejedor, y que se registre mi avance de lectura para mejorar el libro. Conozco la política de privacidad.';
  assert.equal(cartasAceptadas(anterior), true, 'el consentimiento único de antes incluía las Cartas');
  for (const nada of [null, undefined, '', '   ', 42]) assert.equal(cartasAceptadas(nada), false);
  assert.equal(cartasAceptadas(JSON.stringify({ autorizacion: {}, cartas: true })), false, 'sin versión no vale');
});

// ─── Flujo completo (registrarAltaLibro) ────────────────────────────────────

const ENTRADA = (datos) => ({
  datos,
  utm: { utm_campaign: 'pieza-07' },
  ipHash: 'iphash',
  userAgent: 'ua-test',
  geo: { country: 'CO', region: 'VAC' },
});

function deps(supabase, { brevoOk = true, correoOk = true } = {}) {
  const contactos = [];
  const correos = [];
  const errores = [];
  return {
    contactos,
    correos,
    errores,
    d: {
      supabase,
      upsertContact: async (o) => {
        contactos.push(o);
        return { ok: brevoOk };
      },
      enviarEnlace: async (o) => {
        correos.push(o);
        return correoOk ? { ok: true, messageId: 'm-1' } : { ok: false };
      },
      urlConfirmacion: (correo) => `https://libro.test/bienvenido?t=tok-${correo}`,
      log: { error: (...a) => errores.push(a) },
    },
  };
}

const conLeads = (filas = []) =>
  clienteFalso({ leads: filas, events: [] }, { unicos: { leads: [['email']] } });

const datos = (extra = {}) => validarAltaLibro(base(extra)).datos;

test('alta nueva SIN nombre y SIN Cartas: se guarda, no se suscribe y el saludo es neutro', async () => {
  const sb = conLeads();
  const t = deps(sb);
  const r = await registrarAltaLibro(ENTRADA(datos()), t.d);

  assert.equal(r.status, 201);
  assert.equal(sb.tablas.leads.length, 1);
  const fila = sb.tablas.leads[0];
  assert.equal(fila.name, null);
  assert.equal(fila.source, 'libro');
  assert.equal(cartasAceptadas(fila.consent_text), false);
  assert.equal(JSON.parse(fila.consent_text).autorizacion.version, CONSENT_TEXT_LIBRO.autorizacion.version);

  assert.equal(t.contactos.length, 0, 'sin las Cartas no hay contacto de marketing en Brevo');
  assert.equal(t.correos.length, 1, 'el enlace sí sale: da el nivel 1');
  assert.equal(t.correos[0].name, undefined);
  assert.equal(t.correos[0].params.SALUDO, 'Hola:');
  assert.equal('NOMBRE' in t.correos[0].params, false);
  assert.equal(t.correos[0].params.CONFIRMATION_URL, 'https://libro.test/bienvenido?t=tok-ana@correo.co');
  assert.equal(t.correos[0].params.CARTAS, 'no', 'la plantilla no le promete la primera carta');

  const [creado, enviado] = sb.tablas.events;
  assert.equal(creado.type, 'lead_created');
  assert.deepEqual(creado.metadata.consentimiento, {
    autorizacion: CONSENT_TEXT_LIBRO.autorizacion.version,
    cartas: null,
  });
  assert.deepEqual(creado.metadata.utm, { utm_campaign: 'pieza-07' });
  assert.equal(enviado.type, 'email_sent');
  assert.equal(enviado.metadata.reenvio, false);
});

test('alta nueva CON Cartas y nombre: evidencia de las dos casillas y contacto que solo se crea', async () => {
  const sb = conLeads();
  const t = deps(sb);
  const r = await registrarAltaLibro(ENTRADA(datos({ nombre: '  Ana  ', cartas: true })), t.d);

  assert.equal(r.status, 201);
  assert.equal(sb.tablas.leads[0].name, 'Ana');
  assert.equal(cartasAceptadas(sb.tablas.leads[0].consent_text), true);
  assert.deepEqual(t.contactos, [
    {
      email: 'ana@correo.co',
      updateEnabled: false,
      attributes: { NIVEL: 'tejedor', FUENTE: 'registro-libro', DOI_PENDIENTE: 'true', NOMBRE: 'Ana' },
    },
  ]);
  assert.equal(t.correos[0].params.SALUDO, 'Hola, Ana:');
  assert.equal(t.correos[0].params.NOMBRE, 'Ana');
  assert.equal(t.correos[0].params.CARTAS, 'si');
  assert.equal(t.correos[0].name, 'Ana');
  assert.equal(sb.tablas.events[0].metadata.consentimiento.cartas, CONSENT_TEXT_LIBRO.cartas.version);
});

const EXISTENTE = (extra = {}) => ({
  id: 'lead-previo',
  email: 'ana@correo.co',
  source: 'portal',
  name: 'Ana Original',
  consent_text: evidenciaConsentimiento({ cartas: false }),
  ip_hash: 'ip-original',
  user_agent: 'ua-original',
  country: 'MX',
  region: 'CMX',
  confirmed_at: null,
  unsubscribed_at: null,
  ...extra,
});

test('lead existente: evidencia, nombre y fila intactos; solo se reenvía el enlace', async () => {
  const previa = EXISTENTE({ unsubscribed_at: '2026-09-01T00:00:00Z' });
  const sb = conLeads([{ ...previa }]);
  const t = deps(sb);
  const r = await registrarAltaLibro(
    ENTRADA(datos({ nombre: 'Nombre de un tercero', cartas: true })),
    t.d,
  );

  assert.equal(r.status, 201);
  assert.deepEqual(sb.tablas.leads, [previa], 'ni evidencia, ni nombre, ni baja, ni ip/ua/geo, ni source');
  assert.equal(
    sb.llamadas.some((c) => c.tabla === 'leads' && c.op === 'update'),
    false,
    'ningún UPDATE sobre leads',
  );
  assert.equal(t.contactos.length, 0, 'su evidencia no tiene Cartas: el POST no las añade');
  assert.equal(t.correos.length, 1);
  assert.equal(t.correos[0].params.SALUDO, 'Hola, Ana Original:', 'el nombre del formulario no se usa');
  assert.equal(t.correos[0].name, 'Ana Original');

  const tipos = sb.tablas.events.map((e) => e.type);
  assert.deepEqual(tipos, ['alta_repetida', 'email_sent'], 'sin un lead_created duplicado');
  assert.equal(sb.tablas.events[0].metadata.confirmado, false);
  assert.equal(sb.tablas.events[0].metadata.consentimiento_no_aplicado.cartas, CONSENT_TEXT_LIBRO.cartas.version);
  assert.equal(sb.tablas.events[1].metadata.reenvio, true);
});

test('lead existente sin nombre guardado → saludo neutro aunque el formulario traiga uno', async () => {
  const sb = conLeads([EXISTENTE({ name: null })]);
  const t = deps(sb);
  await registrarAltaLibro(ENTRADA(datos({ nombre: 'Otro' })), t.d);
  assert.equal(t.correos[0].params.SALUDO, 'Hola:');
  assert.equal(t.correos[0].name, undefined);
});

test('lead existente CONFIRMADO: también recibe el enlace (vuelta al nivel 1, desvío documentado)', async () => {
  const sb = conLeads([EXISTENTE({ confirmed_at: '2026-08-01T00:00:00Z' })]);
  const t = deps(sb);
  const r = await registrarAltaLibro(ENTRADA(datos()), t.d);
  assert.equal(r.status, 201);
  assert.equal(t.correos.length, 1);
  assert.equal(sb.tablas.events[0].metadata.confirmado, true);
});

test('lead existente con Cartas en su evidencia (texto de antes) → se asegura el contacto sin reescribirlo', async () => {
  const sb = conLeads([EXISTENTE({ consent_text: CONSENT_LEGADO_LIBRO[1] })]);
  const t = deps(sb);
  await registrarAltaLibro(ENTRADA(datos({ nombre: 'Tercero', cartas: false })), t.d);
  assert.equal(t.contactos.length, 1);
  assert.equal(t.contactos[0].updateEnabled, false, 'Brevo solo lo crea si falta');
  assert.equal(t.contactos[0].attributes.NOMBRE, 'Ana Original');
});

test('misma respuesta para un correo nuevo y para uno registrado (no se enumera)', async () => {
  const nuevo = await registrarAltaLibro(ENTRADA(datos()), deps(conLeads()).d);
  const viejo = await registrarAltaLibro(ENTRADA(datos()), deps(conLeads([EXISTENTE()])).d);
  assert.deepEqual(nuevo, viejo);
});

test('sin base (o con error): el enlace sale, pero sin evidencia no hay contacto ni nombre', async () => {
  for (const sb of [null, clienteFalso({ leads: [] }, { fallar: { leads: { op: 'upsert', status: 500 } } })]) {
    const t = deps(sb);
    const r = await registrarAltaLibro(ENTRADA(datos({ nombre: 'Ana', cartas: true })), t.d);
    assert.equal(r.status, 201);
    assert.equal(t.contactos.length, 0, 'sin evidencia guardada no se crea contacto de marketing');
    assert.equal(t.correos.length, 1);
    assert.equal(t.correos[0].params.SALUDO, 'Hola:', 'no se sabe si el nombre es del titular');
  }
});

test('Brevo falla al crear el contacto → 502 y no se envía el enlace', async () => {
  const t = deps(conLeads(), { brevoOk: false });
  const r = await registrarAltaLibro(ENTRADA(datos({ cartas: true })), t.d);
  assert.deepEqual(r, { status: 502, body: { error: 'brevo_failed' } });
  assert.equal(t.correos.length, 0);
});

test('el envío del enlace falla → 502 y no se registra email_sent', async () => {
  const sb = conLeads();
  const t = deps(sb, { correoOk: false });
  const r = await registrarAltaLibro(ENTRADA(datos()), t.d);
  assert.deepEqual(r, { status: 502, body: { error: 'email_send_failed' } });
  assert.deepEqual(sb.tablas.events.map((e) => e.type), ['lead_created']);
});

// ─── Revisión S-15: evidencia de otros formularios, bajas y segunda barrera ───

// Textos que el PORTAL guarda en la misma tabla `leads` (tarot, listas de espera,
// laboratorio, su formulario del libro). Ninguno es la casilla de las Cartas del libro.
const TEXTOS_PORTAL = [
  'Acepto recibir correos de Tejidos de Realidad y conozco la política de privacidad.',
  'Acepto recibir un único aviso cuando la obra esté disponible. Puedo darme de baja en cualquier momento.',
  'Acepto recibir avisos cuando entre un nuevo experimento en el laboratorio.',
  'Acepto recibir la Obertura y futuros capítulos. Puedo darme de baja en cualquier momento.',
  'registro-tarot · doble opt-in',
];

test('cartasAceptadas: solo los textos de antes DEL LIBRO valen como Cartas; los del portal no', () => {
  for (const t of CONSENT_LEGADO_LIBRO) assert.equal(cartasAceptadas(t), true, t);
  assert.equal(cartasAceptadas(`  ${CONSENT_LEGADO_LIBRO[0]}\n`), true, 'con espacios alrededor');
  for (const t of TEXTOS_PORTAL) assert.equal(cartasAceptadas(t), false, t);
  assert.equal(cartasAceptadas(JSON.stringify({ cartas: { version: 'x' } })), false, 'JSON sin autorizacion');
  assert.equal(cartasAceptadas('[1]'), false);
});

test('cartasVigentes: una baja posterior revoca la evidencia de las Cartas', () => {
  const con = evidenciaConsentimiento({ cartas: true });
  assert.equal(cartasVigentes({ consent_text: con, unsubscribed_at: null }), true);
  assert.equal(cartasVigentes({ consent_text: con }), true);
  assert.equal(cartasVigentes({ consent_text: con, unsubscribed_at: '2026-09-01T00:00:00Z' }), false);
  assert.equal(cartasVigentes({ consent_text: CONSENT_LEGADO_LIBRO[1], unsubscribed_at: '2026-09-01' }), false);
  assert.equal(cartasVigentes({ consent_text: evidenciaConsentimiento({ cartas: false }), unsubscribed_at: null }), false);
  for (const nada of [null, undefined, 'texto', 42]) assert.equal(cartasVigentes(nada), false);
});

test('lead existente que se DIO DE BAJA: el enlace sale, pero no se asegura su contacto de marketing', async () => {
  const previa = EXISTENTE({ consent_text: CONSENT_LEGADO_LIBRO[1], unsubscribed_at: '2026-09-01T00:00:00Z' });
  const sb = conLeads([{ ...previa }]);
  const t = deps(sb);
  const r = await registrarAltaLibro(ENTRADA(datos({ cartas: true })), t.d);
  assert.equal(r.status, 201);
  assert.equal(t.contactos.length, 0, 'una nueva alta sin confirmar no deshace la baja');
  assert.equal(t.correos.length, 1);
  assert.deepEqual(sb.tablas.leads, [previa], 'la baja sigue en su fila');
});

test('lead existente del PORTAL (tarot, lista de espera…): marcar las Cartas en un POST sin confirmar no lo suscribe', async () => {
  for (const consent_text of TEXTOS_PORTAL) {
    const previa = EXISTENTE({ consent_text });
    const sb = conLeads([{ ...previa }]);
    const t = deps(sb);
    await registrarAltaLibro(ENTRADA(datos({ cartas: true })), t.d);
    assert.equal(t.contactos.length, 0, consent_text);
    assert.deepEqual(sb.tablas.leads, [previa], 'su evidencia no se reescribe');
    assert.equal(sb.tablas.events[0].metadata.consentimiento_no_aplicado.cartas, CONSENT_TEXT_LIBRO.cartas.version);
  }
});

test('segunda barrera: registrarAltaLibro sin la autorización → 400, sin escribir nada ni enviar correo', async () => {
  for (const autorizacion of [undefined, false, 'on', 'true', 1]) {
    const sb = conLeads();
    const t = deps(sb);
    const cuerpo = { correo: 'ana@correo.co', cartas: true, website: '' };
    if (autorizacion !== undefined) cuerpo.autorizacion = autorizacion;
    const r = await registrarAltaLibro(ENTRADA(cuerpo), t.d);
    assert.deepEqual(r, { status: 400, body: { error: 'invalid_input', issues: ['autorizacion'] } }, String(autorizacion));
    assert.equal(sb.tablas.leads.length, 0);
    assert.equal(sb.tablas.events.length, 0);
    assert.equal(t.contactos.length, 0);
    assert.equal(t.correos.length, 0);
  }
});

// ─── Marcado: lo que ve el lector (lectura del fuente, sin navegador) ─────────

const fuente = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('FormularioTejedor: las dos casillas salen SIN marcar y la de las Cartas no es obligatoria', () => {
  const src = fuente('../components/book/FormularioTejedor.astro');
  const casillas = src.match(/<input\b[^>]*type="checkbox"[^>]*>/g) ?? [];
  assert.equal(casillas.length, 2, 'autorización y Cartas');
  for (const c of casillas) assert.doesNotMatch(c, /\bchecked\b/, c);
  const autorizacion = casillas.find((c) => /name="autorizacion"/.test(c));
  const cartas = casillas.find((c) => /name="cartas"/.test(c));
  assert.ok(autorizacion && cartas, 'los name coinciden con las claves del esquema');
  assert.match(autorizacion, /\brequired\b/);
  assert.doesNotMatch(cartas, /\brequired\b/, 'las Cartas son opcionales');
  const nombre = (src.match(/<input\b[^>]*name="nombre"[^>]*>/g) ?? [])[0];
  assert.ok(nombre);
  assert.doesNotMatch(nombre, /\brequired\b|minlength/, 'el nombre es opcional');
});

test('formulario-tejedor.js: no exige las Cartas y manda la autorización como booleano', () => {
  const js = fuente('../../public/formulario-tejedor.js');
  assert.doesNotMatch(js, /errores\.push\(\['(cartas|nombre)', MENSAJES\.(correoVacio|autorizacion)/);
  assert.doesNotMatch(js, /if \(!cartas\)/, 'desmarcar las Cartas nunca es un error');
  assert.match(js, /autorizacion: true, cartas: cartas/);
});

test('/bienvenido: solo da de alta en la lista de las Cartas según cartasVigentes (evidencia y baja)', () => {
  const src = fuente('../pages/bienvenido.astro');
  assert.match(src, /select\('consent_text, unsubscribed_at'\)/);
  assert.match(src, /conCartas = cartasVigentes\(data\)/);
  assert.match(src, /if \(conCartas && apiKey && listIdRaw\)/);
});
