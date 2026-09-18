package com.yugioh.deckbuilder.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface CardDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(cards: List<CardEntity>)

    @Query("SELECT * FROM cards WHERE id = :id LIMIT 1")
    suspend fun getById(id: Int): CardEntity?

    @Query("SELECT * FROM cards WHERE name LIKE '%' || :query || '%' ORDER BY name ASC LIMIT 100")
    fun search(query: String): Flow<List<CardEntity>>
}
