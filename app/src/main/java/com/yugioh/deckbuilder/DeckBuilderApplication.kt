package com.yugioh.deckbuilder

import android.app.Application
import com.yugioh.deckbuilder.di.AppContainer

class DeckBuilderApplication : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
