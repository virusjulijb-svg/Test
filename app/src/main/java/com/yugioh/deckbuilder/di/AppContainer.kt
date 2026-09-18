package com.yugioh.deckbuilder.di

import android.content.Context
import com.yugioh.deckbuilder.data.PreferencesManager
import com.yugioh.deckbuilder.data.local.AppDatabase
import com.yugioh.deckbuilder.data.remote.NetworkModule
import com.yugioh.deckbuilder.data.repository.CardRepository
import com.yugioh.deckbuilder.data.repository.DeckRepository

class AppContainer(context: Context) {

    private val database = AppDatabase.getInstance(context)
    private val api = NetworkModule.provideApi()

    val cardRepository = CardRepository(api, database.cardDao())
    val deckRepository = DeckRepository(database.deckDao(), database.deckCardDao(), database.cardDao())
    val preferencesManager = PreferencesManager(context)
}
