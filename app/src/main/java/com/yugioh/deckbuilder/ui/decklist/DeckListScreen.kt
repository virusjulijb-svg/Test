package com.yugioh.deckbuilder.ui.decklist

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.yugioh.deckbuilder.data.local.DeckEntity

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeckListScreen(
    viewModel: DeckListViewModel,
    onOpenDeck: (Long) -> Unit
) {
    val decks by viewModel.decks.collectAsStateWithLifecycle()
    val activeDeckId by viewModel.activeDeckId.collectAsStateWithLifecycle()

    var showCreateDialog by remember { mutableStateOf(false) }
    var renameTarget by remember { mutableStateOf<DeckEntity?>(null) }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Meine Decks") }) },
        floatingActionButton = {
            FloatingActionButton(onClick = { showCreateDialog = true }) {
                Icon(Icons.Default.Add, contentDescription = "Neues Deck")
            }
        }
    ) { padding ->
        if (decks.isEmpty()) {
            Column(
                modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)
            ) {
                Text("Noch keine Decks vorhanden. Erstelle dein erstes Deck über das Plus-Symbol.")
            }
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize().padding(padding).padding(8.dp)) {
                items(decks, key = { it.id }) { deck ->
                    Card(modifier = Modifier.fillMaxWidth().padding(4.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row {
                                IconButton(onClick = { viewModel.selectDeck(deck.id) }) {
                                    if (deck.id == activeDeckId) {
                                        Icon(Icons.Default.CheckCircle, contentDescription = "Aktives Deck", tint = MaterialTheme.colorScheme.primary)
                                    } else {
                                        Icon(Icons.Default.RadioButtonUnchecked, contentDescription = "Als aktiv auswählen")
                                    }
                                }
                                Text(
                                    deck.name,
                                    style = MaterialTheme.typography.titleMedium,
                                    modifier = Modifier.padding(top = 12.dp)
                                        .fillMaxWidth(0.5f)
                                )
                            }
                            Row {
                                TextButton(onClick = { onOpenDeck(deck.id) }) {
                                    Text("Öffnen")
                                }
                                IconButton(onClick = { renameTarget = deck }) {
                                    Icon(Icons.Default.Edit, contentDescription = "Umbenennen")
                                }
                                IconButton(onClick = { viewModel.deleteDeck(deck) }) {
                                    Icon(Icons.Default.Delete, contentDescription = "Löschen")
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showCreateDialog) {
        var name by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showCreateDialog = false },
            title = { Text("Neues Deck") },
            text = {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Deckname") })
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.createDeck(name) { onOpenDeck(it) }
                    showCreateDialog = false
                }) { Text("Erstellen") }
            },
            dismissButton = {
                TextButton(onClick = { showCreateDialog = false }) { Text("Abbrechen") }
            }
        )
    }

    renameTarget?.let { deck ->
        var name by remember(deck.id) { mutableStateOf(deck.name) }
        AlertDialog(
            onDismissRequest = { renameTarget = null },
            title = { Text("Deck umbenennen") },
            text = {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Deckname") })
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.renameDeck(deck, name)
                    renameTarget = null
                }) { Text("Speichern") }
            },
            dismissButton = {
                TextButton(onClick = { renameTarget = null }) { Text("Abbrechen") }
            }
        )
    }
}
