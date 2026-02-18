// Agent 4: The Opportunist - Waits for perfect moments to strike
const BaseAgent = require('./BaseAgent');

class OpportunistAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      id: config.id,
      name: config.name || 'Opportunist',
      color: config.color || '#ffa500',
      personality: {
        type: 'opportunist',
        aggression: 50,
        diplomacy: 40,
        patience: 75,
        description: 'Patient observer who waits for the perfect moment to strike'
      }
    });
    this.observedBattles = [];
    this.weaknessMap = new Map(); // agentId -> weakness score
  }

  async negotiate() {
    const threats = this.assessThreats();
    const opportunities = this.findOpportunities();
    
    // Stay mostly quiet but gather information
    const strongest = this.gameState.getActiveAgents()
      .sort((a, b) => b.territories.length - a.territories.length)[0];
    
    if (strongest && strongest.id !== this.id) {
      // Subtle probing
      this.sendMessage(strongest.id,
        `I watch your expansion with interest. The board is shifting.`,
        'private');
    }
    
    // Offer to backstab someone's enemy (for a price)
    const activeConflicts = this.findActiveConflicts();
    for (const conflict of activeConflicts.slice(0, 1)) {
      const weaker = conflict.agents.sort((a, b) => a.armies - b.armies)[0];
      if (weaker && weaker.id !== this.id) {
        this.sendMessage(weaker.id,
          `Your enemy grows bold. For the right consideration, I could... intervene.`,
          'private');
      }
    }
  }

  decideMove() {
    const opportunities = this.findOpportunities();
    const reinforcements = this.gameState.calculateReinforcements(this.id);
    
    // Only attack if it's an EXCELLENT opportunity
    // Criteria: score > 60, defender is weakened, or completing continent
    const excellentOpportunities = opportunities.filter(o => {
      const defender = this.gameState.agents.get(o.defender);
      const defenderRep = this.reputationEngine.getReputation(o.defender);
      
      // High base score
      if (o.score >= 60) return true;
      
      // Defender recently lost territory
      const recentLosses = this.countRecentLosses(o.defender);
      if (recentLosses > 0 && o.score > 30) return true;
      
      // Completing continent is always excellent
      const myTerrs = this.gameState.agents.get(this.id).territories;
      const continent = this.gameState.continents[o.continentBonus?.name?.toLowerCase().replace(' ', '')];
      if (continent) {
        const myContinentTerrs = myTerrs.filter(t => continent.territories.includes(t));
        if (myContinentTerrs.length === continent.territories.length - 1) {
          this.weaknessMap.set(o.defender, 100);
          return true;
        }
      }
      
      return false;
    });
    
    if (excellentOpportunities.length > 0) {
      const target = excellentOpportunities[0];
      const defender = this.gameState.agents.get(target.defender);
      
      // Strike decisively
      this.sendMessage(null,
        `The time has come. ${defender.name} has left themselves exposed.`,
        'public');
      
      return {
        type: 'attack',
        from: target.from,
        to: target.to,
        armies: Math.min(target.myArmies - 1, target.defenderArmies + 4),
        note: `Calculated strike on weakened target`
      };
    }
    
    // Build up strength while waiting
    const agent = this.gameState.agents.get(this.id);
    
    // Find territory with most vulnerable borders to reinforce
    const vulnerableTerrs = agent.territories
      .map(tid => this.gameState.territories.get(tid))
      .filter(t => {
        return t.neighbors.some(nid => {
          const n = this.gameState.territories.get(nid);
          return n && n.owner !== this.id;
        });
      })
      .sort((a, b) => {
        // Sort by neighbor threat level
        const threatA = this.calculateBorderThreat(a);
        const threatB = this.calculateBorderThreat(b);
        return threatB - threatA;
      });
    
    if (vulnerableTerrs.length > 0 && reinforcements > 0) {
      const topThreat = vulnerableTerrs[0];
      
      return {
        type: 'defend',
        armies: reinforcements,
        distributions: { [topThreat.id]: reinforcements },
        note: 'Consolidating for the right moment'
      };
    }
    
    return {
      type: 'defend',
      armies: reinforcements,
      note: 'Watching... waiting...'
    };
  }

  onBattlesResolved(results) {
    super.onBattlesResolved(results);
    
    // Track who is weakening
    results.forEach(result => {
      if (result.winner !== result.defender) {
        // Defender lost - mark them as weakened
        const currentWeakness = this.weaknessMap.get(result.defender) || 0;
        this.weaknessMap.set(result.defender, currentWeakness + 20);
        
        this.observedBattles.push({
          turn: this.gameState.turn,
          loser: result.defender,
          winner: result.winner,
          territory: result.territory
        });
      }
    });
  }

  countRecentLosses(agentId) {
    return this.observedBattles.filter(b => 
      b.loser === agentId && 
      b.turn >= this.gameState.turn - 3
    ).length;
  }

  calculateBorderThreat(territory) {
    let threat = 0;
    
    for (const nid of territory.neighbors) {
      const neighbor = this.gameState.territories.get(nid);
      if (neighbor && neighbor.owner !== this.id) {
        threat += neighbor.armies;
        
        // Higher threat if owner is aggressive
        const rep = this.reputationEngine.getReputation(neighbor.owner);
        if (rep && rep.aggressionScore > 70) {
          threat += 5;
        }
      }
    }
    
    return threat;
  }

  findActiveConflicts() {
    // Look for agents who have attacked each other recently
    const recentBattles = this.observedBattles.filter(b => b.turn >= this.gameState.turn - 5);
    const conflicts = [];
    
    // Group by pairs
    const conflictMap = new Map();
    
    recentBattles.forEach(battle => {
      const key = [battle.winner, battle.loser].sort().join('-');
      if (!conflictMap.has(key)) {
        conflictMap.set(key, { agents: [battle.winner, battle.loser], battles: 0 });
      }
      conflictMap.get(key).battles++;
    });
    
    return Array.from(conflictMap.values())
      .filter(c => c.battles >= 1)
      .sort((a, b) => b.battles - a.battles);
  }
}

module.exports = OpportunistAgent;