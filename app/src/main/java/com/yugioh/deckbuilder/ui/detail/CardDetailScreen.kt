package com.yugioh.deckbuilder.ui.detail

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.yugioh.deckbuilder.ui.components.CardThumbnail

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CardDetailScreen(
    viewModel: CardDetailViewModel,
    onBack: () -> Unit
) {
    val card = viewModel.card
    val activeDeckId by viewModel.activeDeckId.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(viewModel.addedMessage) {
        viewModel.addedMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.dismissMessage()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(card?.name ?: "Karte") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Zurück")
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        if (card == null) {
            Text("Karte wird geladen...", modifier = Modifier.padding(padding).padding(16.dp))
            return@Scaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            CardThumbnail(
                imageUrl = card.imageUrl ?: card.imageUrlSmall,
                modifier = Modifier.fillMaxWidth()
            )
            Text(card.name, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 12.dp))
            Text(card.type, style = MaterialTheme.typography.bodyMedium)
            if (card.atk != null || card.def != null) {
                Text("ATK ${card.atk ?: "-"} / DEF ${card.def ?: "-"}", style = MaterialTheme.typography.bodyMedium)
            }
            card.level?.let { Text("Level/Rang $it", style = MaterialTheme.typography.bodyMedium) }
            card.attribute?.let { Text("Attribut: $it", style = MaterialTheme.typography.bodyMedium) }
            card.race?.let { Text("Typ: $it", style = MaterialTheme.typography.bodyMedium) }
            card.archetype?.let { Text("Archetyp: $it", style = MaterialTheme.typography.bodyMedium) }
            card.banTcg?.let {
                Text("Banlist-Status: $it", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
            }
            Text(card.description, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 12.dp))

            Button(
                onClick = { viewModel.addToActiveDeck() },
                enabled = activeDeckId != null,
                modifier = Modifier.padding(top = 16.dp)
            ) {
                Text(if (activeDeckId != null) "Zum aktiven Deck hinzufügen" else "Kein aktives Deck ausgewählt")
            }
        }
    }
}
