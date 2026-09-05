# Láminas retiradas · 2026-09-05

Aquí no se borra nada: se aparta lo que el libro ya no usa, con el motivo escrito.

## `figura-o-5-v1-legacy.{png,avif,webp}`

Mapa conceptual de la Obertura, terminado pero **superado**. Rotula «Niveles de evidencia 1-4»
donde la lámina vigente y el cuerpo del texto dicen «Grados de certeza»: es la nomenclatura
anterior al cambio, no una variante.

Salió de `public/assets/obertura/` porque `public/` se publica: cualquier lámina que viva ahí
es alcanzable desde el sitio, y ésta contradice al texto. Se movió con `git mv`, así que
conserva su historia y sus punteros LFS.

### Un cabo consciente

`src/content/book/obertura.mdx:1178` sigue apuntando a `/assets/obertura/figura-o-5-v1-legacy.png`.
La referencia queda **colgante a propósito**: `src/content/book/` es la Obertura monolítica
archivada, ninguna ruta consume esa colección y el sitio no la construye. Editar material
archivado para perseguir un asset estropea el registro histórico, que es justo lo que ese
fichero conserva. Si algún día se desarchiva `book/`, este es el cabo que hay que atar.

Contexto: fase G3 la identificó como huérfana; Ricardo aprobó retirarla el 2026-09-05.
