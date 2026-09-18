package com.yugioh.deckbuilder.ui.navigation

import androidx.compose.runtime.Composable
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.yugioh.deckbuilder.di.AppContainer
import com.yugioh.deckbuilder.ui.deck.DeckEditorScreen
import com.yugioh.deckbuilder.ui.deck.DeckEditorViewModel
import com.yugioh.deckbuilder.ui.decklist.DeckListScreen
import com.yugioh.deckbuilder.ui.decklist.DeckListViewModel
import com.yugioh.deckbuilder.ui.detail.CardDetailScreen
import com.yugioh.deckbuilder.ui.detail.CardDetailViewModel
import com.yugioh.deckbuilder.ui.search.CardSearchScreen
import com.yugioh.deckbuilder.ui.search.CardSearchViewModel

@Composable
fun NavGraph(navController: NavHostController, container: AppContainer) {
    NavHost(navController = navController, startDestination = Destinations.Search.route) {

        composable(Destinations.Search.route) {
            val factory = viewModelFactory {
                initializer {
                    CardSearchViewModel(container.cardRepository, container.deckRepository, container.preferencesManager)
                }
            }
            val viewModel: CardSearchViewModel = viewModel(factory = factory)
            CardSearchScreen(
                viewModel = viewModel,
                onCardClick = { card -> navController.navigate(Destinations.CardDetail.createRoute(card.id)) }
            )
        }

        composable(Destinations.DeckList.route) {
            val factory = viewModelFactory {
                initializer {
                    DeckListViewModel(container.deckRepository, container.preferencesManager)
                }
            }
            val viewModel: DeckListViewModel = viewModel(factory = factory)
            DeckListScreen(
                viewModel = viewModel,
                onOpenDeck = { deckId -> navController.navigate(Destinations.DeckEditor.createRoute(deckId)) }
            )
        }

        composable(
            route = Destinations.DeckEditor.route,
            arguments = listOf(navArgument("deckId") { type = NavType.LongType })
        ) { backStackEntry ->
            val deckId = backStackEntry.arguments?.getLong("deckId") ?: return@composable
            val factory = viewModelFactory {
                initializer {
                    DeckEditorViewModel(deckId, container.deckRepository)
                }
            }
            val viewModel: DeckEditorViewModel = viewModel(factory = factory, key = "deck_$deckId")
            DeckEditorScreen(viewModel = viewModel, onBack = { navController.popBackStack() })
        }

        composable(
            route = Destinations.CardDetail.route,
            arguments = listOf(navArgument("cardId") { type = NavType.IntType })
        ) { backStackEntry ->
            val cardId = backStackEntry.arguments?.getInt("cardId") ?: return@composable
            val factory = viewModelFactory {
                initializer {
                    CardDetailViewModel(cardId, container.cardRepository, container.deckRepository, container.preferencesManager)
                }
            }
            val viewModel: CardDetailViewModel = viewModel(factory = factory, key = "card_$cardId")
            CardDetailScreen(viewModel = viewModel, onBack = { navController.popBackStack() })
        }
    }
}
