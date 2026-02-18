// Phase Manager - State machine for game phases
const { EventEmitter } = require('events');

class PhaseManager extends EventEmitter {
  constructor(gameState) {
    super();
    this.gameState = gameState;
    this.timers = new Map();
    this.isRunning = false;
    
    // Bind to game state events
    this.gameState.on('allMovesCommitted', () => {
      if (this.gameState.phase === 'commit') {
        this.advancePhase();
      }
    });
  }

  startGame() {
    if (this.gameState.agents.size < 2) {
      throw new Error('Need at least 2 agents to start');
    }

    this.gameState.distributeTerritories();
    this.isRunning = true;
    this.transitionTo('negotiation');
    this.emit('gameStarted', this.gameState.gameId);
    
    return this;
  }

  transitionTo(phase) {
    // Clear existing timers
    this.clearTimers();
    
    // Set new phase
    this.gameState.setPhase(phase);
    
    // Set up phase-specific timer
    switch(phase) {
      case 'negotiation':
        this.setupNegotiationPhase();
        break;
      case 'commit':
        this.setupCommitPhase();
        break;
      case 'resolve':
        this.setupResolvePhase();
        break;
      case 'ended':
        this.handleGameEnd();
        break;
    }

    this.emit('phaseStarted', phase);
    return this;
  }

  setupNegotiationPhase() {
    const duration = this.gameState.phaseDuration.negotiation;
    
    // Allow agents to negotiate
    this.emit('negotiationStarted', {
      turn: this.gameState.turn,
      duration,
      agents: Array.from(this.gameState.agents.keys())
    });

    // Auto-advance timer
    const timer = setTimeout(() => {
      this.advancePhase();
    }, duration);
    
    this.timers.set('phase', timer);

    // Warning at 10 seconds remaining
    const warningTimer = setTimeout(() => {
      this.emit('phaseWarning', { phase: 'negotiation', secondsRemaining: 10 });
    }, duration - 10000);
    
    this.timers.set('warning', warningTimer);
  }

  setupCommitPhase() {
    const duration = this.gameState.phaseDuration.commit;
    
    this.emit('commitStarted', {
      turn: this.gameState.turn,
      duration,
      agentsNeedingMoves: this.getAgentsNeedingMoves()
    });

    // Auto-advance timer
    const timer = setTimeout(() => {
      this.advancePhase();
    }, duration);
    
    this.timers.set('phase', timer);

    // Warning at 5 seconds remaining
    const warningTimer = setTimeout(() => {
      this.emit('phaseWarning', { phase: 'commit', secondsRemaining: 5 });
    }, duration - 5000);
    
    this.timers.set('warning', warningTimer);
  }

  setupResolvePhase() {
    const duration = this.gameState.phaseDuration.resolve;
    
    // Reveal all committed moves
    this.gameState.revealMoves();
    
    // Resolve battles
    const results = this.gameState.resolveBattles();
    
    // Distribute reinforcements
    this.distributeReinforcements();
    
    this.emit('resolveStarted', {
      turn: this.gameState.turn,
      results,
      duration
    });

    // Auto-advance to next turn
    const timer = setTimeout(() => {
      this.endTurn();
    }, duration);
    
    this.timers.set('phase', timer);
  }

  advancePhase() {
    const currentPhase = this.gameState.phase;
    
    switch(currentPhase) {
      case 'lobby':
        this.startGame();
        break;
      case 'negotiation':
        this.transitionTo('commit');
        break;
      case 'commit':
        // Commit default moves for agents that didn't submit
        this.commitDefaultMoves();
        this.transitionTo('resolve');
        break;
      case 'resolve':
        this.endTurn();
        break;
    }
  }

  commitDefaultMoves() {
    const activeAgents = this.gameState.getActiveAgents();
    
    for (const agent of activeAgents) {
      if (!this.gameState.moves.has(agent.id)) {
        // Default: defend with reinforcements
        const reinforcements = this.gameState.calculateReinforcements(agent.id);
        
        const defaultMove = {
          type: 'defend',
          armies: reinforcements,
          distributions: this.calculateDefensiveDistribution(agent, reinforcements)
        };

        // Create signature (in real impl, would be cryptographic)
        const signature = this.createMoveSignature(agent.id, defaultMove);
        
        try {
          this.gameState.commitMove(agent.id, defaultMove, signature);
        } catch (err) {
          console.error(`Failed to commit default move for ${agent.id}:`, err);
        }
      }
    }
  }

  calculateDefensiveDistribution(agent, reinforcements) {
    // Distribute reinforcements to border territories
    const distributions = {};
    const borderTerritories = agent.territories.filter(tid => {
      const t = this.gameState.territories.get(tid);
      return t.neighbors.some(nid => {
        const neighbor = this.gameState.territories.get(nid);
        return neighbor.owner !== agent.id;
      });
    });

    if (borderTerritories.length === 0) {
      // No borders, distribute evenly
      const perTerritory = Math.floor(reinforcements / agent.territories.length);
      agent.territories.forEach(tid => {
        distributions[tid] = perTerritory;
      });
    } else {
      // Prioritize borders
      const perBorder = Math.floor(reinforcements / borderTerritories.length);
      borderTerritories.forEach(tid => {
        distributions[tid] = perBorder;
      });
    }

    return distributions;
  }

  createMoveSignature(agentId, move) {
    // Simplified signature for demo - in production use proper crypto
    const crypto = require('crypto');
    const data = `${agentId}:${JSON.stringify(move)}:${Date.now()}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  distributeReinforcements() {
    const activeAgents = this.gameState.getActiveAgents();
    
    for (const agent of activeAgents) {
      const reinforcements = this.gameState.calculateReinforcements(agent.id);
      agent.armies += reinforcements;
      
      // Distribute to territories (simplified - evenly)
      if (agent.territories.length > 0) {
        const perTerritory = Math.floor(reinforcements / agent.territories.length);
        agent.territories.forEach(tid => {
          const t = this.gameState.territories.get(tid);
          t.armies += perTerritory;
        });
      }
    }
  }

  endTurn() {
    // Check win condition
    const winResult = this.gameState.checkWinCondition();
    
    if (winResult) {
      this.emit('gameEnded', winResult);
      return;
    }

    // Clean up turn
    this.gameState.endTurn();
    
    // Start next turn
    this.transitionTo('negotiation');
    
    this.emit('turnStarted', this.gameState.turn);
  }

  getAgentsNeedingMoves() {
    const activeAgents = this.gameState.getActiveAgents();
    return activeAgents
      .filter(a => !this.gameState.moves.has(a.id))
      .map(a => a.id);
  }

  clearTimers() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  pause() {
    this.clearTimers();
    this.emit('gamePaused');
    return this;
  }

  resume() {
    // Resume current phase
    this.transitionTo(this.gameState.phase);
    this.emit('gameResumed');
    return this;
  }

  stop() {
    this.clearTimers();
    this.isRunning = false;
    this.gameState.setPhase('ended');
    this.emit('gameStopped');
    return this;
  }

  handleGameEnd() {
    this.clearTimers();
    this.isRunning = false;
    
    this.emit('gameEnded', {
      winner: this.gameState.winner,
      turns: this.gameState.turn,
      finalState: this.gameState.getPublicState()
    });
  }

  getTimeRemaining() {
    if (!this.gameState.phaseStartTime) return 0;
    
    const elapsed = Date.now() - this.gameState.phaseStartTime;
    const duration = this.gameState.phaseDuration[this.gameState.phase] || 0;
    
    return Math.max(0, duration - elapsed);
  }
}

module.exports = PhaseManager;