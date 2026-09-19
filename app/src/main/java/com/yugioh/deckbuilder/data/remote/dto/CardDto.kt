package com.yugioh.deckbuilder.data.remote.dto

data class CardApiResponse(
    val data: List<CardDto> = emptyList()
)

data class CardDto(
    val id: Int,
    val name: String,
    val type: String,
    val desc: String,
    val atk: Int? = null,
    val def: Int? = null,
    val level: Int? = null,
    val race: String? = null,
    val attribute: String? = null,
    val archetype: String? = null,
    val card_images: List<CardImageDto>? = null,
    val banlist_info: BanlistInfoDto? = null
)

data class CardImageDto(
    val id: Int,
    val image_url: String,
    val image_url_small: String
)

data class BanlistInfoDto(
    val ban_tcg: String? = null
)
