import { createHash } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Allowlist del ledger: nombre → SHA-256. Se comprueba en las DOS direcciones
 * (nada de sobra, nada de menos) porque enumerar solo lo prohibido seria una
 * denylist disfrazada: un fichero nuevo con nombre plausible pasaria.
 *
 * Anadir una entrada aqui es una decision consciente; el DDL se propone y revisa
 * en el ledger del portal (ver supabase/README.md).
 */
const LEDGER = {
  '20260628165651_orders.sql':
    '8998e5eb86f448389a0a5d7437059385d6528726dedc31294c697a66460a2951',
  // Candado de entrega (`acceso_enviado_at`) · llego con el PR #95.
  '20260731190000_orders_acceso_enviado_at.sql':
    '10e2decacb644524121197cc538fdcfe33f8a9d75ad06359d78150cee6ea6041',
};

function check(dir) {
  const issues = [];
  const presentes = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name);

  for (const file of presentes) {
    if (!(file in LEDGER)) {
      issues.push(`migracion no autorizada fuera del ledger canonico: ${file}`);
      continue;
    }
    const actual = createHash('sha256').update(readFileSync(join(dir, file))).digest('hex');
    if (actual !== LEDGER[file]) issues.push(`${file} fue modificada`);
  }
  for (const file of Object.keys(LEDGER)) {
    if (!presentes.includes(file)) issues.push(`falta la migracion historica bloqueada: ${file}`);
  }
  return issues;
}

/**
 * Cada caso arranca de una copia limpia del ledger entero, para que uno no
 * herede el destrozo del anterior.
 */
const fixtures = [];
function fixtureLimpia() {
  const raiz = mkdtempSync(join(tmpdir(), 'tdv-supabase-ledger-'));
  fixtures.push(raiz);
  const dir = join(raiz, 'migrations');
  mkdirSync(dir);
  for (const file of Object.keys(LEDGER)) {
    copyFileSync(join(ROOT, 'supabase', 'migrations', file), join(dir, file));
  }
  return dir;
}

function selfTest() {
  const [primera] = Object.keys(LEDGER);
  try {
    // Control positivo: el ledger bueno tiene que pasar. Sin el, un check() que
    // devolviera "algo mal" siempre haria pasar los tres casos negativos.
    if (check(fixtureLimpia()).length) throw new Error('la fixture valida no paso');

    // Las TRES ramas de check(), no solo la primera.
    const ajena = fixtureLimpia();
    writeFileSync(join(ajena, '20990101000000_nueva.sql'), 'select 1;\n');
    if (!check(ajena).some((issue) => issue.includes('no autorizada'))) {
      throw new Error('una migracion ajena NO fue detectada');
    }

    // El SHA es el proposito declarado del guard ("permanece inmutable") y era
    // justo la rama que nadie habia visto fallar nunca.
    const tocada = fixtureLimpia();
    appendFileSync(join(tocada, primera), '\n-- un byte de mas\n');
    if (!check(tocada).some((issue) => issue.includes('fue modificada'))) {
      throw new Error('la canonica MODIFICADA no fue detectada');
    }

    const ausente = fixtureLimpia();
    rmSync(join(ausente, primera));
    if (!check(ausente).some((issue) => issue.includes('falta la migracion'))) {
      throw new Error('la canonica AUSENTE no fue detectada');
    }

    console.log('[supabase-ledger] SELF-TEST OK: ajena, modificada y ausente fallan las tres.');
  } finally {
    for (const raiz of fixtures) rmSync(raiz, { recursive: true, force: true });
  }
}

// El self-test corre SIEMPRE, no tras un flag: un control que solo se ejecuta
// cuando alguien se acuerda de pasar `--self-test` no vigila nada en CI. Cuesta
// milisegundos y es lo unico que demuestra que este guard sabe fallar.
selfTest();

const issues = check(join(ROOT, 'supabase', 'migrations'));
if (issues.length) {
  console.error('[supabase-ledger] FAIL\n- ' + issues.join('\n- '));
  process.exitCode = 1;
} else {
  const n = Object.keys(LEDGER).length;
  console.log(`[supabase-ledger] OK: las ${n} migraciones del ledger permanecen historicas e inmutables.`);
}
