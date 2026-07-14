# Graph Index - Tejidos de Vibracion

Ruta actual: `E:\dev\tejidos-de-vibracion`

Este indice lista los grafos nuevos por dominio para `tejidos-de-vibracion`. El objetivo es que Claude Code o cualquier agente consulte mapas acotados, no un grafo gigante del repo.

Reglas aplicadas: no se modifico canon editorial ni MDX; se excluyeron `graphify-out`, `node_modules`, `.git`, `.astro`, `.vercel`, `out` y caches; el `graphify-out/` historico de raiz se conserva solo como referencia local antigua.

## Grafos Generados

| Dominio | Salida | Nodos | Aristas | Comunidades | Archivos |
|---|---|---:|---:|---:|---:|
| TDV Docs / Canon Tecnico del Libro | `E:\dev\tejidos-de-vibracion\docs\graphify-out` | 109 | 139 | 7 | 6 |
| TDV Runtime Astro del Libro | `E:\dev\tejidos-de-vibracion\graphify-runtime-out` | 362 | 868 | 17 | 87 |
| TDV Contenido Editorial Renderizado | `E:\dev\tejidos-de-vibracion\graphify-content-out` | 510 | 1708 | 11 | 56 |
| TDV Assets Publicos del Libro | `E:\dev\tejidos-de-vibracion\public\graphify-out` | 268 | 573 | 38 | 181 |
| TDV Infraestructura y Pipeline | `E:\dev\tejidos-de-vibracion\graphify-infra-out` | 188 | 272 | 8 | 14 |

## Como Usarlos

- Abre cada `graph.html` en navegador para explorar comunidades y nodos visualmente.
- Usa cada `graph.json` como entrada GraphRAG o como inventario estructurado para agentes.
- Lee cada `GRAPH_REPORT.md` para God Nodes, Surprising Connections y Suggested Questions.

## Orden Recomendado De Consulta

1. `graphify-content-out` para entender el libro renderizado por Obertura y capitulos.
2. `graphify-runtime-out` para entender como Astro, layouts, APIs y reader publican ese contenido.
3. `public/graphify-out` para revisar familias visuales y scripts publicos.
4. `graphify-infra-out` para dependencias, scripts y deploy config.
5. `docs/graphify-out` para auditorias y canon tecnico local.

## Advertencias

- El `graphify-out/` de raiz ya existia antes de este ciclo; no lo trates como el grafo maestro actual.
- Las conexiones `INFERRED` son hipotesis utiles, no decisiones canonicas.
- Para cambios editoriales, vuelve siempre al corpus fuente; no edites MDX desde el grafo.
