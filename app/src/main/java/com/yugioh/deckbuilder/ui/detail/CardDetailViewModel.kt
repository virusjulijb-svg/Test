package com.yugioh.deckbuilder.ui.detail

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.yugioh.deckbuilder.data.PreferencesManager
import com.yugioh.deckbuilder.data.local.CardEntity
import com.yugioh.deckbuilder.data.repository.CardRepository
import com.yugioh.deckbuilder.data.repository.DeckRepository
import com.yugioh.deckbuilder.domain.determineZoneForType
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class CardDetailViewModel(
    private val cardId: Int,
    private val cardRepository: CardRepository,
    private val deckRepository: DeckRepository,
    preferencesManager: PreferencesManager
) : ViewModel() {

    var card by mutableStateOf<CardEntity?>(null)
        private set

    var addedMessage by mutableStateOf<String?>(null)
        private set

    val activeDeckId: StateFlow<Long?> = preferencesManager.activeDeckId
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    init {
        viewModelScope.launch {
            card = cardRepository.getCard(cardId)
        }
    }

    fun addToActiveDeck() {
        val currentCard = card ?: return
        val deckId = activeDeckId.value ?: return
        viewModelScope.launch {
            deckRepository.addCard(deckId, currentCard, determineZoneForType(currentCard.type))
            addedMessage = "\"${currentCard.name}\" wurde zum Deck hinzugefügt"
        }
    }

    fun dismissMessage() {
        addedMessage = null
    }
}
