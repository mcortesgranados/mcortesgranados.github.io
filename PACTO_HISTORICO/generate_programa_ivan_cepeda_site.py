from __future__ import annotations

from collections import defaultdict
from html import escape
from pathlib import Path
import math
import re
import shutil
import unicodedata


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "Programa_Gobierno_Ivan_Cepeda.txt"
INDEX_FILE = ROOT / "index.html"
STYLES_FILE = ROOT / "styles.css"
CHAPTERS_DIR = ROOT / "capitulos"


THEMES = [
    {
        "id": "apertura",
        "label": "Apertura y campaña",
        "emoji": "🚩",
        "accent": "#d84315",
        "description": "Discursos de lanzamiento, balance político y mensajes de movilización electoral.",
        "keywords": [
            "vengo a presentar mi nombre",
            "unidad y victoria",
            "vamos a ganar",
            "vamos a triunfar",
            "consulta",
            "bancada parlamentaria",
            "victoria",
            "preservando los principios",
        ],
    },
    {
        "id": "etica",
        "label": "Ética y anticorrupción",
        "emoji": "⚖️",
        "accent": "#1565c0",
        "description": "Revolución ética, verdad pública, austeridad republicana y lucha frontal contra la macrocorrupción.",
        "keywords": [
            "corrupción",
            "ética",
            "verdad",
            "austeridad",
            "odio",
            "espectáculo",
            "mandar obedeciendo",
        ],
    },
    {
        "id": "paz",
        "label": "Paz y víctimas",
        "emoji": "🕊️",
        "accent": "#2e7d32",
        "description": "Memoria, víctimas, buscadoras, justicia, no repetición y construcción integral de paz.",
        "keywords": [
            "paz",
            "víctimas",
            "madres",
            "genocidio",
            "buscadoras",
            "soacha",
        ],
    },
    {
        "id": "democracia",
        "label": "Democracia y poder popular",
        "emoji": "🗳️",
        "accent": "#7b1fa2",
        "description": "Participación, derechos políticos, cambio institucional y fortalecimiento del poder ciudadano.",
        "keywords": [
            "democracia",
            "derechos políticos",
            "hacer política",
            "pacto histórico",
            "votación",
            "parlamentaria",
        ],
    },
    {
        "id": "social",
        "label": "Justicia social",
        "emoji": "🤝",
        "accent": "#00897b",
        "description": "Igualdad sustantiva, política social, seguridad humana y superación de la pobreza.",
        "keywords": [
            "política social",
            "pobreza",
            "igualdad",
            "salario vital",
            "seguridad humana",
        ],
    },
    {
        "id": "agraria",
        "label": "Campo y revolución agraria",
        "emoji": "🌱",
        "accent": "#558b2f",
        "description": "Reforma agraria, agua, campesinado, soberanía territorial y producción para la vida.",
        "keywords": [
            "agraria",
            "campesin",
            "agua",
            "territorio",
            "soberanía",
        ],
    },
    {
        "id": "territorios",
        "label": "Territorios y ciudades",
        "emoji": "🗺️",
        "accent": "#ef6c00",
        "description": "Encuentros regionales, recorridos de campaña y propuestas desde los territorios de Colombia.",
        "keywords": [
            "santa marta",
            "villavicencio",
            "cali",
            "bogotá",
            "montería",
            "valledupar",
            "pasto",
            "medellín",
            "tumaco",
            "puerto tejada",
            "buenaventura",
            "amazonía",
            "riohacha",
            "territorios",
        ],
    },
    {
        "id": "diversidad",
        "label": "Pueblos, mujeres y antirracismo",
        "emoji": "🌈",
        "accent": "#ad1457",
        "description": "Reconocimiento de pueblos indígenas, comunidades afrodescendientes, mujeres y luchas antirracistas.",
        "keywords": [
            "indígenas",
            "wiwa",
            "kankuamo",
            "afrodescendiente",
            "antirracista",
            "mujeres",
            "pueblos",
        ],
    },
    {
        "id": "ambiente",
        "label": "Naturaleza y vida",
        "emoji": "🌿",
        "accent": "#00695c",
        "description": "Defensa ambiental, animales, biodiversidad y desarrollo sostenible con justicia territorial.",
        "keywords": [
            "animales",
            "ambiental",
            "vida y de la naturaleza",
            "desarrollo territorial sostenible",
            "tierra del viento",
        ],
    },
    {
        "id": "internacional",
        "label": "Mirada internacional",
        "emoji": "🌎",
        "accent": "#3949ab",
        "description": "Política exterior autónoma, solidaridad con migrantes y lectura del escenario global.",
        "keywords": [
            "migrantes",
            "méxico",
            "global",
            "exterior",
            "neofascista",
        ],
    },
]


TITLE_REPLACEMENTS = [
    ("SIGNIFICAUNA", "SIGNIFICA UNA"),
    ("ENCUENTROCON", "ENCUENTRO CON"),
    ("POLÍTICAEXTERIOR", "POLÍTICA EXTERIOR"),
    ("MODELOSDE", "MODELOS DE"),
    ("IGUALDADSUSTANTIVA", "IGUALDAD SUSTANTIVA"),
    ("CEPEDAEN", "CEPEDA EN"),
    ("CEPEDATRAS", "CEPEDA TRAS"),
    ("VAMOS CONLA", "VAMOS CON LA"),
    ("CONLÍDERES", "CON LÍDERES"),
    ("TERRITORIOSDE", "TERRITORIOS DE"),
    ("REVOLUCIÓNPOLÍTICA", "REVOLUCIÓN POLÍTICA"),
    ("LIBERALESCON", "LIBERALES CON"),
    ("PUEBLOCON", "PUEBLO CON"),
    ("NUESTROPROGRAMA", "NUESTRO PROGRAMA"),
    ("AGRARIAA", "AGRARIA A"),
    ("AGUACOMO", "AGUA COMO"),
    ("GLOBALPODRÁ", "GLOBAL PODRÁ"),
    ("SOBERANÍADE", "SOBERANÍA DE"),
    ("FORTALECERLA", "FORTALECER LA"),
    ("LOGROSEN", "LOGROS EN"),
    ("CONLAS", "CON LAS"),
    ("COMUNIDADESY", "COMUNIDADES Y"),
    ("LATRANSFORMACIÓN", "LA TRANSFORMACIÓN"),
    ("REBELIÓNCIUDADANA", "REBELIÓN CIUDADANA"),
    ("GANAREN", "GANAR EN"),
    ("PAZY", "PAZ Y"),
    ("FUERZADE", "FUERZA DE"),
    ("TRAMPASDE", "TRAMPAS DE"),
    ("DETENERLA", "DETENER LA"),
    ("PUEBLO,EN", "PUEBLO, EN"),
    ("GANAR,PERO", "GANAR, PERO"),
    ("MARZOVAMOS", "MARZO VAMOS"),
    ("REVOLUCIÓNURBANA", "REVOLUCIÓN URBANA"),
    ("REVOLUCIÓNÉTICA", "REVOLUCIÓN ÉTICA"),
    ("APOYOA", "APOYO A"),
    ("HUMANACOMO", "HUMANA COMO"),
    ("PROTAGONISMODE", "PROTAGONISMO DE"),
    ("ENFRENTAREL", "ENFRENTAR EL"),
    ("VERDADDE", "VERDAD DE"),
    ("ANTIRRACISTAY", "ANTIRRACISTA Y"),
    ("POLÍTICADEL", "POLÍTICA DEL"),
    ("TERRITORIALSOSTENIBLE", "TERRITORIAL SOSTENIBLE"),
    ("ANIMALESY", "ANIMALES Y"),
    ("PROSPERIDADDE", "PROSPERIDAD DE"),
]


BODY_START_MARKERS = [
    "El ",
    "La ",
    "Las ",
    "Los ",
    "Queridas",
    "Queridos",
    "Querida",
    "Querido",
    "Recibo",
    "Me ",
    "Como ",
    "Nuestro",
    "Nuestra",
    "A ",
    "He ",
    "Este ",
    "Esta ",
    "Por ",
    "Compañeras",
    "Compañeros",
    "Hoy ",
    "Gracias",
    "Desde ",
]


def strip_accents(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def normalize(text: str) -> str:
    return "".join(ch for ch in strip_accents(text).casefold() if ch.isalnum())


def normalize_with_map(text: str) -> tuple[str, list[int]]:
    chars: list[str] = []
    mapping: list[int] = []
    for index, char in enumerate(text):
        normalized = strip_accents(char).casefold()
        for out in normalized:
            if out.isalnum():
                chars.append(out)
                mapping.append(index)
    return "".join(chars), mapping


def slugify(text: str) -> str:
    base = strip_accents(text).lower()
    base = re.sub(r"[^a-z0-9]+", "-", base)
    return base.strip("-")


def beautify_title(raw_title: str) -> str:
    title = re.sub(r"\s+", " ", raw_title).strip()
    title = re.sub(r"([,:;?])(?=[A-ZÁÉÍÓÚÑ])", r"\1 ", title)
    for old, new in TITLE_REPLACEMENTS:
        title = title.replace(old, new)
    title = title.replace("¿ ", "¿").replace("¡ ", "¡")
    title = re.sub(r"\s+([,.;:?])", r"\1", title)
    if title == "INTRODUCCIÓN":
        return "Introducción"
    return title


def parse_toc(text: str) -> list[dict[str, object]]:
    raw_lines = text.splitlines()
    start = next(i for i, line in enumerate(raw_lines) if "Í N D I C E" in line)
    items: list[dict[str, object]] = []
    buffer: list[str] = []

    for line in raw_lines[start + 1 :]:
        current = line.strip()
        if not current or current.startswith("|"):
            continue
        current = (
            current.replace("PROGRAMA DE GOBIERNO", "")
            .replace("DE IVÁN CEPEDA CASTRO", "")
            .replace("2026-2030", "")
            .strip()
        )
        if not current:
            continue

        match = re.match(r"^(.*?)(?:\.{5,}|\s+)(\d+)(Introducción)?$", current)
        if match:
            buffer.append(match.group(1).strip())
            title = re.sub(r"\.{2,}", " ", " ".join(buffer))
            title = re.sub(r"\s+", " ", title).strip()
            items.append(
                {
                    "raw_title": title,
                    "title": beautify_title(title),
                    "page": int(match.group(2)),
                }
            )
            buffer = []
            if match.group(3):
                break
        else:
            buffer.append(current)

    return items


def locate_sections(text: str, chapters: list[dict[str, object]]) -> None:
    normalized_text, mapping = normalize_with_map(text)
    join_marker = normalize(
        f"{chapters[-1]['raw_title']}{chapters[-1]['page']}{chapters[0]['raw_title']}"
    )
    join_pos = normalized_text.find(join_marker)
    if join_pos == -1:
        raise RuntimeError("No se pudo ubicar el inicio del cuerpo del documento.")

    cursor = join_pos + len(normalize(f"{chapters[-1]['raw_title']}{chapters[-1]['page']}"))
    positions: list[int] = []

    for chapter in chapters:
        needle = normalize(str(chapter["raw_title"]))
        pos = normalized_text.find(needle, cursor)
        if pos == -1:
            raise RuntimeError(f"No se pudo ubicar el capítulo: {chapter['title']}")
        positions.append(pos)
        cursor = pos + len(needle)

    for index, chapter in enumerate(chapters):
        start = mapping[positions[index]]
        end = mapping[positions[index + 1]] if index + 1 < len(positions) else len(text)
        chapter["raw_section"] = text[start:end]


def preprocess_section(raw_section: str) -> str:
    section = raw_section.replace("\r\n", "\n")
    section = re.sub(r"(?<!\n)(PROGRAMA DE GOBIERNO)", r"\n\1", section)
    section = re.sub(r"(?<!\n)(DE IVÁN CEPEDA CASTRO)", r"\n\1", section)
    section = re.sub(r"(?<!\n)(2026-2030)", r"\n\1", section)
    section = re.sub(r"(\|\s*\d+\s*\|)", lambda m: "\n" + re.sub(r"\s+", "", m.group(1)) + "\n", section)
    section = section.replace("\u200b", "")
    return section


def split_location_and_rest(line: str) -> tuple[str | None, str]:
    compact = re.sub(r"\s+", " ", line.strip())
    if not compact:
        return None, ""

    for marker in BODY_START_MARKERS:
        pos = compact.find(marker)
        if pos > 0:
            location = compact[:pos].strip()
            if "," in location and len(location) <= 70 and len(location.split()) <= 8:
                return location.rstrip(" ."), compact[pos:].strip()

    if "," in compact and len(compact) <= 70 and not any(p in compact for p in ".:;!?"):
        return compact.rstrip(" ."), ""

    return None, compact


def clean_line(line: str) -> str:
    compact = re.sub(r"\s+", " ", line.strip())
    compact = compact.replace("“", '"').replace("”", '"').replace("’", "'")
    compact = re.sub(r"\s+([,.;:?!])", r"\1", compact)
    return compact


def is_header_noise(line: str) -> bool:
    return (
        not line
        or line == "PROGRAMA DE GOBIERNO"
        or line == "DE IVÁN CEPEDA CASTRO"
        or line == "2026-2030"
        or re.fullmatch(r"\|\d+\|", line) is not None
    )


def is_upperish(line: str) -> bool:
    letters = [char for char in line if char.isalpha()]
    if not letters:
        return False
    uppercase = sum(char.isupper() for char in letters)
    return uppercase / len(letters) > 0.84


def likely_subheading(line: str) -> bool:
    text = line.strip()
    if not text or len(text) > 90:
        return False
    if re.match(r"^\d+\.\s+", text):
        return True
    if text.endswith(":") and len(text) < 72 and text[0].isupper():
        return True
    if text.endswith("?") and len(text) < 72:
        return True
    return is_upperish(text) and len(text) < 80


def merge_lines(lines: list[str]) -> str:
    merged = ""
    for raw in lines:
        line = clean_line(raw)
        if not line:
            continue
        if not merged:
            merged = line
            continue
        if re.search(r"[A-Za-zÁÉÍÓÚÑáéíóúñ]-$", merged) and line[:1].islower():
            merged = merged[:-1] + line
        elif line.startswith((",", ".", ";", ":", "?", "!", ")")):
            merged += line
        else:
            merged += " " + line
    return re.sub(r"[¿¡]+$", "", merged).strip()


def should_break_paragraph(previous_line: str, current_line: str) -> bool:
    if not previous_line or not current_line:
        return False
    if re.search(r"[.!?]$", previous_line) and current_line[:1].isupper():
        return True
    if previous_line.endswith(":") and len(previous_line) < 90 and current_line[:1].isupper():
        return True
    return False


def section_to_blocks(raw_section: str, raw_title: str) -> tuple[str | None, list[tuple[str, object]], str]:
    section = preprocess_section(raw_section)
    lines = [line.strip() for line in section.splitlines()]
    title_norm = normalize(raw_title)
    accumulator = ""
    consumed = 0

    for index, line in enumerate(lines):
        accumulator += normalize(line)
        consumed = index + 1
        if title_norm in accumulator:
            break

    lines = lines[consumed:]
    location: str | None = None
    cleaned_lines: list[str] = []

    for line in lines:
        if is_header_noise(line):
            continue
        if location is None:
            location_candidate, remainder = split_location_and_rest(line)
            if location_candidate:
                location = location_candidate
                if remainder:
                    cleaned_lines.append(remainder)
                continue
        cleaned_lines.append(line)

    blocks: list[tuple[str, object]] = []
    paragraph_lines: list[str] = []
    current_list: list[str] = []
    current_item_lines: list[str] = []

    def flush_paragraph() -> None:
        nonlocal paragraph_lines
        text_block = merge_lines(paragraph_lines)
        if text_block:
            blocks.append(("p", text_block))
        paragraph_lines = []

    def flush_item() -> None:
        nonlocal current_item_lines
        item_text = merge_lines(current_item_lines)
        if item_text:
            current_list.append(item_text)
        current_item_lines = []

    def flush_list() -> None:
        nonlocal current_list
        flush_item()
        if current_list:
            blocks.append(("ul", current_list))
        current_list = []

    for line in cleaned_lines:
        current = clean_line(line)
        if not current:
            flush_paragraph()
            flush_list()
            continue

        if current == "***":
            flush_paragraph()
            flush_list()
            blocks.append(("divider", "✦"))
            continue

        if current.startswith("•"):
            flush_paragraph()
            flush_item()
            current_item_lines = [current[1:].strip()]
            continue

        if current_item_lines:
            if likely_subheading(current):
                flush_list()
                blocks.append(("h3", current))
            else:
                current_item_lines.append(current)
            continue

        if likely_subheading(current):
            flush_paragraph()
            flush_list()
            blocks.append(("h3", current))
            continue

        if paragraph_lines and should_break_paragraph(paragraph_lines[-1], current):
            flush_paragraph()

        paragraph_lines.append(current)

    flush_paragraph()
    flush_list()

    plain_text = " ".join(
        value if kind in {"p", "h3"} else " ".join(value)
        for kind, value in blocks
        if kind != "divider"
    )
    return location, blocks, plain_text


def infer_theme(title: str) -> dict[str, object]:
    title_norm = strip_accents(title).casefold()
    for theme in THEMES:
        if any(strip_accents(keyword).casefold() in title_norm for keyword in theme["keywords"]):
            return theme
    return THEMES[0]


def render_blocks(blocks: list[tuple[str, object]]) -> str:
    html_parts: list[str] = []
    for kind, value in blocks:
        if kind == "p":
            html_parts.append(f"<p>{escape(str(value))}</p>")
        elif kind == "h3":
            html_parts.append(f"<h3>{escape(str(value))}</h3>")
        elif kind == "divider":
            html_parts.append('<div class="section-divider" aria-hidden="true">✦ ✦ ✦</div>')
        elif kind == "ul":
            items = "".join(f"<li>{escape(item)}</li>" for item in value)
            html_parts.append(f'<div class="note solid"><ul>{items}</ul></div>')
    return "\n".join(html_parts)


def excerpt(text: str, max_length: int = 190) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= max_length:
        return compact
    clipped = compact[: max_length - 1].rsplit(" ", 1)[0]
    return clipped + "…"


def reading_time(text: str) -> int:
    words = len(re.findall(r"\w+", text, flags=re.UNICODE))
    return max(1, math.ceil(words / 180))


def chapter_filename(number: int, title: str) -> str:
    return f"{number:02d}-{slugify(title)}.html"


def build_chapter_data(text: str) -> list[dict[str, object]]:
    chapters = parse_toc(text)
    locate_sections(text, chapters)

    total = len(chapters)
    for index, chapter in enumerate(chapters, start=1):
        location, blocks, plain_text = section_to_blocks(
            str(chapter["raw_section"]), str(chapter["raw_title"])
        )
        theme = infer_theme(str(chapter["title"]))
        chapter["number"] = index
        chapter["total"] = total
        chapter["location"] = location
        chapter["blocks"] = blocks
        chapter["plain_text"] = plain_text
        chapter["excerpt"] = excerpt(plain_text)
        chapter["minutes"] = reading_time(plain_text)
        chapter["theme"] = theme
        chapter["filename"] = chapter_filename(index, str(chapter["title"]))

    return chapters


def make_anchor(theme: dict[str, object]) -> str:
    return f"tema-{theme['id']}"


def render_index(chapters: list[dict[str, object]]) -> str:
    groups: defaultdict[str, list[dict[str, object]]] = defaultdict(list)
    for chapter in chapters:
        groups[str(chapter["theme"]["id"])].append(chapter)

    sections: list[str] = []
    pills: list[str] = []
    for theme in THEMES:
        theme_chapters = groups.get(theme["id"], [])
        if not theme_chapters:
            continue
        pills.append(
            f'<a class="pill" href="#{make_anchor(theme)}">{theme["emoji"]} {escape(str(theme["label"]))}</a>'
        )

        cards: list[str] = []
        for chapter in theme_chapters:
            location_html = (
                f"<span>📍 {escape(str(chapter['location']))}</span>"
                if chapter["location"]
                else "<span>📍 Documento programático</span>"
            )
            cards.append(
                f"""
                <a class="chapter-card" href="capitulos/{escape(str(chapter['filename']))}" style="--accent:{theme['accent']}">
                  <div class="chapter-card-top">
                    <span class="chapter-number">Cap. {int(chapter['number']):02d}</span>
                    <span class="tag">{theme['emoji']} {escape(str(theme['label']))}</span>
                  </div>
                  <h3>{escape(str(chapter['title']))}</h3>
                  <p>{escape(str(chapter['excerpt']))}</p>
                  <div class="chapter-meta">
                    {location_html}
                    <span>📄 pág. {chapter['page']}</span>
                    <span>⏱️ {chapter['minutes']} min</span>
                  </div>
                </a>
                """
            )

        sections.append(
            f"""
            <section id="{make_anchor(theme)}" class="theme-section">
              <div class="theme-header" style="--accent:{theme['accent']}">
                <div>
                  <p class="eyebrow">{theme['emoji']} Eje temático</p>
                  <h2>{escape(str(theme['label']))}</h2>
                  <p>{escape(str(theme['description']))}</p>
                </div>
                <div class="theme-count">{len(theme_chapters)} capítulos</div>
              </div>
              <div class="chapter-grid">
                {''.join(cards)}
              </div>
            </section>
            """
        )

    total_pages = int(chapters[-1]["page"]) - int(chapters[0]["page"]) + 1
    return f"""<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Programa de Gobierno de Iván Cepeda 2026-2030</title>
  <meta name="description" content="Índice interactivo del Programa de Gobierno de Iván Cepeda 2026-2030, con una página independiente por capítulo.">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <section class="hero hero-index">
      <div class="hero-badge">📘 Índice interactivo</div>
      <h1>Programa de Gobierno de Iván Cepeda 2026-2030</h1>
      <p class="lead">Sitio estático generado desde el archivo fuente, con cada capítulo en su propia página, navegación clara y una lectura más cómoda del documento completo.</p>
      <div class="hero-stats">
        <div class="hero-stat"><strong>{len(chapters)}</strong><span>capítulos</span></div>
        <div class="hero-stat"><strong>{total_pages}</strong><span>páginas fuente</span></div>
        <div class="hero-stat"><strong>{sum(1 for theme in THEMES if groups.get(theme['id']))}</strong><span>ejes temáticos</span></div>
      </div>
      <div class="note">
        <p><strong>🧭 Ruta de lectura.</strong> El índice aparece primero y cada item abre su propia página con navegación anterior y siguiente.</p>
        <p><strong>✨ Estilo.</strong> Se respetó tu CSS base y se amplió con portada, tarjetas, secciones temáticas, etiquetas y emojis para que la navegación sea más visual.</p>
      </div>
      <div class="nav-pills">
        {''.join(pills)}
      </div>
    </section>

    {''.join(sections)}

    <div class="footer">Fuente: Programa_Gobierno_Ivan_Cepeda.txt · Sitio generado automáticamente en {escape(str(ROOT.name))}</div>
  </div>
</body>
</html>
"""


def render_chapter_page(
    chapter: dict[str, object],
    previous_chapter: dict[str, object] | None,
    next_chapter: dict[str, object] | None,
) -> str:
    theme = chapter["theme"]
    location_html = (
        f"<p><strong>📍 Lugar.</strong> {escape(str(chapter['location']))}</p>"
        if chapter["location"]
        else "<p><strong>📍 Lugar.</strong> Documento programático</p>"
    )

    def nav_card(label: str, target: dict[str, object] | None, fallback_href: str) -> str:
        if not target:
            return f'<a class="nav-card disabled" href="{fallback_href}"><span>{label}</span><strong>Volver al índice</strong></a>'
        return (
            f'<a class="nav-card" href="{escape(str(target["filename"]))}">'
            f"<span>{label}</span>"
            f"<strong>{escape(str(target['title']))}</strong>"
            "</a>"
        )

    return f"""<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{escape(str(chapter['title']))} | Programa de Gobierno de Iván Cepeda</title>
  <meta name="description" content="{escape(str(chapter['excerpt']))}">
  <link rel="stylesheet" href="../styles.css">
</head>
<body>
  <div class="container">
    <div class="breadcrumbs">
      <a href="../index.html">🏠 Índice</a>
      <span>/</span>
      <span>{theme['emoji']} {escape(str(theme['label']))}</span>
    </div>

    <section class="hero hero-chapter" style="--accent:{theme['accent']}">
      <div class="hero-badge">{theme['emoji']} {escape(str(theme['label']))}</div>
      <p class="eyebrow">Capítulo {int(chapter['number']):02d} de {int(chapter['total']):02d} · Página fuente {chapter['page']}</p>
      <h1>{escape(str(chapter['title']))}</h1>
      <div class="row">
        <div class="col">
          <div class="note">
            <p><strong>📌 Foco del capítulo.</strong> {escape(str(theme['description']))}</p>
            <p><strong>🧾 Lectura rápida.</strong> {escape(str(chapter['excerpt']))}</p>
          </div>
        </div>
        <div class="col">
          <div class="important">
            {location_html}
            <p><strong>⏱️ Tiempo estimado.</strong> {chapter['minutes']} minutos</p>
            <p><strong>📄 Fuente.</strong> Programa_Gobierno_Ivan_Cepeda.txt</p>
          </div>
        </div>
      </div>
    </section>

    <article class="reading-panel chapter-body">
      {render_blocks(chapter['blocks'])}
    </article>

    <nav class="chapter-nav">
      {nav_card("⬅️ Anterior", previous_chapter, "../index.html")}
      <a class="nav-card nav-center" href="../index.html"><span>📚 Índice</span><strong>Volver al listado completo</strong></a>
      {nav_card("Siguiente ➡️", next_chapter, "../index.html")}
    </nav>

    <div class="footer">Capítulo {int(chapter['number']):02d} · Programa de Gobierno de Iván Cepeda 2026-2030</div>
  </div>
</body>
</html>
"""


def build_styles() -> str:
    return """/* Base solicitada por el usuario */
body { font-family: 'Segoe UI', Arial, sans-serif; background: #fafbfc; color: #23272f; margin: 0; padding: 0; }
.container { max-width: 950px; margin: 40px auto; background: #fff; box-shadow: 0 8px 32px rgba(0,0,0,0.08); border-radius: 10px; padding: 32px 40px; }
h1 { color: #1565c0; }
h2 { color: #2e7d32; margin-top: 32px; }
h3 { color: #7b1fa2; margin-top: 24px; }
.note { background: #e3f2fd; border-left: 4px solid #1976d2; padding: 16px 20px; margin: 18px 0; border-radius: 7px; }
.note ul { list-style: disc inside; margin: 0; padding-left: 1.2em; }
.note li { margin-bottom: 3px; line-height: 1.35; }
.note p { margin: 0 0 6px 0; line-height: 1.5; }
.footer { text-align: right; color: #888; font-size: 1em; margin-top: 40px; }
.tag { background: #e3f2fd; color: #1565c0; border-radius: 4px; padding: 3px 8px; margin-left: 6px; font-size: 0.95em; }
dt { color: #2e7d32; font-weight: bold; margin-top: 10px; }
dd { margin-bottom: 10px; }
.params table { border-collapse: collapse; width: 100%; margin: 10px 0; }
.params th, .params td { border: 1px solid #ccc; padding: 6px; }
.important { background: #fffde7; border-left: 4px solid #fbc02d; padding: 12px 18px; margin: 18px 0; border-radius: 5px; }
.sideEffects ul, .solid ul { margin: 0; padding-left: 20px; }
@media (max-width: 600px) { .container { padding: 16px 8px; } }
pre { background: #f6f8fa; padding: 14px; border-radius: 8px; overflow: auto; font-size: 0.92em; }
code { font-family: Consolas, 'Courier New', monospace; }
.row { display:flex; gap:20px; flex-wrap:wrap; }
.col { flex:1 1 420px; }
.endpoint { border: 1px solid #e0e0e0; padding: 12px 14px; border-radius: 8px; background: #fff; box-shadow: 0 3px 8px rgba(0,0,0,0.04); }
.json { white-space: pre; font-family: Consolas, 'Courier New', monospace; font-size: 0.95em; }
.success { color: #2e7d32; font-weight: 600; }
.error { color: #c62828; font-weight: 600; }

:root {
  --ink: #1e293b;
  --muted: #5f6b7a;
  --line: #d9e2ec;
  --soft-blue: #eef6ff;
  --paper: #ffffff;
  --shadow: 0 18px 40px rgba(12, 35, 64, 0.10);
}

html { scroll-behavior: smooth; }

body {
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(21, 101, 192, 0.10), transparent 30%),
    radial-gradient(circle at top right, rgba(46, 125, 50, 0.10), transparent 28%),
    linear-gradient(180deg, #f9fbff 0%, #f7fbf7 48%, #fcfbf6 100%);
}

a { color: #1565c0; text-decoration: none; }
a:hover { text-decoration: underline; }

.hero {
  position: relative;
  overflow: hidden;
  padding: 28px;
  border-radius: 18px;
  background:
    linear-gradient(135deg, rgba(21, 101, 192, 0.10), rgba(46, 125, 50, 0.08) 55%, rgba(251, 192, 45, 0.12)),
    #ffffff;
  border: 1px solid rgba(21, 101, 192, 0.12);
  box-shadow: var(--shadow);
}

.hero::before {
  content: "";
  position: absolute;
  inset: -40% auto auto 72%;
  width: 280px;
  height: 280px;
  background: radial-gradient(circle, rgba(21, 101, 192, 0.16), transparent 72%);
  pointer-events: none;
}

.hero-index { margin-bottom: 28px; }
.hero-chapter { margin-bottom: 28px; }

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(21, 101, 192, 0.12);
  color: #0d47a1;
  font-weight: 700;
  margin-bottom: 14px;
}

.eyebrow {
  margin: 0 0 10px;
  color: var(--muted);
  font-size: 0.95rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.lead {
  font-size: 1.08rem;
  line-height: 1.7;
  color: var(--ink);
  max-width: 780px;
}

.hero h1 {
  font-size: clamp(2rem, 3vw, 3rem);
  line-height: 1.1;
  margin: 0 0 12px;
}

.hero-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin: 22px 0;
}

.hero-stat {
  min-width: 150px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(21, 101, 192, 0.10);
}

.hero-stat strong {
  display: block;
  font-size: 1.55rem;
  color: #0d47a1;
}

.hero-stat span {
  color: var(--muted);
  font-size: 0.95rem;
}

.nav-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid rgba(21, 101, 192, 0.14);
  box-shadow: 0 6px 18px rgba(21, 101, 192, 0.08);
  font-weight: 600;
}

.theme-section { margin-top: 34px; }

.theme-header {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-end;
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 2px solid var(--line);
}

.theme-header h2 {
  margin: 0 0 8px;
  color: var(--accent, #2e7d32);
}

.theme-header p {
  margin: 0;
  color: var(--muted);
  line-height: 1.6;
}

.theme-count {
  white-space: nowrap;
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--soft-blue);
  color: #0d47a1;
  font-weight: 700;
}

.chapter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 18px;
}

.chapter-card {
  display: block;
  height: 100%;
  padding: 18px;
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,250,252,0.98)),
    var(--paper);
  border: 1px solid rgba(21, 101, 192, 0.10);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
  border-top: 4px solid var(--accent, #1565c0);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.chapter-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 18px 34px rgba(15, 23, 42, 0.12);
  text-decoration: none;
}

.chapter-card-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}

.chapter-number {
  font-size: 0.9rem;
  color: var(--muted);
  font-weight: 700;
}

.chapter-card h3 {
  margin: 0 0 10px;
  color: #1b3a63;
  line-height: 1.3;
  font-size: 1.08rem;
}

.chapter-card p {
  color: #44566c;
  line-height: 1.6;
  margin: 0 0 14px;
}

.chapter-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: var(--muted);
  font-size: 0.92rem;
}

.chapter-meta span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.breadcrumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  color: var(--muted);
  margin-bottom: 18px;
  font-size: 0.95rem;
}

.reading-panel {
  padding: 26px 28px;
  border-radius: 18px;
  background: linear-gradient(180deg, #ffffff, #fbfcfe);
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
}

.chapter-body p {
  margin: 0 0 18px;
  line-height: 1.8;
  color: #233142;
  font-size: 1.02rem;
}

.chapter-body h3 {
  margin: 28px 0 12px;
  padding-left: 12px;
  border-left: 4px solid #7b1fa2;
}

.section-divider {
  text-align: center;
  margin: 26px 0;
  color: #7b1fa2;
  letter-spacing: 0.35em;
  font-weight: 700;
}

.chapter-nav {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 22px;
}

.nav-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  min-height: 84px;
  padding: 16px 18px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid rgba(21, 101, 192, 0.12);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.07);
}

.nav-card:hover { text-decoration: none; }
.nav-card span { color: var(--muted); font-size: 0.92rem; }
.nav-card strong { color: #1b3a63; line-height: 1.4; }
.nav-center { text-align: center; }
.disabled { opacity: 0.72; }

@media (max-width: 860px) {
  .container { padding: 22px 18px; margin: 20px auto; }
  .theme-header { flex-direction: column; align-items: flex-start; }
  .chapter-nav { grid-template-columns: 1fr; }
  .hero { padding: 22px 18px; }
  .reading-panel { padding: 20px 18px; }
}
"""


def write_site(chapters: list[dict[str, object]]) -> None:
    if CHAPTERS_DIR.exists():
        shutil.rmtree(CHAPTERS_DIR)
    CHAPTERS_DIR.mkdir(parents=True, exist_ok=True)

    STYLES_FILE.write_text(build_styles(), encoding="utf-8")
    INDEX_FILE.write_text(render_index(chapters), encoding="utf-8")

    for index, chapter in enumerate(chapters):
        previous_chapter = chapters[index - 1] if index > 0 else None
        next_chapter = chapters[index + 1] if index + 1 < len(chapters) else None
        target = CHAPTERS_DIR / str(chapter["filename"])
        target.write_text(
            render_chapter_page(chapter, previous_chapter, next_chapter),
            encoding="utf-8",
        )


def validate_site(chapters: list[dict[str, object]]) -> None:
    if not INDEX_FILE.exists():
        raise RuntimeError("No se generó el archivo index.html.")
    if not STYLES_FILE.exists():
        raise RuntimeError("No se generó el archivo styles.css.")
    missing = [
        chapter["filename"]
        for chapter in chapters
        if not (CHAPTERS_DIR / str(chapter["filename"])).exists()
    ]
    if missing:
        raise RuntimeError(f"Faltan capítulos generados: {missing[:3]}")


def main() -> None:
    text = SOURCE.read_text(encoding="utf-8")
    chapters = build_chapter_data(text)
    write_site(chapters)
    validate_site(chapters)
    print(f"Sitio generado: {INDEX_FILE}")
    print(f"Capítulos generados: {len(chapters)}")


if __name__ == "__main__":
    main()
