// Initialize Database Script
const DatabaseManager = require('../src/utils/DatabaseManager');

async function main() {
  console.log('Initializing Agent Diplomacy database...');
  
  const dbManager = new DatabaseManager();
  
  try {
    await dbManager.initialize();
    console.log('Database initialized successfully!');
    
    // Show stats
    const stats = await dbManager.getGameStats();
    console.log('\nDatabase Stats:');
    console.log(`  Total Games: ${stats.totalGames}`);
    console.log(`  Active Games: ${stats.activeGames}`);
    console.log(`  Completed Games: ${stats.completedGames}`);
    console.log(`  Average Turns (completed): ${Math.round(stats.averageTurns * 10) / 10}`);
    
    await dbManager.close();
    console.log('\nDone!');
  } catch (err) {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  }
}

main();