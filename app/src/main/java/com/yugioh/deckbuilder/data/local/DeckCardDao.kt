package com.yugioh.deckbuilder.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface DeckCardDao {

    @Query(
        """
        SELECT deck_cards.deckId as deckId, deck_cards.cardId as cardId, deck_cards.zone as zone, deck_cards.quantity as quantity,
               cards.*
        FROM deck_cards
        INNER JOIN cards ON deck_cards.cardId = cards.id
        WHERE deck_cards.deckId = :deckId
        ORDER BY cards.name ASC
        """
    )
    fun getForDeckWithCards(deckId: Long): Flow<List<DeckCardWithCard>>

    @Query("SELECT * FROM deck_cards WHERE deckId = :deckId AND cardId = :cardId AND zone = :zone LIMIT 1")
    suspend fun get(deckId: Long, cardId: Int, zone: String): DeckCardEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entry: DeckCardEntity)

    @Query("DELETE FROM deck_cards WHERE deckId = :deckId AND cardId = :cardId AND zone = :zone")
    suspend fun delete(deckId: Long, cardId: Int, zone: String)

    @Query("DELETE FROM deck_cards WHERE deckId = :deckId")
    suspend fun deleteAllForDeck(deckId: Long)
}
