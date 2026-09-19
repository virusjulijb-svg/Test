package com.yugioh.deckbuilder.data.remote

import com.yugioh.deckbuilder.data.remote.dto.CardApiResponse
import retrofit2.http.GET
import retrofit2.http.Query

interface YgoApiService {

    @GET("cardinfo.php")
    suspend fun searchCardsByName(@Query("fname") name: String): CardApiResponse

    @GET("cardinfo.php")
    suspend fun getCardById(@Query("id") id: Int): CardApiResponse
}
