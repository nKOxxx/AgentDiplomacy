// Main Server - Entry point for Agent Diplomacy
const http = require('http');
const DatabaseManager = require('./utils/DatabaseManager');
const GameManager = require('./api/GameManager');
const APIServer = require('./api/server');
const WebSocketServer = require('./api/WebSocketServer');

// Configuration
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || './db/games.db';

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║          AGENT DIPLOMACY - Territory Control           ║');
  console.log('║           AI-Powered Strategy Game Server              ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log();

  try {
    // Initialize database
    console.log('[1/4] Initializing database...');
    const dbManager = new DatabaseManager(DB_PATH);
    await dbManager.initialize();
    
    const stats = await dbManager.getGameStats();
    console.log(`      Database ready. Total games: ${stats.totalGames}, Active: ${stats.activeGames}`);

    // Initialize game manager
    console.log('[2/4] Initializing game manager...');
    const gameManager = new GameManager(dbManager);
    await gameManager.initialize();
    console.log('      Game manager ready');

    // Create HTTP server
    console.log('[3/4] Starting API server...');
    const apiServer = new APIServer(gameManager, gameManager.reputationEngine);
    const httpServer = apiServer.listen(PORT);
    console.log(`      API server listening on http://localhost:${PORT}`);

    // Create WebSocket server
    console.log('[4/4] Starting WebSocket server...');
    const wsServer = new WebSocketServer(httpServer, gameManager);
    console.log('      WebSocket server ready');

    console.log();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Server is running!');
    console.log();
    console.log('Endpoints:');
    console.log(`  - API:     http://localhost:${PORT}/api`);
    console.log(`  - WebSocket: ws://localhost:${PORT}?gameId=<gameId>&type=spectator`);
    console.log(`  - Web UI:  http://localhost:${PORT}`);
    console.log();
    console.log('Quick Start:');
    console.log('  1. Create a game:  POST /api/games');
    console.log('  2. Start the game: POST /api/games/:gameId/start');
    console.log('  3. Watch the game: Connect to WebSocket');
    console.log('═══════════════════════════════════════════════════════════');

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n\nShutting down gracefully...');
      
      wsServer.close();
      apiServer.close();
      await dbManager.close();
      
      console.log('Goodbye!');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n\nShutting down gracefully...');
      
      wsServer.close();
      apiServer.close();
      await dbManager.close();
      
      console.log('Goodbye!');
      process.exit(0);
    });

    // Auto-create a demo game if none exist
    if (stats.totalGames === 0) {
      console.log('\n[Demo] Creating initial game...');
      try {
        const game = await gameManager.createGame();
        console.log(`       Created demo game: ${game.gameId}`);
        
        // Start the game after a short delay
        setTimeout(async () => {
          try {
            await gameManager.startGame(game.gameId);
            console.log(`       Started demo game: ${game.gameId}`);
            console.log(`       View at: http://localhost:${PORT}?gameId=${game.gameId}`);
          } catch (err) {
            console.error('Failed to start demo game:', err.message);
          }
        }, 2000);
      } catch (err) {
        console.error('Failed to create demo game:', err.message);
      }
    }

  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };