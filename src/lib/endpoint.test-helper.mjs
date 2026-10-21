/**
 * Ejecuta los módulos TS reales con node:test, sin Astro ni variables del proceso.
 * TypeScript ya es una dependencia de desarrollo del libro. Solo transpila tipos,
 * imports y `import.meta.env`; los handlers y sus decisiones se ejecutan intactos.
 * Cada import tiene que estar suministrado explícitamente: ningún cliente real ni
 * fetch puede entrar como respaldo. No registra hooks globales ni escribe archivos.
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';

export function cargarModuloTs(url, dependencias, { env = {}, fetch = sinRed, fuente } = {}) {
  const { outputText, diagnostics } = ts.transpileModule(fuente ?? readFileSync(url, 'utf8'), {
    fileName: url.pathname,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    reportDiagnostics: true,
    transformers: {
      before: [(ctx) => {
        const visitar = (node) => {
          if (ts.isPropertyAccessExpression(node) && node.name.text === 'env'
            && ts.isMetaProperty(node.expression) && node.expression.keywordToken === ts.SyntaxKind.ImportKeyword) {
            return ts.factory.createIdentifier('__entornoAstro');
          }
          return ts.visitEachChild(node, visitar, ctx);
        };
        return (source) => ts.visitNode(source, visitar);
      }],
    },
  });
  const errores = diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error) ?? [];
  if (errores.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errores, {
    getCurrentDirectory: () => '', getCanonicalFileName: (f) => f, getNewLine: () => '\n',
  }));
  const requireFalso = (id) => {
    if (!Object.hasOwn(dependencias, id)) throw new Error(`Import sin doble explícito: ${id}`);
    return dependencias[id];
  };
  const modulo = { exports: {} };
  const ejecutar = new Function('require', 'module', 'exports', 'process', '__entornoAstro', 'fetch', outputText);
  ejecutar(requireFalso, modulo, modulo.exports, { env }, env, fetch);
  return modulo.exports;
}

function sinRed() {
  throw new Error('Salida de red prohibida en las pruebas de endpoints');
}
