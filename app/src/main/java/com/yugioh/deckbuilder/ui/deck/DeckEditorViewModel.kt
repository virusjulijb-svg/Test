package com.yugioh.deckbuilder.ui.deck

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.yugioh.deckbuilder.data.local.DeckCardWithCard
import com.yugioh.deckbuilder.data.repository.DeckRepository
import com.yugioh.deckbuilder.domain.DeckValidator
import com.yugioh.deckbuilder.domain.DeckZone
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class DeckEditorViewModel(
    private val deckId: Long,
    private val deckRepository: DeckRepository
) : ViewModel() {

    val contents: StateFlow<List<DeckCardWithCard>> = deckRepository.getDeckContents(deckId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val validation: StateFlow<DeckValidator.ValidationResult> = contents
        .map { DeckValidator.validate(it) }
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5000),
            DeckValidator.ValidationResult(0, 0, 0, emptyList())
        )

    fun increment(entry: DeckCardWithCard) {
        viewModelScope.launch {
            deckRepository.addCard(deckId, entry.card, DeckZone.valueOf(entry.zone))
        }
    }

    fun decrement(entry: DeckCardWithCard) {
        viewModelScope.launch {
            deckRepository.removeCard(deckId, entry.cardId, DeckZone.valueOf(entry.zone))
        }
    }

    fun moveToZone(entry: DeckCardWithCard, target: DeckZone) {
        viewModelScope.launch {
            deckRepository.moveCard(deckId, entry.cardId, DeckZone.valueOf(entry.zone), target)
        }
    }
}
