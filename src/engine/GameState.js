// Game State Manager - Central state container for Agent Diplomacy
const crypto = require('crypto');
const { EventEmitter } = require('events');

class GameState extends EventEmitter {
  constructor(gameId) {
    super();
    this.gameId = gameId;
    this.phase = 'lobby'; // lobby, negotiation, commit, resolve, ended
    this.turn = 1;
    this.maxTurns = 50;
    this.agents = new Map();
    this.territories = new Map();
    this.alliances = new Map();
    this.conversations = [];
    this.moves = new Map(); // Private commitments
    this.revealedMoves = new Map(); // Public after reveal
    this.history = [];
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.winner = null;
    
    // Phase timing - WATCHABLE gameplay
    this.phaseStartTime = null;
    this.phaseDuration = {
      negotiation: 15000,  // 15 seconds for negotiation (read agent chats)
      commit: 10000,       // 10 seconds for move commitments
      resolve: 8000        // 8 seconds for resolution animation (watch battles)
    };
    
    this.maxTurns = 10;   // 10 turns = ~5.5 minute game
  }

  // Territory management
  initializeMap(mapType = 'classic') {
    const maps = this.getMapDefinitions();
    const map = maps[mapType];
    
    map.territories.forEach(t => {
      this.territories.set(t.id, {
        id: t.id,
        name: t.name,
        region: t.region,
        owner: null,
        armies: 0,
        resources: t.resources || 1,
        neighbors: t.neighbors,
        continent: t.continent
      });
    });

    this.continents = map.continents;
    return this;
  }

  getMapDefinitions() {
    return {
      classic: {
        territories: [
          // North America
          { id: 'na1', name: 'Alaska', region: 'NA', continent: 'na', neighbors: ['na2', 'na7', 'as1'], resources: 1 },
          { id: 'na2', name: 'Alberta', region: 'NA', continent: 'na', neighbors: ['na1', 'na3', 'na7', 'na8'], resources: 1 },
          { id: 'na3', name: 'Central America', region: 'NA', continent: 'na', neighbors: ['na2', 'na4', 'sa1'], resources: 1 },
          { id: 'na4', name: 'Eastern US', region: 'NA', continent: 'na', neighbors: ['na3', 'na8', 'na9'], resources: 2 },
          { id: 'na5', name: 'Greenland', region: 'NA', continent: 'na', neighbors: ['na6', 'na7', 'na8', 'eu1'], resources: 1 },
          { id: 'na6', name: 'Northwest Territory', region: 'NA', continent: 'na', neighbors: ['na1', 'na2', 'na5', 'na7'], resources: 1 },
          { id: 'na7', name: 'Ontario', region: 'NA', continent: 'na', neighbors: ['na1', 'na2', 'na4', 'na6', 'na8', 'na5'], resources: 2 },
          { id: 'na8', name: 'Quebec', region: 'NA', continent: 'na', neighbors: ['na4', 'na7', 'na5'], resources: 1 },
          { id: 'na9', name: 'Western US', region: 'NA', continent: 'na', neighbors: ['na2', 'na3', 'na4', 'na7'], resources: 2 },
          
          // South America
          { id: 'sa1', name: 'Venezuela', region: 'SA', continent: 'sa', neighbors: ['na3', 'sa2', 'sa3'], resources: 1 },
          { id: 'sa2', name: 'Peru', region: 'SA', continent: 'sa', neighbors: ['sa1', 'sa3', 'sa4'], resources: 1 },
          { id: 'sa3', name: 'Brazil', region: 'SA', continent: 'sa', neighbors: ['sa1', 'sa2', 'sa4', 'af4'], resources: 2 },
          { id: 'sa4', name: 'Argentina', region: 'SA', continent: 'sa', neighbors: ['sa2', 'sa3'], resources: 1 },
          
          // Europe
          { id: 'eu1', name: 'Iceland', region: 'EU', continent: 'eu', neighbors: ['na5', 'eu2', 'eu3'], resources: 1 },
          { id: 'eu2', name: 'Scandinavia', region: 'EU', continent: 'eu', neighbors: ['eu1', 'eu3', 'eu4', 'eu5'], resources: 1 },
          { id: 'eu3', name: 'Great Britain', region: 'EU', continent: 'eu', neighbors: ['eu1', 'eu2', 'eu6', 'eu7'], resources: 1 },
          { id: 'eu4', name: 'Northern Europe', region: 'EU', continent: 'eu', neighbors: ['eu2', 'eu5', 'eu6', 'eu7', 'eu8'], resources: 2 },
          { id: 'eu5', name: 'Ukraine', region: 'EU', continent: 'eu', neighbors: ['eu2', 'eu4', 'eu8', 'as3', 'as4', 'as5'], resources: 3 },
          { id: 'eu6', name: 'Western Europe', region: 'EU', continent: 'eu', neighbors: ['eu3', 'eu4', 'eu7', 'af2'], resources: 2 },
          { id: 'eu7', name: 'Southern Europe', region: 'EU', continent: 'eu', neighbors: ['eu3', 'eu4', 'eu6', 'eu8', 'af2', 'af3'], resources: 2 },
          { id: 'eu8', name: 'Middle East', region: 'EU', continent: 'eu', neighbors: ['eu4', 'eu5', 'eu7', 'af3', 'as4', 'as6'], resources: 3 },
          
          // Africa
          { id: 'af1', name: 'Egypt', region: 'AF', continent: 'af', neighbors: ['eu7', 'eu8', 'af2', 'af3', 'af5'], resources: 2 },
          { id: 'af2', name: 'North Africa', region: 'AF', continent: 'af', neighbors: ['eu6', 'eu7', 'af1', 'af3', 'af4'], resources: 2 },
          { id: 'af3', name: 'East Africa', region: 'AF', continent: 'af', neighbors: ['eu7', 'eu8', 'af1', 'af2', 'af4', 'af5', 'af6'], resources: 1 },
          { id: 'af4', name: 'Congo', region: 'AF', continent: 'af', neighbors: ['sa3', 'af2', 'af3', 'af6'], resources: 1 },
          { id: 'af5', name: 'Madagascar', region: 'AF', continent: 'af', neighbors: ['af1', 'af3'], resources: 1 },
          { id: 'af6', name: 'South Africa', region: 'AF', continent: 'af', neighbors: ['af3', 'af4'], resources: 2 },
          
          // Asia
          { id: 'as1', name: 'Siberia', region: 'AS', continent: 'as', neighbors: ['na1', 'as2', 'as3', 'as5', 'as9'], resources: 2 },
          { id: 'as2', name: 'Yakutsk', region: 'AS', continent: 'as', neighbors: ['as1', 'as3', 'as9'], resources: 1 },
          { id: 'as3', name: 'Kamchatka', region: 'AS', continent: 'as', neighbors: ['as1', 'as2', 'as5', 'as9'], resources: 1 },
          { id: 'as4', name: 'Ural', region: 'AS', continent: 'as', neighbors: ['eu5', 'as5', 'as6', 'as8'], resources: 1 },
          { id: 'as5', name: 'Irkutsk', region: 'AS', continent: 'as', neighbors: ['as1', 'as3', 'as6', 'as9'], resources: 1 },
          { id: 'as6', name: 'Mongolia', region: 'AS', continent: 'as', neighbors: ['as4', 'as5', 'as7', 'as9'], resources: 1 },
          { id: 'as7', name: 'Japan', region: 'AS', continent: 'as', neighbors: ['as6', 'as9'], resources: 2 },
          { id: 'as8', name: 'Afghanistan', region: 'AS', continent: 'as', neighbors: ['eu5', 'as4', 'as6', 'as10', 'eu8'], resources: 1 },
          { id: 'as9', name: 'China', region: 'AS', continent: 'as', neighbors: ['as1', 'as5', 'as6', 'as7', 'as8', 'as10', 'as11'], resources: 3 },
          { id: 'as10', name: 'India', region: 'AS', continent: 'as', neighbors: ['as8', 'as9', 'as11', 'eu8'], resources: 2 },
          { id: 'as11', name: 'Southeast Asia', region: 'AS', continent: 'as', neighbors: ['as9', 'as10', 'au1'], resources: 1 },
          
          // Australia
          { id: 'au1', name: 'Indonesia', region: 'AU', continent: 'au', neighbors: ['as11', 'au2', 'au3'], resources: 1 },
          { id: 'au2', name: 'New Guinea', region: 'AU', continent: 'au', neighbors: ['au1', 'au3'], resources: 1 },
          { id: 'au3', name: 'Eastern Australia', region: 'AU', continent: 'au', neighbors: ['au1', 'au2', 'au4'], resources: 2 },
          { id: 'au4', name: 'Western Australia', region: 'AU', continent: 'au', neighbors: ['au3'], resources: 1 }
        ],
        continents: {
          na: { name: 'North America', bonus: 5, territories: ['na1', 'na2', 'na3', 'na4', 'na5', 'na6', 'na7', 'na8', 'na9'] },
          sa: { name: 'South America', bonus: 2, territories: ['sa1', 'sa2', 'sa3', 'sa4'] },
          eu: { name: 'Europe', bonus: 5, territories: ['eu1', 'eu2', 'eu3', 'eu4', 'eu5', 'eu6', 'eu7', 'eu8'] },
          af: { name: 'Africa', bonus: 3, territories: ['af1', 'af2', 'af3', 'af4', 'af5', 'af6'] },
          as: { name: 'Asia', bonus: 7, territories: ['as1', 'as2', 'as3', 'as4', 'as5', 'as6', 'as7', 'as8', 'as9', 'as10', 'as11'] },
          au: { name: 'Australia', bonus: 2, territories: ['au1', 'au2', 'au3', 'au4'] }
        }
      }
    };
  }

  // Agent management
  addAgent(agent) {
    if (this.agents.size >= 7) {
      throw new Error('Maximum 7 agents allowed');
    }
    this.agents.set(agent.id, {
      ...agent,
      territories: [],
      armies: 0,
      resources: 0,
      eliminated: false,
      joinTime: Date.now()
    });
    this.emit('agentJoined', agent);
    return this;
  }

  removeAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      // Return territories to neutral
      agent.territories.forEach(tid => {
        const t = this.territories.get(tid);
        if (t) {
          t.owner = null;
          t.armies = 0;
        }
      });
      this.agents.delete(agentId);
      this.emit('agentLeft', agent);
    }
    return this;
  }

  // Initial placement
  distributeTerritories() {
    const territoryIds = Array.from(this.territories.keys());
    const agentIds = Array.from(this.agents.keys());
    
    // Shuffle territories
    for (let i = territoryIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [territoryIds[i], territoryIds[j]] = [territoryIds[j], territoryIds[i]];
    }

    // Distribute evenly
    territoryIds.forEach((tid, index) => {
      const agentId = agentIds[index % agentIds.length];
      const territory = this.territories.get(tid);
      const agent = this.agents.get(agentId);
      
      territory.owner = agentId;
      territory.armies = 3;
      agent.territories.push(tid);
      agent.armies += 3;
    });

    // Give initial resources
    agentIds.forEach(aid => {
      const agent = this.agents.get(aid);
      agent.resources = 10;
    });

    this.emit('territoriesDistributed');
    return this;
  }

  // Phase management
  setPhase(phase) {
    const oldPhase = this.phase;
    this.phase = phase;
    this.phaseStartTime = Date.now();
    
    this.history.push({
      turn: this.turn,
      phase,
      timestamp: Date.now()
    });

    this.emit('phaseChange', { from: oldPhase, to: phase, turn: this.turn });
    return this;
  }

  // Move commitment (during commit phase)
  commitMove(agentId, move, signature) {
    if (this.phase !== 'commit') {
      throw new Error('Not in commit phase');
    }

    // Validate move structure
    if (!this.validateMove(move)) {
      throw new Error('Invalid move structure');
    }

    // Store signed commitment
    const commitment = {
      agentId,
      move,
      signature,
      timestamp: Date.now(),
      hash: crypto.createHash('sha256').update(JSON.stringify(move)).digest('hex')
    };

    this.moves.set(agentId, commitment);
    this.emit('moveCommitted', { agentId, hash: commitment.hash });

    // Check if all agents have committed
    if (this.moves.size === this.getActiveAgents().length) {
      this.emit('allMovesCommitted');
    }

    return commitment;
  }

  validateMove(move) {
    if (!move || typeof move !== 'object') return false;
    if (!move.type || !['attack', 'defend', 'support', 'move', 'none'].includes(move.type)) return false;
    
    if (move.type === 'attack' || move.type === 'move') {
      if (!move.from || !move.to) return false;
      if (!this.territories.has(move.from) || !this.territories.has(move.to)) return false;
    }
    
    if (move.armies !== undefined && (typeof move.armies !== 'number' || move.armies < 1)) return false;
    
    return true;
  }

  // Reveal all moves
  revealMoves() {
    if (this.phase !== 'resolve') {
      throw new Error('Not in resolve phase');
    }

    this.revealedMoves.clear();
    
    for (const [agentId, commitment] of this.moves) {
      this.revealedMoves.set(agentId, {
        ...commitment,
        revealedAt: Date.now()
      });
    }

    this.emit('movesRevealed', Array.from(this.revealedMoves.values()));
    return Array.from(this.revealedMoves.values());
  }

  // Resolve battles
  resolveBattles() {
    const battles = new Map(); // territory -> { attackers: [], defender }

    // Group attacks by target
    for (const [agentId, commitment] of this.revealedMoves) {
      const move = commitment.move;
      
      if (move.type === 'attack') {
        if (!battles.has(move.to)) {
          battles.set(move.to, { attackers: [], defender: null, supports: [] });
        }
        battles.get(move.to).attackers.push({
          agentId,
          from: move.from,
          armies: move.armies || 1
        });
      }
    }

    // Resolve each battle
    const results = [];
    
    for (const [territoryId, battle] of battles) {
      const territory = this.territories.get(territoryId);
      const defender = this.agents.get(territory.owner);
      
      const result = this.resolveBattle(territory, battle);
      results.push(result);
      
      // Apply result
      if (result.winner !== territory.owner) {
        // Territory changes hands
        const oldOwner = this.agents.get(territory.owner);
        const newOwner = this.agents.get(result.winner);
        
        if (oldOwner) {
          oldOwner.territories = oldOwner.territories.filter(t => t !== territoryId);
          oldOwner.armies -= territory.armies;
        }
        
        newOwner.territories.push(territoryId);
        territory.owner = result.winner;
        territory.armies = result.remainingArmies;
        newOwner.armies += result.remainingArmies;
      } else {
        territory.armies = result.remainingArmies;
      }
    }

    this.emit('battlesResolved', results);
    return results;
  }

  resolveBattle(territory, battle) {
    const defender = territory.owner;
    const defenderArmies = territory.armies;
    
    // Calculate total attack strength
    let totalAttack = 0;
    const attackerForces = {};
    
    battle.attackers.forEach(att => {
      totalAttack += att.armies;
      attackerForces[att.agentId] = (attackerForces[att.agentId] || 0) + att.armies;
    });

    // Add support bonuses
    // TODO: Implement support logic

    // Resolve using dice-based probability
    // Attackers need > defender armies to win
    const attackRoll = Math.random() * totalAttack;
    const defenseRoll = Math.random() * defenderArmies * 1.5; // Defenders get advantage
    
    let winner, remainingArmies;
    
    if (attackRoll > defenseRoll) {
      // Attackers win - strongest attacker gets territory
      winner = Object.entries(attackerForces)
        .sort((a, b) => b[1] - a[1])[0][0];
      remainingArmies = Math.max(1, Math.floor(totalAttack * 0.6));
    } else {
      // Defender wins
      winner = defender;
      remainingArmies = Math.max(1, Math.floor(defenderArmies * 0.7));
    }

    return {
      territory: territory.id,
      defender,
      attackers: battle.attackers.map(a => a.agentId),
      winner,
      remainingArmies,
      attackRoll: Math.round(attackRoll * 100) / 100,
      defenseRoll: Math.round(defenseRoll * 100) / 100
    };
  }

  // Calculate reinforcements
  calculateReinforcements(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent || agent.eliminated) return 0;

    // Base: territories / 3
    let reinforcements = Math.max(3, Math.floor(agent.territories.length / 3));

    // Continent bonuses
    for (const [cid, continent] of Object.entries(this.continents)) {
      const ownsAll = continent.territories.every(tid => {
        const t = this.territories.get(tid);
        return t && t.owner === agentId;
      });
      if (ownsAll) {
        reinforcements += continent.bonus;
      }
    }

    // Resource conversion
    const resourceBonus = Math.floor(agent.resources / 5);
    reinforcements += resourceBonus;
    agent.resources -= resourceBonus * 5;

    return reinforcements;
  }

  // Check win conditions
  checkWinCondition() {
    const activeAgents = this.getActiveAgents();
    
    // Elimination victory
    if (activeAgents.length === 1) {
      this.winner = activeAgents[0].id;
      this.setPhase('ended');
      return { type: 'elimination', winner: this.winner };
    }

    // Territory dominance (60% of map)
    const totalTerritories = this.territories.size;
    for (const agent of activeAgents) {
      if (agent.territories.length / totalTerritories >= 0.6) {
        this.winner = agent.id;
        this.setPhase('ended');
        return { type: 'domination', winner: this.winner };
      }
    }

    // Max turns reached
    if (this.turn >= this.maxTurns) {
      // Winner is agent with most territories
      const winner = activeAgents.sort((a, b) => b.territories.length - a.territories.length)[0];
      this.winner = winner.id;
      this.setPhase('ended');
      return { type: 'turns', winner: this.winner };
    }

    return null;
  }

  getActiveAgents() {
    return Array.from(this.agents.values()).filter(a => !a.eliminated);
  }

  // Conversation logging
  logConversation(agentId, message, type = 'public') {
    const entry = {
      id: crypto.randomUUID(),
      agentId,
      message,
      type, // public, private, alliance
      turn: this.turn,
      phase: this.phase,
      timestamp: Date.now()
    };
    
    this.conversations.push(entry);
    this.emit('conversation', entry);
    return entry;
  }

  // Get public state (for spectators)
  getPublicState() {
    return {
      gameId: this.gameId,
      phase: this.phase,
      turn: this.turn,
      maxTurns: this.maxTurns,
      agents: Array.from(this.agents.values()).map(a => ({
        id: a.id,
        name: a.name,
        color: a.color,
        territories: a.territories.length,
        armies: a.armies,
        resources: a.resources,
        eliminated: a.eliminated,
        personality: a.personality?.type
      })),
      territories: Array.from(this.territories.values()).map(t => ({
        id: t.id,
        name: t.name,
        owner: t.owner,
        armies: t.armies,
        region: t.region,
        continent: t.continent,
        neighbors: t.neighbors
      })),
      conversations: this.conversations.filter(c => c.type === 'public'),
      winner: this.winner,
      phaseStartTime: this.phaseStartTime,
      phaseDuration: this.phaseDuration[this.phase]
    };
  }

  // Get agent private state
  getAgentState(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return null;

    return {
      ...this.getPublicState(),
      myTerritories: agent.territories,
      myResources: agent.resources,
      myCommitment: this.moves.get(agentId)?.hash || null,
      revealedMoves: Array.from(this.revealedMoves.values())
        .filter(m => this.phase === 'resolve' || m.agentId === agentId)
    };
  }

  // Cleanup for next turn
  endTurn() {
    this.turn++;
    this.moves.clear();
    this.revealedMoves.clear();
    this.lastActivity = Date.now();
    
    // Reset alliances that expired
    // TODO: Alliance expiration logic

    this.emit('turnEnd', this.turn);
    return this;
  }

  // Serialization
  toJSON() {
    return {
      gameId: this.gameId,
      phase: this.phase,
      turn: this.turn,
      maxTurns: this.maxTurns,
      agents: Array.from(this.agents.entries()),
      territories: Array.from(this.territories.entries()),
      conversations: this.conversations,
      history: this.history,
      winner: this.winner,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity
    };
  }

  static fromJSON(data) {
    const game = new GameState(data.gameId);
    game.phase = data.phase;
    game.turn = data.turn;
    game.maxTurns = data.maxTurns;
    game.agents = new Map(data.agents);
    game.territories = new Map(data.territories);
    game.conversations = data.conversations;
    game.history = data.history;
    game.winner = data.winner;
    game.createdAt = data.createdAt;
    game.lastActivity = data.lastActivity;
    return game;
  }
}

module.exports = GameState;