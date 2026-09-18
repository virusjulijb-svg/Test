package com.yugioh.deckbuilder.data.local

import androidx.room.Embedded
import androidx.room.Entity

@Entity(tableName = "deck_cards", primaryKeys = ["deckId", "cardId", "zone"])
data class DeckCardEntity(
    val deckId: Long,
    val cardId: Int,
    val zone: String,
    val quantity: Int
)

data class DeckCardWithCard(
    val deckId: Long,
    val cardId: Int,
    val zone: String,
    val quantity: Int,
    @Embedded val card: CardEntity
)
