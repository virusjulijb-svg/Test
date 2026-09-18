package com.yugioh.deckbuilder.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.yugioh.deckbuilder.data.remote.dto.CardDto

@Entity(tableName = "cards")
data class CardEntity(
    @PrimaryKey val id: Int,
    val name: String,
    val type: String,
    val description: String,
    val atk: Int?,
    val def: Int?,
    val level: Int?,
    val race: String?,
    val attribute: String?,
    val archetype: String?,
    val imageUrl: String?,
    val imageUrlSmall: String?,
    val banTcg: String?
)

fun CardDto.toEntity(): CardEntity = CardEntity(
    id = id,
    name = name,
    type = type,
    description = desc,
    atk = atk,
    def = def,
    level = level,
    race = race,
    attribute = attribute,
    archetype = archetype,
    imageUrl = card_images?.firstOrNull()?.image_url,
    imageUrlSmall = card_images?.firstOrNull()?.image_url_small,
    banTcg = banlist_info?.ban_tcg
)
