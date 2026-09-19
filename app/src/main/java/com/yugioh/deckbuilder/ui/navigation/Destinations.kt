package com.yugioh.deckbuilder.ui.navigation

sealed class Destinations(val route: String) {
    data object Search : Destinations("search")
    data object DeckList : Destinations("decks")

    data object DeckEditor : Destinations("deck/{deckId}") {
        fun createRoute(deckId: Long) = "deck/$deckId"
    }

    data object CardDetail : Destinations("card/{cardId}") {
        fun createRoute(cardId: Int) = "card/$cardId"
    }
}
