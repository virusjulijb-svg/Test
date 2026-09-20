"""Hauptfenster der Playbook-Anwendung."""
from __future__ import annotations

import json
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtGui import QAction, QActionGroup, QKeySequence
from PySide6.QtWidgets import (
    QComboBox,
    QDockWidget,
    QFileDialog,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QTextEdit,
    QToolBar,
    QVBoxLayout,
    QWidget,
)

from . import pdf_export
from .field_scene import (
    MODE_ADD_DEFENSE,
    MODE_ADD_OFFENSE,
    MODE_BLOCK,
    MODE_MOTION,
    MODE_ROUTE,
    MODE_SELECT,
    MODE_TEXT,
    FieldScene,
    FieldView,
    extract_play_contents,
    load_play_into_scene,
    norm_to_scene,
)
from .formations import DEFENSE_FORMATIONS, OFFENSE_FORMATIONS, build_defense, build_offense
from .items import PlayerItem
from .models import Play, Playbook

FILE_FILTER = "Football Playbook (*.fbpb.json);;Alle Dateien (*)"


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Football Playbook Creator")
        self.resize(1280, 800)

        self.playbook = Playbook()
        self.current_index: int | None = None
        self.current_file: Path | None = None

        self.scene = FieldScene()
        self.view = FieldView(self.scene)
        self.view.play_modified.connect(self._mark_dirty)
        self.setCentralWidget(self.view)

        self._build_menu()
        self._build_toolbar()
        self._build_play_dock()
        self._build_detail_dock()

        self._new_playbook(ask=False)
        self.statusBar().showMessage("Bereit")

    # ---------- UI-Aufbau ----------

    def _build_menu(self) -> None:
        file_menu = self.menuBar().addMenu("&Datei")
        file_menu.addAction("Neues Playbook", self._new_playbook, QKeySequence.StandardKey.New)
        file_menu.addAction("Öffnen…", self._open_playbook, QKeySequence.StandardKey.Open)
        file_menu.addAction("Speichern", self._save_playbook, QKeySequence.StandardKey.Save)
        file_menu.addAction("Speichern unter…", self._save_playbook_as, QKeySequence.StandardKey.SaveAs)
        file_menu.addSeparator()
        file_menu.addAction("Als PDF exportieren…", self._export_pdf, "Ctrl+E")
        file_menu.addSeparator()
        file_menu.addAction("Beenden", self.close, QKeySequence.StandardKey.Quit)

        edit_menu = self.menuBar().addMenu("&Bearbeiten")
        edit_menu.addAction("Playbook-Eigenschaften…", self._edit_playbook_properties)

        help_menu = self.menuBar().addMenu("&Hilfe")
        help_menu.addAction("Über", self._show_about)

    def _build_toolbar(self) -> None:
        toolbar = QToolBar("Werkzeuge")
        toolbar.setMovable(False)
        self.addToolBar(toolbar)

        self.mode_group = QActionGroup(self)
        self.mode_group.setExclusive(True)

        def add_mode_action(text: str, mode: str, checked: bool = False) -> QAction:
            action = QAction(text, self)
            action.setCheckable(True)
            action.setChecked(checked)
            action.triggered.connect(lambda: self.view.set_mode(mode))
            self.mode_group.addAction(action)
            toolbar.addAction(action)
            return action

        add_mode_action("Auswählen / Verschieben", MODE_SELECT, checked=True)
        toolbar.addSeparator()
        add_mode_action("+ Offense", MODE_ADD_OFFENSE)
        add_mode_action("+ Defense", MODE_ADD_DEFENSE)
        toolbar.addSeparator()
        add_mode_action("Route zeichnen", MODE_ROUTE)
        add_mode_action("Block zeichnen", MODE_BLOCK)
        add_mode_action("Motion zeichnen", MODE_MOTION)
        add_mode_action("Text hinzufügen", MODE_TEXT)
        toolbar.addSeparator()

        delete_action = QAction("Auswahl löschen", self)
        delete_action.setShortcut(QKeySequence.StandardKey.Delete)
        delete_action.triggered.connect(self._delete_selection)
        toolbar.addAction(delete_action)

        toolbar.addSeparator()
        toolbar.addWidget(QLabel(" Offense-Formation: "))
        self.offense_combo = QComboBox()
        self.offense_combo.addItems(sorted(OFFENSE_FORMATIONS.keys()))
        toolbar.addWidget(self.offense_combo)
        insert_off = QPushButton("Einfügen")
        insert_off.clicked.connect(self._insert_offense_formation)
        toolbar.addWidget(insert_off)

        toolbar.addWidget(QLabel("  Defense-Formation: "))
        self.defense_combo = QComboBox()
        self.defense_combo.addItems(sorted(DEFENSE_FORMATIONS.keys()))
        toolbar.addWidget(self.defense_combo)
        insert_def = QPushButton("Einfügen")
        insert_def.clicked.connect(self._insert_defense_formation)
        toolbar.addWidget(insert_def)

    def _build_play_dock(self) -> None:
        dock = QDockWidget("Plays", self)
        dock.setFeatures(QDockWidget.DockWidgetFeature.DockWidgetMovable)
        container = QWidget()
        layout = QVBoxLayout(container)

        self.play_list = QListWidget()
        self.play_list.currentRowChanged.connect(self._on_play_selected)
        layout.addWidget(self.play_list)

        buttons = QHBoxLayout()
        add_btn = QPushButton("Neu")
        add_btn.clicked.connect(self._add_play)
        dup_btn = QPushButton("Duplizieren")
        dup_btn.clicked.connect(self._duplicate_play)
        del_btn = QPushButton("Löschen")
        del_btn.clicked.connect(self._delete_play)
        buttons.addWidget(add_btn)
        buttons.addWidget(dup_btn)
        buttons.addWidget(del_btn)
        layout.addLayout(buttons)

        move_buttons = QHBoxLayout()
        up_btn = QPushButton("↑ Nach oben")
        up_btn.clicked.connect(lambda: self._move_play(-1))
        down_btn = QPushButton("↓ Nach unten")
        down_btn.clicked.connect(lambda: self._move_play(1))
        move_buttons.addWidget(up_btn)
        move_buttons.addWidget(down_btn)
        layout.addLayout(move_buttons)

        dock.setWidget(container)
        self.addDockWidget(Qt.DockWidgetArea.LeftDockWidgetArea, dock)

    def _build_detail_dock(self) -> None:
        dock = QDockWidget("Play-Details", self)
        dock.setFeatures(QDockWidget.DockWidgetFeature.DockWidgetMovable)
        container = QWidget()
        form = QFormLayout(container)

        self.name_edit = QLineEdit()
        self.name_edit.editingFinished.connect(self._sync_fields_to_list)
        self.formation_edit = QLineEdit()
        self.concept_edit = QLineEdit()
        self.notes_edit = QTextEdit()
        self.notes_edit.setFixedHeight(120)

        form.addRow("Play-Name:", self.name_edit)
        form.addRow("Formation:", self.formation_edit)
        form.addRow("Spielkonzept:", self.concept_edit)
        form.addRow("Notizen:", self.notes_edit)

        dock.setWidget(container)
        self.addDockWidget(Qt.DockWidgetArea.RightDockWidgetArea, dock)

    # ---------- Play-/Playbook-Verwaltung ----------

    def _mark_dirty(self) -> None:
        self.statusBar().showMessage("Ungespeicherte Änderungen", 2000)

    def _current_play(self) -> Play | None:
        if self.current_index is None:
            return None
        return self.playbook.plays[self.current_index]

    def _commit_current_play(self) -> None:
        play = self._current_play()
        if play is None:
            return
        players, routes, texts = extract_play_contents(self.scene)
        play.players = players
        play.routes = routes
        play.texts = texts
        play.name = self.name_edit.text().strip() or play.name
        play.formation = self.formation_edit.text().strip()
        play.concept = self.concept_edit.text().strip()
        play.notes = self.notes_edit.toPlainText()

    def _load_play_to_editor(self, index: int) -> None:
        play = self.playbook.plays[index]
        load_play_into_scene(self.scene, play)
        self.name_edit.setText(play.name)
        self.formation_edit.setText(play.formation)
        self.concept_edit.setText(play.concept)
        self.notes_edit.setPlainText(play.notes)

    def _refresh_play_list(self, select_index: int | None = None) -> None:
        self.play_list.blockSignals(True)
        self.play_list.clear()
        for play in self.playbook.plays:
            self.play_list.addItem(QListWidgetItem(play.name))
        self.play_list.blockSignals(False)
        if select_index is not None and 0 <= select_index < self.play_list.count():
            self.play_list.setCurrentRow(select_index)

    def _on_play_selected(self, row: int) -> None:
        if row < 0:
            return
        if self.current_index is not None and self.current_index != row:
            self._commit_current_play()
        self.current_index = row
        self._load_play_to_editor(row)

    def _sync_fields_to_list(self) -> None:
        if self.current_index is None:
            return
        item = self.play_list.item(self.current_index)
        if item is not None:
            item.setText(self.name_edit.text().strip() or item.text())

    def _add_play(self) -> None:
        if self.current_index is not None:
            self._commit_current_play()
        new_play = Play(name=f"Play {len(self.playbook.plays) + 1}")
        self.playbook.plays.append(new_play)
        self._refresh_play_list(select_index=len(self.playbook.plays) - 1)

    def _duplicate_play(self) -> None:
        play = self._current_play()
        if play is None:
            return
        self._commit_current_play()
        copy = Play.from_dict(play.to_dict())
        copy.name = f"{play.name} (Kopie)"
        insert_at = self.current_index + 1
        self.playbook.plays.insert(insert_at, copy)
        self._refresh_play_list(select_index=insert_at)

    def _delete_play(self) -> None:
        if self.current_index is None:
            return
        if len(self.playbook.plays) <= 1:
            QMessageBox.information(self, "Nicht möglich", "Ein Playbook braucht mindestens eine Play.")
            return
        reply = QMessageBox.question(self, "Play löschen", "Diese Play wirklich löschen?")
        if reply != QMessageBox.StandardButton.Yes:
            return
        del self.playbook.plays[self.current_index]
        new_index = min(self.current_index, len(self.playbook.plays) - 1)
        self.current_index = None
        self._refresh_play_list(select_index=new_index)

    def _move_play(self, delta: int) -> None:
        if self.current_index is None:
            return
        new_pos = self.current_index + delta
        if not (0 <= new_pos < len(self.playbook.plays)):
            return
        self._commit_current_play()
        plays = self.playbook.plays
        plays[self.current_index], plays[new_pos] = plays[new_pos], plays[self.current_index]
        self.current_index = None
        self._refresh_play_list(select_index=new_pos)

    def _delete_selection(self) -> None:
        for item in list(self.scene.selectedItems()):
            self.scene.removeItem(item)
        self._mark_dirty()

    # ---------- Formationen ----------

    def _insert_offense_formation(self) -> None:
        for item in [it for it in self.scene.items() if isinstance(it, PlayerItem) and it.team == "offense"]:
            self.scene.removeItem(item)
        name = self.offense_combo.currentText()
        for player in build_offense(name):
            item = PlayerItem(player.team, player.label)
            item.setPos(norm_to_scene(player.x, player.y))
            self.scene.addItem(item)
        self.formation_edit.setText(name)
        self._mark_dirty()

    def _insert_defense_formation(self) -> None:
        for item in [it for it in self.scene.items() if isinstance(it, PlayerItem) and it.team == "defense"]:
            self.scene.removeItem(item)
        name = self.defense_combo.currentText()
        for player in build_defense(name):
            item = PlayerItem(player.team, player.label)
            item.setPos(norm_to_scene(player.x, player.y))
            self.scene.addItem(item)
        self._mark_dirty()

    # ---------- Playbook-Eigenschaften ----------

    def _edit_playbook_properties(self) -> None:
        title, ok = QInputDialog.getText(self, "Playbook-Titel", "Titel:", text=self.playbook.title)
        if ok:
            self.playbook.title = title.strip() or self.playbook.title
        team, ok = QInputDialog.getText(self, "Team", "Teamname:", text=self.playbook.team_name)
        if ok:
            self.playbook.team_name = team.strip()
        author, ok = QInputDialog.getText(self, "Autor", "Autor/Coach:", text=self.playbook.author)
        if ok:
            self.playbook.author = author.strip()
        self.setWindowTitle(f"Football Playbook Creator – {self.playbook.title}")

    # ---------- Datei-Operationen ----------

    def _new_playbook(self, ask: bool = True) -> None:
        if ask:
            reply = QMessageBox.question(
                self, "Neues Playbook", "Aktuelles Playbook verwerfen und ein neues anlegen?"
            )
            if reply != QMessageBox.StandardButton.Yes:
                return
        self.playbook = Playbook(plays=[Play(name="Play 1")])
        self.current_file = None
        self.current_index = None
        self._refresh_play_list(select_index=0)
        self.setWindowTitle(f"Football Playbook Creator – {self.playbook.title}")

    def _open_playbook(self) -> None:
        path, _ = QFileDialog.getOpenFileName(self, "Playbook öffnen", "", FILE_FILTER)
        if not path:
            return
        try:
            data = json.loads(Path(path).read_text(encoding="utf-8"))
            self.playbook = Playbook.from_dict(data)
            if not self.playbook.plays:
                self.playbook.plays.append(Play(name="Play 1"))
        except Exception as exc:  # noqa: BLE001
            QMessageBox.critical(self, "Fehler beim Öffnen", str(exc))
            return
        self.current_file = Path(path)
        self.current_index = None
        self._refresh_play_list(select_index=0)
        self.setWindowTitle(f"Football Playbook Creator – {self.playbook.title}")
        self.statusBar().showMessage(f"Geöffnet: {path}", 3000)

    def _save_playbook(self) -> None:
        if self.current_file is None:
            self._save_playbook_as()
            return
        self._write_playbook(self.current_file)

    def _save_playbook_as(self) -> None:
        path, _ = QFileDialog.getSaveFileName(self, "Playbook speichern unter", "playbook.fbpb.json", FILE_FILTER)
        if not path:
            return
        self._write_playbook(Path(path))

    def _write_playbook(self, path: Path) -> None:
        self._commit_current_play()
        try:
            path.write_text(json.dumps(self.playbook.to_dict(), indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception as exc:  # noqa: BLE001
            QMessageBox.critical(self, "Fehler beim Speichern", str(exc))
            return
        self.current_file = path
        self.statusBar().showMessage(f"Gespeichert: {path}", 3000)

    def _export_pdf(self) -> None:
        self._commit_current_play()
        default_name = f"{self.playbook.title or 'playbook'}.pdf"
        path, _ = QFileDialog.getSaveFileName(self, "Playbook als PDF exportieren", default_name, "PDF-Dateien (*.pdf)")
        if not path:
            return
        try:
            pdf_export.export_playbook(self.playbook, path)
        except Exception as exc:  # noqa: BLE001
            QMessageBox.critical(self, "Fehler beim PDF-Export", str(exc))
            return
        self.statusBar().showMessage(f"PDF exportiert: {path}", 4000)
        QMessageBox.information(self, "Export abgeschlossen", f"Playbook wurde als PDF gespeichert:\n{path}")

    def _show_about(self) -> None:
        QMessageBox.information(
            self,
            "Über Football Playbook Creator",
            "Football Playbook Creator\n\n"
            "Formationen aufstellen, Routen und Blocks einzeichnen "
            "und das fertige Playbook als PDF exportieren.",
        )

    def closeEvent(self, event) -> None:  # noqa: N802 (Qt-Namenskonvention)
        self._commit_current_play()
        super().closeEvent(event)
