package com.yugioh.deckbuilder.domain

enum class DeckZone {
    MAIN,
    EXTRA,
    SIDE
}

private val EXTRA_DECK_KEYWORDS = listOf("Fusion", "Synchro", "XYZ", "Link")

fun determineZoneForType(type: String): DeckZone {
    return if (EXTRA_DECK_KEYWORDS.any { type.contains(it, ignoreCase = true) }) {
        DeckZone.EXTRA
    } else {
        DeckZone.MAIN
    }
}
