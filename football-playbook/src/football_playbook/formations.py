"""Vordefinierte Formationen (Offense) und Grundstellungen (Defense).

Koordinaten sind auf das Feld normiert: x in [0, 1] von linker zu rechter
Seitenlinie, y in [0, 1] von oben (gegnerische Endzone) nach unten. Die
Line of Scrimmage liegt bei y = LOS_Y; die Offense steht unterhalb (y > LOS_Y),
die Defense oberhalb (y < LOS_Y).
"""
from __future__ import annotations

from .models import Player

LOS_Y = 0.5

# Offensive Linie ist in allen Formationen identisch (Tackle-Tackle-Box).
_OFFENSIVE_LINE = [
    ("LT", 0.35, LOS_Y),
    ("LG", 0.425, LOS_Y),
    ("C", 0.5, LOS_Y),
    ("RG", 0.575, LOS_Y),
    ("RT", 0.65, LOS_Y),
]

OFFENSE_FORMATIONS: dict[str, list[tuple[str, float, float]]] = {
    "I-Formation": _OFFENSIVE_LINE + [
        ("QB", 0.5, 0.56),
        ("FB", 0.5, 0.64),
        ("RB", 0.5, 0.74),
        ("TE", 0.72, LOS_Y),
        ("WR", 0.08, LOS_Y),
        ("WR", 0.92, LOS_Y),
    ],
    "Shotgun Spread": _OFFENSIVE_LINE + [
        ("QB", 0.5, 0.62),
        ("RB", 0.42, 0.62),
        ("WR", 0.05, LOS_Y),
        ("WR", 0.25, LOS_Y),
        ("WR", 0.75, LOS_Y),
        ("WR", 0.95, LOS_Y),
    ],
    "Singleback Trips Right": _OFFENSIVE_LINE + [
        ("QB", 0.5, 0.6),
        ("RB", 0.42, 0.62),
        ("TE", 0.28, LOS_Y),
        ("WR", 0.68, LOS_Y),
        ("WR", 0.78, 0.48),
        ("WR", 0.88, 0.46),
    ],
    "Pistol": _OFFENSIVE_LINE + [
        ("QB", 0.5, 0.58),
        ("RB", 0.5, 0.66),
        ("TE", 0.72, LOS_Y),
        ("WR", 0.2, LOS_Y),
        ("WR", 0.08, LOS_Y),
        ("WR", 0.92, LOS_Y),
    ],
    "Empty (Shotgun)": _OFFENSIVE_LINE + [
        ("QB", 0.5, 0.62),
        ("WR", 0.05, LOS_Y),
        ("WR", 0.22, LOS_Y),
        ("TE", 0.32, LOS_Y),
        ("WR", 0.78, LOS_Y),
        ("WR", 0.95, LOS_Y),
    ],
}

DEFENSE_FORMATIONS: dict[str, list[tuple[str, float, float]]] = {
    "4-3 Base": [
        ("DE", 0.32, 0.46),
        ("DT", 0.44, 0.46),
        ("DT", 0.56, 0.46),
        ("DE", 0.68, 0.46),
        ("LB", 0.35, 0.38),
        ("LB", 0.5, 0.36),
        ("LB", 0.65, 0.38),
        ("CB", 0.1, 0.42),
        ("CB", 0.9, 0.42),
        ("FS", 0.35, 0.22),
        ("SS", 0.65, 0.22),
    ],
    "3-4 Base": [
        ("DE", 0.4, 0.46),
        ("NT", 0.5, 0.46),
        ("DE", 0.6, 0.46),
        ("OLB", 0.28, 0.4),
        ("ILB", 0.42, 0.36),
        ("ILB", 0.58, 0.36),
        ("OLB", 0.72, 0.4),
        ("CB", 0.1, 0.42),
        ("CB", 0.9, 0.42),
        ("FS", 0.35, 0.22),
        ("SS", 0.65, 0.22),
    ],
}


def build_offense(name: str) -> list[Player]:
    preset = OFFENSE_FORMATIONS[name]
    return [Player(x=x, y=y, team="offense", label=label) for label, x, y in preset]


def build_defense(name: str) -> list[Player]:
    preset = DEFENSE_FORMATIONS[name]
    return [Player(x=x, y=y, team="defense", label=label) for label, x, y in preset]
