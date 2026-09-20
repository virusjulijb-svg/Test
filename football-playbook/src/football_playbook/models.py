"""Datenmodelle für Playbook, Plays, Spieler, Routen und Textfelder."""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Literal

Team = Literal["offense", "defense"]
RouteStyle = Literal["route", "block", "motion"]


@dataclass
class Player:
    x: float
    y: float
    team: Team
    label: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def from_dict(data: dict) -> "Player":
        return Player(x=data["x"], y=data["y"], team=data["team"], label=data.get("label", ""))


@dataclass
class Route:
    points: list[tuple[float, float]]
    style: RouteStyle = "route"

    def to_dict(self) -> dict:
        return {"points": [list(p) for p in self.points], "style": self.style}

    @staticmethod
    def from_dict(data: dict) -> "Route":
        points = [tuple(p) for p in data["points"]]
        return Route(points=points, style=data.get("style", "route"))


@dataclass
class TextLabel:
    x: float
    y: float
    text: str

    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def from_dict(data: dict) -> "TextLabel":
        return TextLabel(x=data["x"], y=data["y"], text=data["text"])


@dataclass
class Play:
    name: str = "Neue Play"
    formation: str = ""
    concept: str = ""
    notes: str = ""
    players: list[Player] = field(default_factory=list)
    routes: list[Route] = field(default_factory=list)
    texts: list[TextLabel] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "formation": self.formation,
            "concept": self.concept,
            "notes": self.notes,
            "players": [p.to_dict() for p in self.players],
            "routes": [r.to_dict() for r in self.routes],
            "texts": [t.to_dict() for t in self.texts],
        }

    @staticmethod
    def from_dict(data: dict) -> "Play":
        return Play(
            name=data.get("name", "Neue Play"),
            formation=data.get("formation", ""),
            concept=data.get("concept", ""),
            notes=data.get("notes", ""),
            players=[Player.from_dict(p) for p in data.get("players", [])],
            routes=[Route.from_dict(r) for r in data.get("routes", [])],
            texts=[TextLabel.from_dict(t) for t in data.get("texts", [])],
        )


@dataclass
class Playbook:
    title: str = "Neues Playbook"
    team_name: str = ""
    author: str = ""
    plays: list[Play] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "team_name": self.team_name,
            "author": self.author,
            "plays": [p.to_dict() for p in self.plays],
        }

    @staticmethod
    def from_dict(data: dict) -> "Playbook":
        return Playbook(
            title=data.get("title", "Neues Playbook"),
            team_name=data.get("team_name", ""),
            author=data.get("author", ""),
            plays=[Play.from_dict(p) for p in data.get("plays", [])],
        )
