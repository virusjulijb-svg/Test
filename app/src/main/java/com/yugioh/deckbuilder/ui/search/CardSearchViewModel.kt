package com.yugioh.deckbuilder.ui.search

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.yugioh.deckbuilder.data.PreferencesManager
import com.yugioh.deckbuilder.data.local.CardEntity
import com.yugioh.deckbuilder.data.repository.CardRepository
import com.yugioh.deckbuilder.data.repository.DeckRepository
import com.yugioh.deckbuilder.domain.determineZoneForType
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class CardSearchViewModel(
    private val cardRepository: CardRepository,
    private val deckRepository: DeckRepository,
    private val preferencesManager: PreferencesManager
) : ViewModel() {

    var query by mutableStateOf("")
        private set

    var isLoading by mutableStateOf(false)
        private set

    var errorMessage by mutableStateOf<String?>(null)
        private set

    var lastAddedCardName by mutableStateOf<String?>(null)
        private set

    val activeDeckId: StateFlow<Long?> = preferencesManager.activeDeckId
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    @OptIn(ExperimentalCoroutinesApi::class)
    val results: StateFlow<List<CardEntity>> = snapshotFlow { query }
        .debounce(400)
        .filter { it.length >= 2 }
        .flatMapLatest { cardRepository.searchCached(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private var searchJob: Job? = null

    fun onQueryChange(newQuery: String) {
        query = newQuery
        if (newQuery.length >= 2) {
            refresh(newQuery)
        }
    }

    private fun refresh(q: String) {
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            isLoading = true
            errorMessage = null
            cardRepository.refreshSearch(q).onFailure {
                errorMessage = "Suche fehlgeschlagen: ${it.message ?: "Netzwerkfehler"}"
            }
            isLoading = false
        }
    }

    fun addToActiveDeck(card: CardEntity) {
        val deckId = activeDeckId.value
        if (deckId == null) {
            errorMessage = "Bitte zuerst unter \"Meine Decks\" ein Deck auswählen."
            return
        }
        viewModelScope.launch {
            deckRepository.addCard(deckId, card, determineZoneForType(card.type))
            lastAddedCardName = card.name
        }
    }

    fun dismissError() {
        errorMessage = null
    }
}
