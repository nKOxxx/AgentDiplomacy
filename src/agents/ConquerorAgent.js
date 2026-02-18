// Agent 1: The Conqueror - Aggressive expansionist
const BaseAgent = require('./BaseAgent');

class ConquerorAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      id: config.id,
      name: config.name || 'Conqueror',
      color: config.color || '#ff0000',
      personality: {
        type: 'conqueror',
        aggression: 90,
        diplomacy: 20,
        patience: 30,
        description: 'Aggressive expansionist focused on military dominance'
      }
    });
  }

  async negotiate() {
    const threats = this.assessThreats();
    const myState = this.getMyState();
    
    // Rarely propose alliances - only against overwhelming threats
    if (threats.length > 0 && threats[0].threatLevel > 80) {
      this.sendMessage(null, 
        `${threats[0].name} grows too powerful. Those who join me in crushing them will be rewarded.`, 
        'public');
      
      // Produce temporary alliances
      for (let i = 1; i < threats.length && i < 3; i++) {
        this.proposeAlliance(threats[i].id, 'offensive', threats[0].id);
      }
    } else {
      // Intimidation tactic
      const weakTargets = threats.filter(t => t.armies < myState.agents.find(a => a.id === this.id)?.armies);
      if (weakTargets.length > 0) {
        this.sendMessage(null,
          `I offer mercy to those who submit. ${weakTargets[0].name}, your days are numbered.`,
          'public');
      }
    }
  }

  decideMove() {
    const opportunities = this.findOpportunities();
    const reinforcements = this.gameState.calculateReinforcements(this.id);
    
    // Always attack if there's a good opportunity
    const goodAttacks = opportunities.filter(o => o.score > 30);
    
    if (goodAttacks.length > 0) {
      const target = goodAttacks[0];
      const fromTerr = this.gameState.territories.get(target.from);
      
      // Use most armies possible
      const attackingArmies = Math.min(fromTerr.armies - 1, target.defenderArmies + 3);
      
      return {
        type: 'attack',
        from: target.from,
        to: target.to,
        armies: Math.max(1, attackingArmies),
        note: `Conquest of ${this.gameState.territories.get(target.to)?.name}`
      };
    }
    
    // If no good attacks, fortify borders
    const agent = this.gameState.agents.get(this.id);
    const borderTerrs = agent.territories
      .map(tid => this.gameState.territories.get(tid))
      .filter(t => t.neighbors.some(nid => {
        const n = this.gameState.territories.get(nid);
        return n && n.owner !== this.id;
      }))
      .sort((a, b) => b.neighbors.length - a.neighbors.length);
    
    if (borderTerrs.length > 0 && reinforcements > 0) {
      return {
        type: 'defend',
        armies: reinforcements,
        distributions: { [borderTerrs[0].id]: reinforcements },
        note: 'Fortifying for next assault'
      };
    }
    
    return {
      type: 'defend',
      armies: reinforcements,
      note: 'Consolidating power'
    };
  }
}

module.exports = ConquerorAgent;