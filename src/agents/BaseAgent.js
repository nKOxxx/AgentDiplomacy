// Base Agent Controller - All agent personalities extend this
const crypto = require('crypto');
const EventEmitter = require('events');

class BaseAgent extends EventEmitter {
  constructor(config) {
    super();
    this.id = config.id || crypto.randomUUID();
    this.name = config.name || 'Agent';
    this.color = config.color || '#ffffff';
    this.personality = config.personality || {};
    
    // Memory and state
    this.memory = {
      threats: new Map(),      // agentId -> threat level
      opportunities: new Map(), // territoryId -> opportunity score
      alliances: new Map(),    // agentId -> alliance strength
      grudges: new Map(),      // agentId -> grudge level
      deals: []                // History of deals
    };
    
    this.gameState = null;
    this.reputationEngine = null;
  }

  initialize(gameState, reputationEngine) {
    this.gameState = gameState;
    this.reputationEngine = reputationEngine;
    
    // Listen to game events
    gameState.on('phaseChange', (data) => this.onPhaseChange(data));
    gameState.on('conversation', (data) => this.onConversation(data));
    gameState.on('battlesResolved', (data) => this.onBattlesResolved(data));
    
    reputationEngine.initializeAgent(this.id, this.name);
  }

  // Override in subclasses
  async onPhaseChange({ to, turn }) {
    switch(to) {
      case 'negotiation':
        await this.negotiate();
        break;
      case 'commit':
        await this.commitMove();
        break;
    }
  }

  async onConversation(entry) {
    // Process conversation from other agents
    if (entry.agentId !== this.id) {
      this.analyzeMessage(entry);
    }
  }

  async onBattlesResolved(results) {
    // Update threat assessments based on battle outcomes
    results.forEach(result => {
      if (result.winner === this.id) {
        // Victory - reduce threat from defender
        this.updateThreat(result.defender, -10);
      } else if (result.defender === this.id) {
        // Defended - increase threat from attackers
        result.attackers.forEach(att => this.updateThreat(att, +15));
      }
    });
  }

  // Core decision methods - override in subclasses
  async negotiate() {
    // Default: minimal negotiation
    const agentState = this.gameState.getAgentState(this.id);
    const threats = this.assessThreats();
    
    if (threats.length > 0) {
      // Propose defensive alliance against biggest threat
      const biggestThreat = threats[0];
      const potentialAllies = this.findPotentialAllies(biggestThreat.id);
      
      for (const ally of potentialAllies.slice(0, 2)) {
        this.proposeAlliance(ally.id, 'defensive', biggestThreat.id);
      }
    }
  }

  async commitMove() {
    const move = this.decideMove();
    const signature = this.signMove(move);
    
    try {
      this.gameState.commitMove(this.id, move, signature);
    } catch (err) {
      console.error(`${this.name} failed to commit move:`, err);
    }
  }

  decideMove() {
    // Default implementation - defend
    const reinforcements = this.gameState.calculateReinforcements(this.id);
    
    return {
      type: 'defend',
      armies: reinforcements,
      note: 'Default defensive stance'
    };
  }

  // Utility methods
  assessThreats() {
    const agentState = this.gameState.getAgentState(this.id);
    const threats = [];
    
    for (const agent of this.gameState.getActiveAgents()) {
      if (agent.id === this.id) continue;
      
      // Calculate threat level
      let threatLevel = 0;
      
      // Armies
      threatLevel += agent.armies * 0.5;
      
      // Border proximity
      const sharedBorders = this.countSharedBorders(agent.id);
      threatLevel += sharedBorders * 10;
      
      // Recent aggression
      const rep = this.reputationEngine.getReputation(agent.id);
      if (rep) {
        threatLevel += rep.aggressionScore * 0.3;
        threatLevel += this.memory.grudges.get(agent.id) || 0;
      }
      
      // Grudges
      if (this.memory.grudges.has(agent.id)) {
        threatLevel += this.memory.grudges.get(agent.id);
      }
      
      threats.push({
        id: agent.id,
        name: agent.name,
        threatLevel: Math.round(threatLevel),
        armies: agent.armies,
        territories: agent.territories.length
      });
    }
    
    return threats.sort((a, b) => b.threatLevel - a.threatLevel);
  }

  findOpportunities() {
    const agent = this.gameState.agents.get(this.id);
    const opportunities = [];
    
    // Find weak neighbor territories
    for (const myTerrId of agent.territories) {
      const myTerr = this.gameState.territories.get(myTerrId);
      
      for (const neighborId of myTerr.neighbors) {
        const neighbor = this.gameState.territories.get(neighborId);
        
        if (neighbor.owner !== this.id) {
          const owner = this.gameState.agents.get(neighbor.owner);
          const opportunityScore = this.calculateOpportunityScore(myTerr, neighbor, owner);
          
          opportunities.push({
            from: myTerrId,
            to: neighborId,
            defender: neighbor.owner,
            defenderArmies: neighbor.armies,
            myArmies: myTerr.armies,
            score: opportunityScore,
            continentBonus: this.gameState.continents[neighbor.continent]
          });
        }
      }
    }
    
    return opportunities.sort((a, b) => b.score - a.score);
  }

  calculateOpportunityScore(from, to, defender) {
    let score = 0;
    
    // Army advantage
    const advantage = from.armies - to.armies;
    score += advantage * 5;
    
    // Weak defender bonus
    if (to.armies <= 1) score += 20;
    
    // Resource value
    score += to.resources * 5;
    
    // Strategic value (completing continent)
    const myTerrs = this.gameState.agents.get(this.id).territories;
    const continent = this.gameState.continents[to.continent];
    const continentTerrs = new Set(continent.territories);
    const myContinentTerrs = myTerrs.filter(t => continentTerrs.has(t));
    
    if (myContinentTerrs.length === continent.territories.length - 1) {
      score += continent.bonus * 10; // Completing continent is valuable
    }
    
    // Defender reputation
    const rep = this.reputationEngine.getReputation(defender?.id);
    if (rep && rep.trustScore < 30) {
      score += 10; // Easier to justify attacking untrustworthy agent
    }
    
    return score;
  }

  countSharedBorders(agentId) {
    const myAgent = this.gameState.agents.get(this.id);
    const otherAgent = this.gameState.agents.get(agentId);
    
    if (!myAgent || !otherAgent) return 0;
    
    let shared = 0;
    for (const myTerrId of myAgent.territories) {
      const myTerr = this.gameState.territories.get(myTerrId);
      for (const neighborId of myTerr.neighbors) {
        if (otherAgent.territories.includes(neighborId)) {
          shared++;
        }
      }
    }
    
    return shared;
  }

  findPotentialAllies(againstAgentId) {
    const candidates = [];
    
    for (const agent of this.gameState.getActiveAgents()) {
      if (agent.id === this.id || agent.id === againstAgentId) continue;
      
      // Check if they also border the threat
      const bordersThreat = this.countSharedBorders(agent.id) > 0;
      
      // Check reputation
      const rep = this.reputationEngine.getReputation(agent.id);
      const trustScore = this.reputationEngine.calculateTrust(this.id, agent.id);
      
      candidates.push({
        id: agent.id,
        name: agent.name,
        bordersThreat,
        trustScore,
        rep
      });
    }
    
    return candidates.sort((a, b) => b.trustScore - a.trustScore);
  }

  proposeAlliance(targetId, type, against = null) {
    const message = against 
      ? `I propose a ${type} alliance with ${this.gameState.agents.get(targetId)?.name}. We face a common threat.`
      : `I propose a ${type} alliance with ${this.gameState.agents.get(targetId)?.name}. Together we are stronger.`;
    
    this.gameState.logConversation(this.id, message, 'public');
    
    this.reputationEngine.recordDeal({
      turn: this.gameState.turn,
      phase: this.gameState.phase,
      proposer: this.id,
      acceptor: targetId,
      type: type === 'defensive' ? 'non-aggression' : 'alliance',
      terms: { against, duration: 3 }
    });
    
    this.memory.alliances.set(targetId, { type, since: this.gameState.turn });
  }

  sendMessage(targetId, message, type = 'private') {
    const fullMessage = type === 'private'
      ? `[To ${this.gameState.agents.get(targetId)?.name}]: ${message}`
      : message;
    
    this.gameState.logConversation(this.id, fullMessage, type);
  }

  analyzeMessage(entry) {
    // Simple sentiment analysis
    const message = entry.message.toLowerCase();
    
    // Check for alliance proposals
    if (message.includes('alliance') || message.includes('propose')) {
      if (message.includes(this.name.toLowerCase()) || 
          message.includes('everyone') || 
          message.includes('all agents')) {
        this.memory.deals.push({
          from: entry.agentId,
          type: 'proposal',
          turn: entry.turn,
          message: entry.message
        });
      }
    }
    
    // Check for threats
    if (message.includes('attack') || message.includes('destroy') || message.includes('crush')) {
      if (message.includes(this.name.toLowerCase())) {
        this.updateThreat(entry.agentId, 20);
        this.updateGrudge(entry.agentId, 10);
      }
    }
  }

  updateThreat(agentId, delta) {
    const current = this.memory.threats.get(agentId) || 0;
    this.memory.threats.set(agentId, Math.max(0, Math.min(100, current + delta)));
  }

  updateGrudge(agentId, delta) {
    const current = this.memory.grudges.get(agentId) || 0;
    this.memory.grudges.set(agentId, Math.max(0, current + delta));
  }

  signMove(move) {
    const data = `${this.id}:${JSON.stringify(move)}:${Date.now()}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  getMyState() {
    return this.gameState.getAgentState(this.id);
  }

  getName() {
    return this.name;
  }
}

module.exports = BaseAgent;