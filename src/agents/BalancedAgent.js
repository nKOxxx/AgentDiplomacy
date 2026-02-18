// Agent 5: The Balanced - Adaptive strategy based on situation
const BaseAgent = require('./BaseAgent');

class BalancedAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      id: config.id,
      name: config.name || 'Balanced',
      color: config.color || '#228b22',
      personality: {
        type: 'balanced',
        aggression: 50,
        diplomacy: 60,
        patience: 60,
        description: 'Adaptive strategist who adjusts tactics based on game state'
      }
    });
    this.strategy = 'balanced'; // balanced, aggressive, defensive
  }

  async negotiate() {
    this.updateStrategy();
    
    const threats = this.assessThreats();
    const myPower = this.calculatePower();
    
    switch(this.strategy) {
      case 'aggressive':
        // Seek allies against strongest
        if (threats.length > 0) {
          this.sendMessage(null,
            `The time for half-measures is over. ${threats[0].name} must be stopped.`,
            'public');
          
          for (let i = 1; i < threats.length && i < 3; i++) {
            this.proposeAlliance(threats[i].id, 'offensive', threats[0].id);
          }
        }
        break;
        
      case 'defensive':
        // Seek protection alliances
        if (threats.length > 0 && threats[0].threatLevel > 60) {
          this.sendMessage(null,
            `I seek trustworthy allies for mutual protection. Our survival depends on cooperation.`,
            'public');
          
          const potentialAllies = this.findPotentialAllies(threats[0].id)
            .filter(a => a.trustScore > 50)
            .slice(0, 2);
          
          for (const ally of potentialAllies) {
            this.proposeAlliance(ally.id, 'defensive', threats[0].id);
          }
        }
        break;
        
      default: // balanced
        // Opportunistic diplomacy
        if (threats.length > 0) {
          this.sendMessage(null,
            `The board shifts. I am open to discussions with those who value stability.`,
            'public');
        }
    }
  }

  decideMove() {
    this.updateStrategy();
    
    const opportunities = this.findOpportunities();
    const reinforcements = this.gameState.calculateReinforcements(this.id);
    
    switch(this.strategy) {
      case 'aggressive':
        return this.aggressiveMove(opportunities, reinforcements);
      case 'defensive':
        return this.defensiveMove(opportunities, reinforcements);
      default:
        return this.balancedMove(opportunities, reinforcements);
    }
  }

  aggressiveMove(opportunities, reinforcements) {
    // Attack best opportunity regardless of risk
    const viable = opportunities.filter(o => o.score > 20 && o.myArmies > o.defenderArmies);
    
    if (viable.length > 0) {
      const target = viable[0];
      return {
        type: 'attack',
        from: target.from,
        to: target.to,
        armies: Math.min(target.myArmies - 1, target.defenderArmies + 3),
        note: 'Aggressive expansion'
      };
    }
    
    return this.defensiveMove(opportunities, reinforcements);
  }

  defensiveMove(opportunities, reinforcements) {
    const agent = this.gameState.agents.get(this.id);
    
    // Find most threatened border
    const threatened = agent.territories
      .map(tid => this.gameState.territories.get(tid))
      .filter(t => t.neighbors.some(nid => {
        const n = this.gameState.territories.get(nid);
        return n && n.owner !== this.id;
      }))
      .sort((a, b) => {
        const threatA = a.neighbors.reduce((sum, nid) => {
          const n = this.gameState.territories.get(nid);
          return sum + (n && n.owner !== this.id ? n.armies : 0);
        }, 0);
        const threatB = b.neighbors.reduce((sum, nid) => {
          const n = this.gameState.territories.get(nid);
          return sum + (n && n.owner !== this.id ? n.armies : 0);
        }, 0);
        return threatB - threatA;
      });
    
    if (threatened.length > 0) {
      return {
        type: 'defend',
        armies: reinforcements,
        distributions: { [threatened[0].id]: reinforcements },
        note: 'Defensive consolidation'
      };
    }
    
    return {
      type: 'defend',
      armies: reinforcements,
      note: 'Fortifying position'
    };
  }

  balancedMove(opportunities, reinforcements) {
    // Attack only good opportunities with acceptable risk
    const goodAttacks = opportunities.filter(o => {
      if (o.score < 40) return false;
      if (o.myArmies <= o.defenderArmies) return false;
      if (this.reputationEngine.isAlly(this.id, o.defender)) return false;
      return true;
    });
    
    if (goodAttacks.length > 0) {
      const target = goodAttacks[0];
      return {
        type: 'attack',
        from: target.from,
        to: target.to,
        armies: Math.min(target.myArmies - 1, target.defenderArmies + 2),
        note: 'Calculated advance'
      };
    }
    
    // Otherwise defend
    return this.defensiveMove(opportunities, reinforcements);
  }

  updateStrategy() {
    const threats = this.assessThreats();
    const myPower = this.calculatePower();
    const avgPower = this.calculateAveragePower();
    
    // Decide strategy based on relative power
    if (myPower > avgPower * 1.3) {
      // We're strong - be aggressive
      this.strategy = 'aggressive';
    } else if (myPower < avgPower * 0.7 || (threats[0] && threats[0].threatLevel > 70)) {
      // We're weak or threatened - be defensive
      this.strategy = 'defensive';
    } else {
      this.strategy = 'balanced';
    }
  }

  calculatePower() {
    const agent = this.gameState.agents.get(this.id);
    if (!agent) return 0;
    
    // Power = armies + territories * 2 + resources
    return agent.armies + (agent.territories.length * 2);
  }

  calculateAveragePower() {
    const agents = this.gameState.getActiveAgents();
    let total = 0;
    
    for (const agent of agents) {
      total += agent.armies + (agent.territories.length * 2);
    }
    
    return agents.length > 0 ? total / agents.length : 0;
  }
}

module.exports = BalancedAgent;