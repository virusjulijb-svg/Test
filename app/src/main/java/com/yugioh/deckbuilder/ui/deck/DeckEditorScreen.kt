package com.yugioh.deckbuilder.ui.deck

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
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.yugioh.deckbuilder.data.local.DeckCardWithCard
import com.yugioh.deckbuilder.domain.DeckValidator
import com.yugioh.deckbuilder.domain.DeckZone
import com.yugioh.deckbuilder.domain.determineZoneForType

private val TABS = listOf(DeckZone.MAIN, DeckZone.EXTRA, DeckZone.SIDE)

private fun zoneLabel(zone: DeckZone): String = when (zone) {
    DeckZone.MAIN -> "Hauptdeck"
    DeckZone.EXTRA -> "Extra Deck"
    DeckZone.SIDE -> "Side Deck"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeckEditorScreen(
    viewModel: DeckEditorViewModel,
    onBack: () -> Unit
) {
    val contents by viewModel.contents.collectAsStateWithLifecycle()
    val validation by viewModel.validation.collectAsStateWithLifecycle()
    var selectedTab by remember { mutableIntStateOf(0) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Deck bearbeiten") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Zurück")
                    }
                }
            )
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            ValidationSummary(validation)

            TabRow(selectedTabIndex = selectedTab) {
                TABS.forEachIndexed { index, zone ->
                    val count = when (zone) {
                        DeckZone.MAIN -> validation.mainCount
                        DeckZone.EXTRA -> validation.extraCount
                        DeckZone.SIDE -> validation.sideCount
                    }
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = { Text("${zoneLabel(zone)} ($count)") }
                    )
                }
            }

            val currentZone = TABS[selectedTab]
            val entries = contents.filter { it.zone == currentZone.name }

            LazyColumn(modifier = Modifier.fillMaxSize().padding(8.dp)) {
                items(entries, key = { "${it.cardId}_${it.zone}" }) { entry ->
                    DeckCardRow(
                        entry = entry,
                        onIncrement = { viewModel.increment(entry) },
                        onDecrement = { viewModel.decrement(entry) },
                        onMove = { target -> viewModel.moveToZone(entry, target) }
                    )
                }
            }
        }
    }
}

@Composable
private fun ValidationSummary(validation: DeckValidator.ValidationResult) {
    Column(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
        if (validation.isValid) {
            Text("Deck ist gültig", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.titleMedium)
        } else {
            Text("Deck ist nicht turnierfähig:", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.error)
            validation.errors.forEach {
                Text("• $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun DeckCardRow(
    entry: DeckCardWithCard,
    onIncrement: () -> Unit,
    onDecrement: () -> Unit,
    onMove: (DeckZone) -> Unit
) {
    val currentZone = DeckZone.valueOf(entry.zone)
    val naturalZone = determineZoneForType(entry.card.type)
    val moveTarget = when (currentZone) {
        DeckZone.SIDE -> naturalZone
        else -> DeckZone.SIDE
    }

    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(8.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.fillMaxWidth(0.5f)) {
                Text(entry.card.name, style = MaterialTheme.typography.bodyMedium, maxLines = 2)
                Text("${entry.quantity}x", style = MaterialTheme.typography.bodySmall)
            }
            Row {
                IconButton(onClick = onDecrement) {
                    Icon(Icons.Default.Remove, contentDescription = "Entfernen")
                }
                IconButton(onClick = onIncrement) {
                    Icon(Icons.Default.Add, contentDescription = "Hinzufügen")
                }
                IconButton(onClick = { onMove(moveTarget) }) {
                    Icon(Icons.Default.SwapHoriz, contentDescription = "Nach ${zoneLabel(moveTarget)} verschieben")
                }
            }
        }
    }
}
