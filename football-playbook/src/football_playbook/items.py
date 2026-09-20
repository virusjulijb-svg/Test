"""Grafische Elemente für die Zeichenfläche: Spieler-Symbole und Routen/Blocklinien."""
from __future__ import annotations

import math

from PySide6.QtCore import QPointF, QRectF, Qt, Signal
from PySide6.QtGui import QBrush, QColor, QFont, QPainterPath, QPen, QPolygonF
from PySide6.QtWidgets import (
    QGraphicsItem,
    QGraphicsObject,
    QGraphicsSimpleTextItem,
    QStyleOptionGraphicsItem,
    QWidget,
)

PLAYER_RADIUS = 14
OFFENSE_COLOR = QColor("#1d4ed8")
DEFENSE_COLOR = QColor("#dc2626")
ROUTE_COLOR = QColor("#111827")
BLOCK_COLOR = QColor("#111827")
MOTION_COLOR = QColor("#6b7280")


class PlayerItem(QGraphicsObject):
    """Ein Offense- (Kreis) oder Defense-Spieler (Kreuz) mit Positionslabel."""

    moved = Signal()

    def __init__(self, team: str, label: str = "", parent: QGraphicsItem | None = None):
        super().__init__(parent)
        self.team = team
        self.label = label
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsMovable, True)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsSelectable, True)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemSendsGeometryChanges, True)
        self.setZValue(10)

        self._text = QGraphicsSimpleTextItem(label, self)
        self._text.setFont(QFont("Arial", 9, QFont.Weight.Bold))
        self._text.setBrush(QBrush(QColor("white") if team == "offense" else QColor("white")))
        self._center_label()

    def set_label(self, label: str) -> None:
        self.label = label
        self._text.setText(label)
        self._center_label()

    def _center_label(self) -> None:
        rect = self._text.boundingRect()
        self._text.setPos(-rect.width() / 2, -rect.height() / 2)

    def boundingRect(self) -> QRectF:
        r = PLAYER_RADIUS + 2
        return QRectF(-r, -r, 2 * r, 2 * r)

    def paint(self, painter, option: QStyleOptionGraphicsItem, widget: QWidget | None = None) -> None:
        pen = QPen(Qt.GlobalColor.black, 1.5)
        painter.setPen(pen)
        if self.team == "offense":
            painter.setBrush(QBrush(OFFENSE_COLOR))
            painter.drawEllipse(QPointF(0, 0), PLAYER_RADIUS, PLAYER_RADIUS)
        else:
            painter.setBrush(QBrush(DEFENSE_COLOR))
            pen = QPen(DEFENSE_COLOR, 4)
            pen.setCapStyle(Qt.PenCapStyle.RoundCap)
            painter.setPen(pen)
            r = PLAYER_RADIUS * 0.75
            painter.drawLine(QPointF(-r, -r), QPointF(r, r))
            painter.drawLine(QPointF(-r, r), QPointF(r, -r))
        if self.isSelected():
            sel_pen = QPen(QColor("#f59e0b"), 2, Qt.PenStyle.DashLine)
            painter.setPen(sel_pen)
            painter.setBrush(Qt.BrushStyle.NoBrush)
            painter.drawEllipse(QPointF(0, 0), PLAYER_RADIUS + 4, PLAYER_RADIUS + 4)

    def itemChange(self, change, value):
        if change == QGraphicsItem.GraphicsItemChange.ItemPositionHasChanged:
            self.moved.emit()
        return super().itemChange(change, value)


def _arrow_head(tip: QPointF, direction_angle_rad: float, size: float = 10.0) -> QPolygonF:
    left = tip + QPointF(
        -size * math.cos(direction_angle_rad - math.pi / 7),
        -size * math.sin(direction_angle_rad - math.pi / 7),
    )
    right = tip + QPointF(
        -size * math.cos(direction_angle_rad + math.pi / 7),
        -size * math.sin(direction_angle_rad + math.pi / 7),
    )
    return QPolygonF([tip, left, right])


class RouteItem(QGraphicsObject):
    """Eine Route/Blocklinie/Motion-Linie, gezeichnet als Polylinie mit Endmarkierung."""

    STYLES = ("route", "block", "motion")

    def __init__(self, points: list[QPointF], style: str = "route", parent: QGraphicsItem | None = None):
        super().__init__(parent)
        self.points = points
        self.style = style
        self.setZValue(5)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsSelectable, True)

    def set_points(self, points: list[QPointF]) -> None:
        self.prepareGeometryChange()
        self.points = points

    def boundingRect(self) -> QRectF:
        if not self.points:
            return QRectF()
        xs = [p.x() for p in self.points]
        ys = [p.y() for p in self.points]
        pad = 14
        return QRectF(min(xs) - pad, min(ys) - pad, max(xs) - min(xs) + 2 * pad, max(ys) - min(ys) + 2 * pad)

    def paint(self, painter, option: QStyleOptionGraphicsItem, widget: QWidget | None = None) -> None:
        if len(self.points) < 2:
            return
        color = {"route": ROUTE_COLOR, "block": BLOCK_COLOR, "motion": MOTION_COLOR}[self.style]
        width = 3.5 if self.style == "block" else 2.5
        pen = QPen(color, width)
        pen.setCapStyle(Qt.PenCapStyle.RoundCap)
        pen.setJoinStyle(Qt.PenJoinStyle.RoundJoin)
        if self.style == "motion":
            pen.setStyle(Qt.PenStyle.DashLine)
        if self.isSelected():
            pen.setColor(QColor("#f59e0b"))
        painter.setPen(pen)

        path = QPainterPath(self.points[0])
        for pt in self.points[1:]:
            path.lineTo(pt)
        painter.drawPath(path)

        p_end = self.points[-1]
        p_prev = self.points[-2]
        angle = math.atan2(p_end.y() - p_prev.y(), p_end.x() - p_prev.x())

        painter.setBrush(QBrush(color if not self.isSelected() else QColor("#f59e0b")))
        if self.style == "block":
            # T-Abschluss statt Pfeilspitze = Blockzuweisung.
            perp = angle + math.pi / 2
            length = 8
            a = p_end + QPointF(length * math.cos(perp), length * math.sin(perp))
            b = p_end + QPointF(-length * math.cos(perp), -length * math.sin(perp))
            painter.drawLine(a, b)
        else:
            painter.drawPolygon(_arrow_head(p_end, angle))
