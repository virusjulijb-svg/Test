package com.yugioh.deckbuilder.ui.search

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.yugioh.deckbuilder.data.local.CardEntity
import com.yugioh.deckbuilder.ui.components.CardThumbnail

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CardSearchScreen(
    viewModel: CardSearchViewModel,
    onCardClick: (CardEntity) -> Unit
) {
    val results by viewModel.results.collectAsStateWithLifecycle()
    val activeDeckId by viewModel.activeDeckId.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(viewModel.errorMessage) {
        viewModel.errorMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.dismissError()
        }
    }

    LaunchedEffect(viewModel.lastAddedCardName) {
        viewModel.lastAddedCardName?.let {
            snackbarHostState.showSnackbar("\"$it\" wurde zum Deck hinzugefügt")
        }
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Kartensuche") }) },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            OutlinedTextField(
                value = viewModel.query,
                onValueChange = viewModel::onQueryChange,
                label = { Text("Kartenname suchen") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(16.dp)
            )

            if (activeDeckId == null) {
                Text(
                    "Kein aktives Deck ausgewählt. Wähle unter \"Meine Decks\" ein Deck aus.",
                    modifier = Modifier.padding(horizontal = 16.dp),
                    color = MaterialTheme.colorScheme.error
                )
            }

            if (viewModel.isLoading) {
                Box(modifier = Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }

            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 110.dp),
                contentPadding = PaddingValues(12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(results, key = { it.id }) { card ->
                    Column {
                        CardThumbnail(
                            imageUrl = card.imageUrlSmall ?: card.imageUrl,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Text(
                            text = card.name,
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 2,
                            modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            TextButton(onClick = { onCardClick(card) }) {
                                Text("Details")
                            }
                            IconButton(onClick = { viewModel.addToActiveDeck(card) }) {
                                Icon(Icons.Default.Add, contentDescription = "Zum Deck hinzufügen")
                            }
                        }
                    }
                }
            }
        }
    }
}
