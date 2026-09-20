"""Export eines Playbooks als PDF-Datei (ein Deckblatt + eine Seite pro Play)."""
from __future__ import annotations

import io
import textwrap

from PySide6.QtCore import QBuffer, QRectF
from PySide6.QtGui import QImage, QPainter
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from .field_scene import FIELD_HEIGHT, FIELD_WIDTH, FieldScene, load_play_into_scene
from .models import Play, Playbook

RENDER_SCALE = 2  # höhere Auflösung für ein scharfes PDF


def _render_play_png(play: Play) -> bytes:
    scene = FieldScene()
    load_play_into_scene(scene, play)

    image = QImage(FIELD_WIDTH * RENDER_SCALE, FIELD_HEIGHT * RENDER_SCALE, QImage.Format.Format_ARGB32)
    image.fill(0xFFFFFFFF)
    painter = QPainter(image)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    target = QRectF(0, 0, FIELD_WIDTH * RENDER_SCALE, FIELD_HEIGHT * RENDER_SCALE)
    source = QRectF(0, 0, FIELD_WIDTH, FIELD_HEIGHT)
    scene.render(painter, target, source)
    painter.end()

    buffer = QBuffer()
    buffer.open(QBuffer.OpenModeFlag.ReadWrite)
    image.save(buffer, "PNG")
    data = bytes(buffer.data())
    buffer.close()
    return data


def _wrap_text(text: str, max_chars: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.splitlines() or [""]:
        lines.extend(textwrap.wrap(paragraph, width=max_chars) or [""])
    return lines


def export_playbook(playbook: Playbook, path: str) -> None:
    """Rendert jede Play der Playbook in ein PDF (Deckblatt + eine Seite pro Play)."""
    page_size = landscape(A4)
    page_w, page_h = page_size
    c = canvas.Canvas(path, pagesize=page_size)
    margin = 15 * mm

    # Deckblatt
    c.setFont("Helvetica-Bold", 28)
    c.drawCentredString(page_w / 2, page_h / 2 + 20 * mm, playbook.title or "Playbook")
    subtitle_parts = [p for p in (playbook.team_name, playbook.author) if p]
    if subtitle_parts:
        c.setFont("Helvetica", 14)
        c.drawCentredString(page_w / 2, page_h / 2, "  •  ".join(subtitle_parts))
    c.setFont("Helvetica", 10)
    c.drawCentredString(page_w / 2, page_h / 2 - 15 * mm, f"{len(playbook.plays)} Play(s)")
    c.showPage()

    for play in playbook.plays:
        png_bytes = _render_play_png(play)
        img_reader = ImageReader(io.BytesIO(png_bytes))

        c.setFont("Helvetica-Bold", 18)
        c.drawString(margin, page_h - margin - 5 * mm, play.name or "Play")

        header_parts = [p for p in (play.formation, play.concept) if p]
        if header_parts:
            c.setFont("Helvetica", 11)
            c.drawString(margin, page_h - margin - 12 * mm, " – ".join(header_parts))

        notes_lines: list[str] = []
        notes_height = 0.0
        if play.notes.strip():
            notes_lines = _wrap_text(play.notes, max_chars=110)
            notes_height = (len(notes_lines) + 1) * 5 * mm + 3 * mm

        image_top = page_h - margin - 18 * mm
        image_bottom = margin + notes_height
        available_w = page_w - 2 * margin
        available_h = max(image_top - image_bottom, 10 * mm)

        aspect = FIELD_WIDTH / FIELD_HEIGHT
        draw_w = available_w
        draw_h = draw_w / aspect
        if draw_h > available_h:
            draw_h = available_h
            draw_w = draw_h * aspect
        img_x = margin + (available_w - draw_w) / 2
        img_y = image_bottom + max(available_h - draw_h, 0) / 2

        c.drawImage(img_reader, img_x, img_y, width=draw_w, height=draw_h, preserveAspectRatio=True, mask="auto")

        if notes_lines:
            y = margin + notes_height - 3 * mm
            c.setFont("Helvetica-Bold", 9)
            c.drawString(margin, y, "Notizen:")
            y -= 5 * mm
            c.setFont("Helvetica", 9)
            for line in notes_lines:
                c.drawString(margin, y, line)
                y -= 5 * mm

        c.showPage()

    c.save()
