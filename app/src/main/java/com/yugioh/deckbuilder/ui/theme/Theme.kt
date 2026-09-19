package com.yugioh.deckbuilder.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkColors = darkColorScheme(
    primary = GoldPrimary,
    secondary = GoldPrimary,
    background = DarkBackground,
    surface = DarkSurface,
    error = ErrorRed
)

@Composable
fun YugiohDeckbuilderTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColors,
        content = content
    )
}
