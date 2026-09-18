package com.yugioh.deckbuilder.data.repository

import com.yugioh.deckbuilder.data.local.CardDao
import com.yugioh.deckbuilder.data.local.CardEntity
import com.yugioh.deckbuilder.data.local.DeckCardDao
import com.yugioh.deckbuilder.data.local.DeckCardEntity
import com.yugioh.deckbuilder.data.local.DeckCardWithCard
import com.yugioh.deckbuilder.data.local.DeckDao
import com.yugioh.deckbuilder.data.local.DeckEntity
import com.yugioh.deckbuilder.domain.DeckZone
import kotlinx.coroutines.flow.Flow

class DeckRepository(
    private val deckDao: DeckDao,
    private val deckCardDao: DeckCardDao,
    private val cardDao: CardDao
) {

    fun getDecks(): Flow<List<DeckEntity>> = deckDao.getAll()

    suspend fun createDeck(name: String): Long = deckDao.insert(DeckEntity(name = name))

    suspend fun renameDeck(deck: DeckEntity, newName: String) {
        deckDao.update(deck.copy(name = newName))
    }

    suspend fun deleteDeck(deck: DeckEntity) {
        deckCardDao.deleteAllForDeck(deck.id)
        deckDao.delete(deck)
    }

    fun getDeckContents(deckId: Long): Flow<List<DeckCardWithCard>> = deckCardDao.getForDeckWithCards(deckId)

    suspend fun addCard(deckId: Long, card: CardEntity, zone: DeckZone) {
        cardDao.insertAll(listOf(card))
        val existing = deckCardDao.get(deckId, card.id, zone.name)
        val newQuantity = (existing?.quantity ?: 0) + 1
        deckCardDao.upsert(DeckCardEntity(deckId, card.id, zone.name, newQuantity))
    }

    suspend fun removeCard(deckId: Long, cardId: Int, zone: DeckZone) {
        val existing = deckCardDao.get(deckId, cardId, zone.name) ?: return
        if (existing.quantity <= 1) {
            deckCardDao.delete(deckId, cardId, zone.name)
        } else {
            deckCardDao.upsert(existing.copy(quantity = existing.quantity - 1))
        }
    }

    suspend fun moveCard(deckId: Long, cardId: Int, from: DeckZone, to: DeckZone) {
        if (from == to) return
        val existing = deckCardDao.get(deckId, cardId, from.name) ?: return
        deckCardDao.delete(deckId, cardId, from.name)
        val target = deckCardDao.get(deckId, cardId, to.name)
        val newQuantity = (target?.quantity ?: 0) + existing.quantity
        deckCardDao.upsert(DeckCardEntity(deckId, cardId, to.name, newQuantity))
    }
}
