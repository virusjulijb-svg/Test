package com.yugioh.deckbuilder.domain

import com.yugioh.deckbuilder.data.local.DeckCardWithCard

object DeckValidator {

    const val MAIN_MIN = 40
    const val MAIN_MAX = 60
    const val EXTRA_MAX = 15
    const val SIDE_MAX = 15
    const val MAX_COPIES = 3

    data class ValidationResult(
        val mainCount: Int,
        val extraCount: Int,
        val sideCount: Int,
        val errors: List<String>
    ) {
        val isValid: Boolean get() = errors.isEmpty()
    }

    fun validate(entries: List<DeckCardWithCard>): ValidationResult {
        val errors = mutableListOf<String>()

        val mainCount = entries.filter { it.zone == DeckZone.MAIN.name }.sumOf { it.quantity }
        val extraCount = entries.filter { it.zone == DeckZone.EXTRA.name }.sumOf { it.quantity }
        val sideCount = entries.filter { it.zone == DeckZone.SIDE.name }.sumOf { it.quantity }

        if (mainCount < MAIN_MIN || mainCount > MAIN_MAX) {
            errors.add("Hauptdeck: $mainCount Karten (erlaubt $MAIN_MIN-$MAIN_MAX)")
        }
        if (extraCount > EXTRA_MAX) {
            errors.add("Extra Deck: $extraCount Karten (maximal $EXTRA_MAX)")
        }
        if (sideCount > SIDE_MAX) {
            errors.add("Side Deck: $sideCount Karten (maximal $SIDE_MAX)")
        }

        val byName = entries.groupBy { it.card.name }
        for ((name, group) in byName) {
            val total = group.sumOf { it.quantity }
            val banStatus = group.first().card.banTcg
            val limit = when (banStatus) {
                "Forbidden" -> 0
                "Limited" -> 1
                "Semi-Limited" -> 2
                else -> MAX_COPIES
            }
            if (total > limit) {
                errors.add("$name: $total Kopien (erlaubt: $limit)")
            }
        }

        return ValidationResult(mainCount, extraCount, sideCount, errors)
    }
}
