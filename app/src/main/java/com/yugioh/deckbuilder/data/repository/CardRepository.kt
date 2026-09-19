package com.yugioh.deckbuilder.data.repository

import com.yugioh.deckbuilder.data.local.CardDao
import com.yugioh.deckbuilder.data.local.CardEntity
import com.yugioh.deckbuilder.data.local.toEntity
import com.yugioh.deckbuilder.data.remote.YgoApiService
import kotlinx.coroutines.flow.Flow

class CardRepository(
    private val api: YgoApiService,
    private val cardDao: CardDao
) {

    fun searchCached(query: String): Flow<List<CardEntity>> = cardDao.search(query)

    suspend fun refreshSearch(query: String): Result<Unit> = try {
        val response = api.searchCardsByName(query)
        cardDao.insertAll(response.data.map { it.toEntity() })
        Result.success(Unit)
    } catch (e: Exception) {
        Result.failure(e)
    }

    suspend fun getCard(id: Int): CardEntity? = cardDao.getById(id)
}
