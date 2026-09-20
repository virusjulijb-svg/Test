"""Spielfeld-Zeichenfläche: Hintergrundfeld, Werkzeug-Modi, Maus-Interaktion."""
from __future__ import annotations

from PySide6.QtCore import QPointF, QRectF, Qt, Signal
from PySide6.QtGui import QColor, QFont, QPainter, QPen
from PySide6.QtWidgets import (
    QGraphicsItem,
    QGraphicsScene,
    QGraphicsSimpleTextItem,
    QGraphicsView,
    QInputDialog,
)

from .formations import LOS_Y
from .items import PlayerItem, RouteItem
from .models import Play, Player, Route, TextLabel

FIELD_WIDTH = 900
FIELD_HEIGHT = 560
LOS_Y_PIXELS = FIELD_HEIGHT * LOS_Y

MODE_SELECT = "select"
MODE_ADD_OFFENSE = "add_offense"
MODE_ADD_DEFENSE = "add_defense"
MODE_ROUTE = "route"
MODE_BLOCK = "block"
MODE_MOTION = "motion"
MODE_TEXT = "text"


def norm_to_scene(x: float, y: float) -> QPointF:
    return QPointF(x * FIELD_WIDTH, y * FIELD_HEIGHT)


def scene_to_norm(pos: QPointF) -> tuple[float, float]:
    return pos.x() / FIELD_WIDTH, pos.y() / FIELD_HEIGHT


class FieldScene(QGraphicsScene):
    def __init__(self, parent=None):
        super().__init__(0, 0, FIELD_WIDTH, FIELD_HEIGHT, parent)

    def drawBackground(self, painter: QPainter, rect: QRectF) -> None:
        painter.fillRect(rect, QColor("#2f7d32"))

        step = FIELD_HEIGHT / 14
        line_pen = QPen(QColor(255, 255, 255, 140), 1)
        painter.setPen(line_pen)
        y = 0.0
        while y <= FIELD_HEIGHT:
            painter.drawLine(QPointF(0, y), QPointF(FIELD_WIDTH, y))
            y += step

        hash_x1 = FIELD_WIDTH * 0.35
        hash_x2 = FIELD_WIDTH * 0.65
        tick = 6
        yy = 0.0
        while yy <= FIELD_HEIGHT:
            painter.drawLine(QPointF(hash_x1 - tick / 2, yy), QPointF(hash_x1 + tick / 2, yy))
            painter.drawLine(QPointF(hash_x2 - tick / 2, yy), QPointF(hash_x2 + tick / 2, yy))
            yy += step / 5

        los_pen = QPen(QColor("#fbbf24"), 2.5, Qt.PenStyle.DashLine)
        painter.setPen(los_pen)
        painter.drawLine(QPointF(0, LOS_Y_PIXELS), QPointF(FIELD_WIDTH, LOS_Y_PIXELS))

        border_pen = QPen(QColor("white"), 3)
        painter.setPen(border_pen)
        painter.drawRect(QRectF(1, 1, FIELD_WIDTH - 2, FIELD_HEIGHT - 2))


class FieldView(QGraphicsView):
    """Zeigt die FieldScene an und übersetzt Mausereignisse je nach aktivem Werkzeug."""

    play_modified = Signal()

    def __init__(self, scene: FieldScene, parent=None):
        super().__init__(scene, parent)
        self.setRenderHint(QPainter.RenderHint.Antialiasing)
        self.setDragMode(QGraphicsView.DragMode.RubberBandDrag)
        self.mode = MODE_SELECT
        self._draw_points: list[QPointF] = []
        self._preview: RouteItem | None = None

    def set_mode(self, mode: str) -> None:
        self._cancel_drawing()
        self.mode = mode
        self.setDragMode(
            QGraphicsView.DragMode.RubberBandDrag if mode == MODE_SELECT else QGraphicsView.DragMode.NoDrag
        )

    def _cancel_drawing(self) -> None:
        if self._preview is not None:
            self.scene().removeItem(self._preview)
            self._preview = None
        self._draw_points = []

    def _suggest_label(self, team: str) -> str:
        count = sum(1 for it in self.scene().items() if isinstance(it, PlayerItem) and it.team == team)
        return f"{'O' if team == 'offense' else 'D'}{count + 1}"

    def mousePressEvent(self, event) -> None:
        pos = self.mapToScene(event.pos())

        if self.mode == MODE_SELECT:
            super().mousePressEvent(event)
            return

        if self.mode in (MODE_ADD_OFFENSE, MODE_ADD_DEFENSE):
            if event.button() != Qt.MouseButton.LeftButton:
                return
            team = "offense" if self.mode == MODE_ADD_OFFENSE else "defense"
            suggestion = self._suggest_label(team)
            text, ok = QInputDialog.getText(
                self, "Spieler-Label", "Positionskürzel (z.B. QB, WR, CB):", text=suggestion
            )
            if not ok:
                return
            item = PlayerItem(team, text.strip() or suggestion)
            item.setPos(pos)
            self.scene().addItem(item)
            self.play_modified.emit()
            return

        if self.mode in (MODE_ROUTE, MODE_BLOCK, MODE_MOTION):
            if event.button() == Qt.MouseButton.RightButton:
                self._finish_drawing()
                return
            if event.button() != Qt.MouseButton.LeftButton:
                return
            self._draw_points.append(pos)
            if self._preview is None:
                self._preview = RouteItem(list(self._draw_points), style=self.mode)
                self.scene().addItem(self._preview)
            else:
                self._preview.set_points(list(self._draw_points))
                self._preview.update()
            return

        if self.mode == MODE_TEXT:
            if event.button() != Qt.MouseButton.LeftButton:
                return
            text, ok = QInputDialog.getText(self, "Text hinzufügen", "Text:")
            if ok and text.strip():
                item = QGraphicsSimpleTextItem(text.strip())
                item.setFont(QFont("Arial", 10, QFont.Weight.DemiBold))
                item.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsMovable, True)
                item.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsSelectable, True)
                item.setZValue(20)
                item.setPos(pos)
                self.scene().addItem(item)
                self.play_modified.emit()
            return

        super().mousePressEvent(event)

    def mouseMoveEvent(self, event) -> None:
        if self.mode in (MODE_ROUTE, MODE_BLOCK, MODE_MOTION) and self._draw_points and self._preview is not None:
            pos = self.mapToScene(event.pos())
            self._preview.set_points(self._draw_points + [pos])
            self._preview.update()
        super().mouseMoveEvent(event)

    def mouseDoubleClickEvent(self, event) -> None:
        if self.mode in (MODE_ROUTE, MODE_BLOCK, MODE_MOTION):
            self._finish_drawing()
            return

        if self.mode == MODE_SELECT:
            pos = self.mapToScene(event.pos())
            item = self._resolve_editable(self.scene().itemAt(pos, self.transform()))
            if isinstance(item, PlayerItem):
                text, ok = QInputDialog.getText(self, "Spieler umbenennen", "Positionskürzel:", text=item.label)
                if ok:
                    item.set_label(text.strip())
                    self.play_modified.emit()
                return
            if isinstance(item, QGraphicsSimpleTextItem):
                text, ok = QInputDialog.getText(self, "Text bearbeiten", "Text:", text=item.text())
                if ok:
                    item.setText(text.strip())
                    self.play_modified.emit()
                return

        super().mouseDoubleClickEvent(event)

    @staticmethod
    def _resolve_editable(item):
        while item is not None and not isinstance(item, (PlayerItem, QGraphicsSimpleTextItem)):
            item = item.parentItem()
        return item

    def _finish_drawing(self) -> None:
        if self._preview is not None and len(self._draw_points) >= 2:
            self._preview.set_points(list(self._draw_points))
            self._preview.update()
            self.play_modified.emit()
        elif self._preview is not None:
            self.scene().removeItem(self._preview)
        self._preview = None
        self._draw_points = []

    def keyPressEvent(self, event) -> None:
        if event.key() in (Qt.Key.Key_Delete, Qt.Key.Key_Backspace):
            items = list(self.scene().selectedItems())
            if items:
                for item in items:
                    self.scene().removeItem(item)
                self.play_modified.emit()
            return
        if event.key() == Qt.Key.Key_Escape:
            self._cancel_drawing()
            return
        super().keyPressEvent(event)


def load_play_into_scene(scene: FieldScene, play: Play) -> None:
    """Leert die Szene und baut sie aus den gespeicherten Play-Daten neu auf."""
    scene.clear()
    for p in play.players:
        item = PlayerItem(p.team, p.label)
        item.setPos(norm_to_scene(p.x, p.y))
        scene.addItem(item)
    for r in play.routes:
        pts = [norm_to_scene(x, y) for x, y in r.points]
        scene.addItem(RouteItem(pts, style=r.style))
    for t in play.texts:
        item = QGraphicsSimpleTextItem(t.text)
        item.setFont(QFont("Arial", 10, QFont.Weight.DemiBold))
        item.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsMovable, True)
        item.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsSelectable, True)
        item.setZValue(20)
        item.setPos(norm_to_scene(t.x, t.y))
        scene.addItem(item)


def extract_play_contents(scene: FieldScene) -> tuple[list[Player], list[Route], list[TextLabel]]:
    """Liest Spieler, Routen und Texte aus den aktuellen Szenen-Items aus."""
    players: list[Player] = []
    routes: list[Route] = []
    texts: list[TextLabel] = []
    for item in scene.items():
        if isinstance(item, PlayerItem):
            x, y = scene_to_norm(item.pos())
            players.append(Player(x=x, y=y, team=item.team, label=item.label))
        elif isinstance(item, RouteItem):
            routes.append(Route(points=[scene_to_norm(pt) for pt in item.points], style=item.style))
        elif isinstance(item, QGraphicsSimpleTextItem) and item.parentItem() is None:
            x, y = scene_to_norm(item.pos())
            texts.append(TextLabel(x=x, y=y, text=item.text()))
    return players, routes, texts
