// Game Manager - Central orchestrator for all games
const GameState = require('../engine/GameState');
const PhaseManager = require('../engine/PhaseManager');
const ReputationEngine = require('../engine/ReputationEngine');
const { AgentFactory } = require('../agents');
const DatabaseManager = require('../utils/DatabaseManager');
const { EventEmitter } = require('events');

class GameManager extends EventEmitter {
  constructor(dbManager) {
    super();
    this.games = new Map(); // gameId -> { gameState, phaseManager, agents, reputationEngine }
    this.db = dbManager || new DatabaseManager();
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      await this.db.initialize();
      this.initialized = true;
      console.log('Game Manager initialized');
    }
  }

  async createGame(options = {}) {
    await this.initialize();

    const gameId = `game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const gameState = new GameState(gameId);
    
    // Initialize map
    gameState.initializeMap(options.mapType || 'classic');

    // Create agents
    const agentTypes = options.agentTypes || ['conqueror', 'diplomat', 'deceiver', 'opportunist', 'balanced', 'isolationist', 'avenger'];
    const agents = [];

    for (let i = 0; i < 7; i++) {
      const type = agentTypes[i] || 'balanced';
      const agent = AgentFactory.createAgent(type, {
        id: `agent-${i + 1}`,
        name: this.getAgentName(type, i),
        color: this.getAgentColor(i)
      });
      
      gameState.addAgent({
        id: agent.id,
        name: agent.name,
        color: agent.color,
        personality: agent.personality
      });
      
      agents.push(agent);
    }

    // Initialize reputation engine
    const reputationEngine = new ReputationEngine();
    agents.forEach(agent => {
      reputationEngine.initializeAgent(agent.id, agent.name);
      agent.initialize(gameState, reputationEngine);
    });

    // Create phase manager
    const phaseManager = new PhaseManager(gameState);
    this.setupPhaseHandlers(phaseManager, gameState, agents, reputationEngine);

    // Store game
    this.games.set(gameId, {
      gameState,
      phaseManager,
      agents,
      reputationEngine,
      createdAt: Date.now()
    });

    // Save to database
    await this.db.saveGame(gameId, {
      status: 'lobby',
      turn: 1,
      phase: 'lobby',
      createdAt: Date.now()
    });

    this.emit('gameCreated', { gameId, agents: agents.map(a => ({ id: a.id, name: a.name, type: a.personality.type })) });

    return gameState;
  }

  setupPhaseHandlers(phaseManager, gameState, agents, reputationEngine) {
    phaseManager.on('phaseStarted', async (phase) => {
      this.emit('phaseStarted', { gameId: gameState.gameId, phase, turn: gameState.turn });
      
      // Save snapshot
      await this.db.saveSnapshot(gameState.gameId, gameState.turn, phase, gameState.getPublicState());
      
      // Log event
      await this.db.logEvent(gameState.gameId, {
        turn: gameState.turn,
        phase,
        type: 'phase_start',
        timestamp: Date.now()
      });
    });

    phaseManager.on('movesRevealed', async (moves) => {
      for (const move of moves) {
        await this.db.logMove(gameState.gameId, {
          turn: gameState.turn,
          agentId: move.agentId,
          move: move.move,
          signature: move.signature,
          hash: move.hash,
          timestamp: move.timestamp
        });
      }
    });

    phaseManager.on('battlesResolved', async (results) => {
      for (const result of results) {
        await this.db.logBattle(gameState.gameId, {
          turn: gameState.turn,
          ...result
        });
      }
    });

    phaseManager.on('turnStarted', async (turn) => {
      this.emit('turnStarted', { gameId: gameState.gameId, turn });
    });

    phaseManager.on('gameEnded', async (result) => {
      await this.db.endGame(gameState.gameId, result.winner);
      this.emit('gameEnded', { gameId: gameState.gameId, ...result });
    });

    // Listen for conversations
    gameState.on('conversation', async (entry) => {
      await this.db.logConversation({
        ...entry,
        gameId: gameState.gameId
      });
    });

    // Listen for reputation events
    reputationEngine.on('dealProposed', async (deal) => {
      await this.db.saveDeal(gameState.gameId, deal);
    });

    reputationEngine.on('dealBroken', async (deal) => {
      await this.db.saveDeal(gameState.gameId, deal);
    });

    reputationEngine.on('dealCompleted', async (deal) => {
      await this.db.saveDeal(gameState.gameId, deal);
    });
  }

  async startGame(gameId) {
    const game = this.games.get(gameId);
    if (!game) throw new Error('Game not found');

    game.phaseManager.startGame();
    
    await this.db.saveGame(gameId, {
      status: 'active',
      turn: 1,
      phase: 'negotiation',
      updatedAt: Date.now()
    });

    return game.gameState;
  }

  async pauseGame(gameId) {
    const game = this.games.get(gameId);
    if (!game) throw new Error('Game not found');

    game.phaseManager.pause();
    await this.db.saveGame(gameId, { status: 'paused' });
  }

  async resumeGame(gameId) {
    const game = this.games.get(gameId);
    if (!game) throw new Error('Game not found');

    game.phaseManager.resume();
    await this.db.saveGame(gameId, { status: 'active' });
  }

  async stopGame(gameId) {
    const game = this.games.get(gameId);
    if (!game) throw new Error('Game not found');

    game.phaseManager.stop();
    await this.db.endGame(gameId, null);
    this.games.delete(gameId);
  }

  getGame(gameId) {
    const game = this.games.get(gameId);
    return game ? game.gameState : null;
  }

  getGameData(gameId) {
    return this.games.get(gameId);
  }

  getTimeRemaining(gameId) {
    const game = this.games.get(gameId);
    if (!game) return 0;
    return game.phaseManager.getTimeRemaining();
  }

  async listGames(options = {}) {
    if (options.status === 'active') {
      return this.db.getActiveGames();
    } else if (options.status === 'ended') {
      return this.db.getCompletedGames(options.limit);
    } else {
      const active = await this.db.getActiveGames();
      const ended = await this.db.getCompletedGames(options.limit || 10);
      return [...active, ...ended];
    }
  }

  async getGameEvents(gameId, options = {}) {
    return this.db.getGameEvents(gameId, options);
  }

  async getConversations(gameId, options = {}) {
    return this.db.getConversations(gameId, options);
  }

  async getReputations(gameId) {
    return this.db.getReputations(gameId);
  }

  async getDeals(gameId, status) {
    const deals = await this.db.getDeals(gameId);
    if (status) {
      return deals.filter(d => d.status === status);
    }
    return deals;
  }

  async getReplay(gameId) {
    const game = await this.db.loadGame(gameId);
    const snapshots = await this.db.getSnapshots(gameId);
    const events = await this.db.getGameEvents(gameId);
    const conversations = await this.db.getConversations(gameId);
    const battles = await this.db.getBattles(gameId);

    return {
      gameId,
      metadata: game,
      snapshots,
      events,
      conversations,
      battles
    };
  }

  async getSnapshot(gameId, turn) {
    const snapshots = await this.db.getSnapshots(gameId);
    return snapshots.find(s => s.turn === turn);
  }

  async submitMove(gameId, agentId, move) {
    const game = this.games.get(gameId);
    if (!game) throw new Error('Game not found');

    if (game.gameState.phase !== 'commit') {
      throw new Error('Not in commit phase');
    }

    // Create signature
    const crypto = require('crypto');
    const signature = crypto.createHash('sha256')
      .update(`${agentId}:${JSON.stringify(move)}:${Date.now()}`)
      .digest('hex');

    const commitment = game.gameState.commitMove(agentId, move, signature);
    return commitment;
  }

  async sendMessage(gameId, agentId, message, target, type = 'public') {
    const game = this.games.get(gameId);
    if (!game) throw new Error('Game not found');

    const fullMessage = target 
      ? `[To ${target}]: ${message}`
      : message;

    return game.gameState.logConversation(agentId, fullMessage, type);
  }

  getAgentName(type, index) {
    const names = {
      conqueror: ['Alexander', 'Genghis', 'Napoleon', 'Caesar', 'Attila', 'Tamerlane', 'Cyrus'],
      diplomat: ['Bismarck', 'Metternich', 'Richelieu', 'Talleyrand', 'Machiavelli', 'Castlereagh', 'Mazarin'],
      deceiver: ['Iago', 'Morgana', 'Mordred', 'Edmund', 'Grima', 'Petyr', 'Varys'],
      opportunist: ['Cesare', 'Catalina', 'Francis', 'Cromwell', 'Sulla', 'Sejanus', 'Pisistratus'],
      balanced: ['Elizabeth', 'Frederick', 'Augustus', 'Suleiman', 'Charlemagne', 'Saladin', 'Wu'],
      isolationist: ['Tokugawa', 'Shaka', 'Zeno', 'Aethelred', 'Hideyoshi', 'Qin', 'Menelik'],
      avenger: ['Hamlet', 'Orestes', 'Medea', 'Hieronimo', 'Titus', 'Elektra', 'Hecuba']
    };

    const typeNames = names[type] || names.balanced;
    return typeNames[index % typeNames.length];
  }

  getAgentColor(index) {
    const colors = [
      '#dc143c', // Crimson
      '#4169e1', // Royal Blue
      '#800080', // Purple
      '#ffa500', // Orange
      '#228b22', // Forest Green
      '#708090', // Slate Gray
      '#8b0000'  // Dark Red
    ];
    return colors[index % colors.length];
  }

  getActiveGames() {
    return Array.from(this.games.entries()).map(([id, data]) => ({
      gameId: id,
      phase: data.gameState.phase,
      turn: data.gameState.turn,
      agentCount: data.agents.length
    }));
  }
}

module.exports = GameManager;