package com.yugioh.deckbuilder.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "settings")

class PreferencesManager(private val context: Context) {

    private val activeDeckKey = longPreferencesKey("active_deck_id")

    val activeDeckId: Flow<Long?> = context.dataStore.data.map { prefs -> prefs[activeDeckKey] }

    suspend fun setActiveDeck(id: Long) {
        context.dataStore.edit { it[activeDeckKey] = id }
    }

    suspend fun clearActiveDeck() {
        context.dataStore.edit { it.remove(activeDeckKey) }
    }
}
