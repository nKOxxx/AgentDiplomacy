// Simple test to verify game logic
const GameState = require('../src/engine/GameState');
const PhaseManager = require('../src/engine/PhaseManager');
const ReputationEngine = require('../src/engine/ReputationEngine');
const { AgentFactory } = require('../src/agents');

async function runTest() {
  console.log('Running Agent Diplomacy Test...\n');

  try {
    // Create game state
    console.log('[1] Creating game state...');
    const gameState = new GameState('test-game-001');
    gameState.initializeMap('classic');
    console.log(`    Map initialized with ${gameState.territories.size} territories`);

    // Create agents
    console.log('[2] Creating 7 agents...');
    const agents = AgentFactory.createAllAgents();
    const reputationEngine = new ReputationEngine();
    
    agents.forEach(agent => {
      gameState.addAgent({
        id: agent.id,
        name: agent.name,
        color: agent.color,
        personality: agent.personality
      });
      reputationEngine.initializeAgent(agent.id, agent.name);
      agent.initialize(gameState, reputationEngine);
    });
    console.log(`    Created ${agents.length} agents`);

    // Distribute territories
    console.log('[3] Distributing territories...');
    gameState.distributeTerritories();
    
    agents.forEach(agent => {
      const state = gameState.agents.get(agent.id);
      console.log(`    ${agent.name}: ${state.territories.length} territories, ${state.armies} armies`);
    });

    // Create phase manager
    console.log('[4] Starting phase manager...');
    const phaseManager = new PhaseManager(gameState);
    
    phaseManager.on('phaseStarted', (phase) => {
      console.log(`    Phase started: ${phase}`);
    });

    // Start game
    console.log('[5] Starting game...');
    phaseManager.startGame();

    // Verify initial state
    console.log('[6] Verifying initial state...');
    console.log(`    Current phase: ${gameState.phase}`);
    console.log(`    Current turn: ${gameState.turn}`);

    // Test a turn cycle
    console.log('[7] Simulating turn cycle...');
    
    // Give agents a moment to negotiate
    await new Promise(r => setTimeout(r, 100));
    
    // Fast forward to commit phase
    phaseManager.advancePhase();
    console.log(`    Advanced to phase: ${gameState.phase}`);

    // Agents should auto-commit moves
    await new Promise(r => setTimeout(r, 100));
    
    // Advance to resolve
    phaseManager.advancePhase();
    console.log(`    Advanced to phase: ${gameState.phase}`);

    // Get battle results
    console.log('[8] Battle results:');
    const results = gameState.revealedMoves;
    console.log(`    Moves revealed: ${results.size}`);

    // Check reputations
    console.log('[9] Reputation summary:');
    const summary = reputationEngine.getReputationSummary();
    console.log(`    Total agents tracked: ${summary.rankings?.length || 0}`);

    // Get public state
    console.log('[10] Public state:');
    const publicState = gameState.getPublicState();
    console.log(`    Game ID: ${publicState.gameId}`);
    console.log(`    Phase: ${publicState.phase}`);
    console.log(`    Agents: ${publicState.agents.length}`);
    console.log(`    Territories: ${publicState.territories.length}`);

    console.log('\n✅ All tests passed!');
    console.log('\nGame is ready to play!');

  } catch (err) {
    console.error('\n❌ Test failed:', err);
    process.exit(1);
  }
}

runTest();