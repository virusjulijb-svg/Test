package com.yugioh.deckbuilder.ui.decklist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.yugioh.deckbuilder.data.PreferencesManager
import com.yugioh.deckbuilder.data.local.DeckEntity
import com.yugioh.deckbuilder.data.repository.DeckRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class DeckListViewModel(
    private val deckRepository: DeckRepository,
    private val preferencesManager: PreferencesManager
) : ViewModel() {

    val decks: StateFlow<List<DeckEntity>> = deckRepository.getDecks()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val activeDeckId: StateFlow<Long?> = preferencesManager.activeDeckId
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    fun createDeck(name: String, onCreated: (Long) -> Unit) {
        if (name.isBlank()) return
        viewModelScope.launch {
            val id = deckRepository.createDeck(name.trim())
            preferencesManager.setActiveDeck(id)
            onCreated(id)
        }
    }

    fun selectDeck(id: Long) {
        viewModelScope.launch { preferencesManager.setActiveDeck(id) }
    }

    fun deleteDeck(deck: DeckEntity) {
        viewModelScope.launch { deckRepository.deleteDeck(deck) }
    }

    fun renameDeck(deck: DeckEntity, newName: String) {
        if (newName.isBlank()) return
        viewModelScope.launch { deckRepository.renameDeck(deck, newName.trim()) }
    }
}
