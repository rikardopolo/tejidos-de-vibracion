#!/usr/bin/env python3
"""
clean_obertura.py
Postprocesa el MDX de la Obertura para:
1. Eliminar el preámbulo de portada/copyright
2. Convertir headings de MAYUSCULAS a Title Case apropiado
3. Convertir ornamentos de texto plano a <Flourish />
4. Limpiar dobles líneas en blanco
5. Reportar palabras antes/después del CorteTejedor
"""
import re
import sys
from pathlib import Path

MDX_PATH = Path("E:/dev/tejidos-de-vibracion/src/content/book/obertura.mdx")

text = MDX_PATH.read_text(encoding="utf-8")

# ─── Separar frontmatter + imports ───────────────────────────────────────────
# El frontmatter termina en el segundo '---'
fm_end = text.index("---", 3) + 3
frontmatter = text[:fm_end]

rest = text[fm_end:]

# Los imports van hasta la primera línea en blanco después de los imports
import_block_end = rest.rfind("\nimport ")
# Encontrar fin del bloque de imports
lines_rest = rest.split("\n")
import_end_idx = 0
for i, line in enumerate(lines_rest):
    if line.startswith("import "):
        import_end_idx = i

imports_section = "\n".join(lines_rest[:import_end_idx+1])
body_raw = "\n".join(lines_rest[import_end_idx+1:])

# ─── Eliminar preámbulo hasta "UMBRAL POÉTICO" ───────────────────────────────
# Buscar el inicio del contenido real
markers = [
    "## Umbral poético",
    "## UMBRAL POÉTICO",
    "UMBRAL POÉTICO",
    "Umbral poético",
]
start_pos = None
for marker in markers:
    pos = body_raw.find(marker)
    if pos != -1:
        if start_pos is None or pos < start_pos:
            start_pos = pos
            found_marker = marker

if start_pos is None:
    # Buscar el primer párrafo de contenido real
    start_pos = body_raw.find("Hay un instante en toda vida")
    if start_pos == -1:
        print("ERROR: No se encontró el inicio del contenido", file=sys.stderr)
        sys.exit(1)
    # Agregar heading
    body_raw = body_raw[start_pos:]
    body_raw = "## Umbral poético\n\n" + body_raw
    start_pos = 0
    found_marker = "Hay un instante..."
else:
    body_raw = body_raw[start_pos:]

print(f"Inicio del contenido encontrado: '{found_marker}'")

# ─── Normalizar ornamentos de texto plano ────────────────────────────────────
# "◆" sueltos → <Flourish kind="diamond" />
# "◇   ◆   ◇" → <Flourish kind="section" />
body_raw = re.sub(r'^◇\s+◆\s+◇\s*$', '<Flourish kind="section" />', body_raw, flags=re.MULTILINE)
body_raw = re.sub(r'^◆\s*$', '<Flourish kind="diamond" />', body_raw, flags=re.MULTILINE)
body_raw = re.sub(r'^◇\s*$', '<Flourish kind="diamond" />', body_raw, flags=re.MULTILINE)

# ─── Normalizar headings en MAYUSCULAS ──────────────────────────────────────
# Algunos headings del DOCX llegan en MAYUSCULAS
def normalize_heading(m):
    prefix = m.group(1)   # "## "
    text   = m.group(2)   # "UMBRAL POÉTICO"
    # Solo convertir si es todo mayúsculas
    if text == text.upper() and len(text) > 2:
        # Title case básico preservando palabras pequeñas
        small = {'de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'o', 'a', 'en', 'con', 'por', 'para', 'al'}
        words = text.lower().split()
        result = []
        for i, w in enumerate(words):
            if i == 0 or w not in small:
                result.append(w.capitalize())
            else:
                result.append(w)
        return prefix + " ".join(result)
    return m.group(0)

body_raw = re.sub(r'^(#{1,4} )(.+)$', normalize_heading, body_raw, flags=re.MULTILINE)

# ─── Limpiar líneas en blanco excesivas ──────────────────────────────────────
body_raw = re.sub(r'\n{4,}', '\n\n\n', body_raw)
body_raw = re.sub(r'\n{3}(<Flourish)', r'\n\n\1', body_raw)
body_raw = re.sub(r'(Flourish [^/]*/>\n)\n{2,}', r'\1\n', body_raw)

# ─── Verificar que CorteTejedor está presente ────────────────────────────────
if "<CorteTejedor" not in body_raw:
    print("WARN: CorteTejedor no encontrado en el cuerpo", file=sys.stderr)
else:
    cut_pos = body_raw.index("<CorteTejedor")
    fragment = body_raw[:cut_pos]
    # Contar palabras del fragmento (sin tags)
    clean = re.sub(r'<[^>]+>', ' ', fragment)
    clean = re.sub(r'\{[^}]+\}', ' ', clean)
    words = len(clean.split())
    print(f"Palabras visibles para Nivel 0: {words}")

# ─── Contar palabras totales ─────────────────────────────────────────────────
clean_total = re.sub(r'<[^>]+>', ' ', body_raw)
clean_total = re.sub(r'\{[^}]+\}', ' ', clean_total)
total_words = len(clean_total.split())
reading_time = max(1, round(total_words / 200))
print(f"Total palabras: {total_words}")
print(f"Reading time: {reading_time} min")

# Actualizar readingTime en frontmatter
frontmatter = re.sub(r'readingTime: \d+', f'readingTime: {reading_time}', frontmatter)

# ─── Ensamblar MDX final ─────────────────────────────────────────────────────
mdx_final = frontmatter + "\n" + imports_section + "\n\n" + body_raw.strip() + "\n"

MDX_PATH.write_text(mdx_final, encoding="utf-8")
print(f"MDX limpio escrito: {MDX_PATH}")
print(f"Lineas totales: {len(mdx_final.splitlines())}")
