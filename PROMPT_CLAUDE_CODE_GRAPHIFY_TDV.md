# Prompt Para Claude Code - Grafos TDV Creados

Usa este prompt cuando abras `E:\dev\tejidos-de-vibracion` en Claude Code.

```text
Contexto: En `E:\dev\tejidos-de-vibracion` ya existen grafos Graphify nuevos por dominio. No generes un grafo gigante del repo completo y no uses el `graphify-out/` historico de raiz como mapa maestro actual.

Grafo de docs/canon tecnico:
E:\dev\tejidos-de-vibracion\docs\graphify-out

Grafo de runtime Astro del libro:
E:\dev\tejidos-de-vibracion\graphify-runtime-out

Grafo de contenido editorial renderizado:
E:\dev\tejidos-de-vibracion\graphify-content-out

Grafo de assets publicos:
E:\dev\tejidos-de-vibracion\public\graphify-out

Grafo de infraestructura y pipeline:
E:\dev\tejidos-de-vibracion\graphify-infra-out

Cada salida contiene `graph.html`, `graph.json` y `GRAPH_REPORT.md`. Consulta primero el `GRAPH_INDEX.md` de la raiz para el inventario completo y los conteos.

Reglas:
- No modifiques canon editorial ni MDX desde este flujo.
- No incluyas `graphify-out`, `node_modules`, `.git`, `.astro`, `.vercel`, `out` ni caches como fuente.
- Trata aristas `INFERRED` como hipotesis; trata handlers genericos como `GET`/`POST` con cautela.
- Para investigar una tarea del sitio, abre primero el grafo del dominio correspondiente antes de editar codigo.
- No hagas commit, push ni deploy sin aprobacion explicita de Ricardo.
```
