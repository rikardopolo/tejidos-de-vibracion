#!/usr/bin/env node
/**
 * render-pdf.mjs · pagina el HTML de impresión a PDF con Vivliostyle y corre un
 * preflight mínimo (Regla de entrega + registro).
 *
 * Requisitos:  pnpm add -D @vivliostyle/cli
 * Uso:
 *   node scripts/render-pdf.mjs <url-o-html> <salida.pdf>
 *   # ej: node scripts/render-pdf.mjs http://localhost:4321/print/cap-2-galileo out/galileo.pdf
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
const run = promisify(execFile);
const require = createRequire(import.meta.url);

const [src, out = "out/tdv.pdf"] = process.argv.slice(2);
if (!src) { console.error("Falta la URL/HTML de origen."); process.exit(1); }

// Resolver el bin JS de @vivliostyle/cli y llamarlo con `node` (sin shell):
// evita el `spawn npx ENOENT` de Windows y permite pasar rutas con espacios
// como argumentos literales (sin comillas).
function vivliostyleBin() {
  const pkgJson = require.resolve("@vivliostyle/cli/package.json");
  const pkg = require("@vivliostyle/cli/package.json");
  const binRel = typeof pkg.bin === "string" ? pkg.bin : pkg.bin.vivliostyle;
  return path.join(path.dirname(pkgJson), binRel);
}

// Chromium para el render. Vivliostyle descarga uno propio, pero esa descarga
// falla en algunos Windows (`spawn UNKNOWN`). Si hay un navegador del sistema
// (o IMPRENTA_BROWSER), se lo pasamos con --executable-browser y evitamos la
// descarga por completo.
function findBrowser() {
  if (process.env.IMPRENTA_BROWSER && existsSync(process.env.IMPRENTA_BROWSER)) {
    return process.env.IMPRENTA_BROWSER;
  }
  const pf = process.env.ProgramFiles || "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const lists = {
    win32: [
      `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
      `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
      `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`,
      path.join(home, ".cache\\puppeteer\\chrome"),
    ],
    darwin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ],
    linux: ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
  };
  for (const c of (lists[process.platform] || [])) {
    if (existsSync(c) && c.endsWith(".exe")) return c;
  }
  return null;
}

// 1 · Paginar a PDF con Vivliostyle (respeta @page de print.css).
//    NO se pasa --style: la ruta /print ya carga print.css vía PrintLayout.
//    Inyectarlo además activaba el modo servidor-local de Vivliostyle (:13000)
//    bajo el cual las URLs /src/... del dev server daban 404. Cargar la página
//    remota directa resuelve su CSS contra su propio origen.
const browser = findBrowser();
const args = [vivliostyleBin(), "build", src, "-o", out];
if (browser) { args.push("--executable-browser", browser); console.log(`Navegador de render: ${browser}`); }
else { console.log("Sin navegador del sistema detectado · Vivliostyle intentará descargar el suyo."); }

try {
  const { stdout, stderr } = await run(process.execPath, args, { maxBuffer: 1024 * 1024 * 64 });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
} catch (e) {
  console.error("Fallo el render:", e.message);
  if (e.stdout) process.stdout.write(e.stdout);
  if (e.stderr) process.stderr.write(e.stderr);
  process.exit(1);
}
console.log(`PDF generado: ${out}`);

// 2 · Preflight mínimo: la Regla de entrega no es negociable.
//    (Sobre HTML de origen si es archivo local; sobre PDF se hace inspección visual.)
const PROHIBIDO = [
  /Nivel\s*[1-4]/i,
  /Carril\s*[AB]\b/,
  /Manual de Estilo/i,
  /\b(pod[eé]s|ten[eé]s|quer[eé]s|sos)\b/i, // voseo
  /#2E74B5|#1F4D78|#5B9BD5/i,               // azules de Office
];
try {
  const text = await readFile(src.replace(/^file:\/\//, ""), "utf8");
  const hits = PROHIBIDO.filter(rx => rx.test(text));
  if (hits.length) {
    console.error("\n⚠️  PREFLIGHT BLOQUEA LA ENTREGA · patrones prohibidos encontrados:");
    hits.forEach(rx => console.error("   ·", rx));
    process.exit(2);
  }
  console.log("Preflight básico: OK (sin vocabulario interno, voseo ni azules Office).");
} catch {
  console.log("Preflight básico: origen no es archivo local · verificar visualmente.");
}
