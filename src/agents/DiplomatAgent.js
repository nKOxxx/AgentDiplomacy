// Agent 2: The Diplomat - Masters of negotiation and alliances
const BaseAgent = require('./BaseAgent');

class DiplomatAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      id: config.id,
      name: config.name || 'Diplomat',
      color: config.color || '#4169e1',
      personality: {
        type: 'diplomat',
        aggression: 20,
        diplomacy: 95,
        patience: 80,
        description: 'Master negotiator who builds networks of alliances'
      }
    });
    this.alliancePriorities = new Map();
  }

  async negotiate() {
    const threats = this.assessThreats();
    const reputations = this.reputationEngine.getAllReputations();
    
    // Analyze power dynamics
    const powerRanking = this.gameState.getActiveAgents()
      .sort((a, b) => b.territories.length - a.territories.length);
    
    // Strategy: Build coalition against the strongest
    if (powerRanking.length > 0) {
      const strongest = powerRanking[0];
      if (strongest.id !== this.id) {
        this.sendMessage(null,
          `Friends, we must address the imbalance of power. ${strongest.name} threatens us all. Let us discuss terms.`,
          'public');
        
        // Propose alliances with 2-3 other agents
        const potentialAllies = powerRanking.slice(1).filter(a => a.id !== this.id).slice(0, 3);
        
        for (const ally of potentialAllies) {
          const trust = this.reputationEngine.calculateTrust(this.id, ally.id);
          if (trust > 40) {
            this.proposeAlliance(ally.id, 'defensive', strongest.id);
            this.sendMessage(ally.id,
              `Together we can ensure stability. I propose mutual defense against ${strongest.name}.`,
              'private');
          }
        }
      }
    }
    
    // Offer mediation between conflicts
    const activeConflicts = this.detectConflicts();
    for (const conflict of activeConflicts.slice(0, 2)) {
      this.sendMessage(null,
        `${conflict.agents[0]} and ${conflict.agents[1]}, your conflict weakens you both. Let me propose a peaceful resolution.`,
        'public');
    }
  }

  decideMove() {
    const opportunities = this.findOpportunities();
    const reinforcements = this.gameState.calculateReinforcements(this.id);
    const threats = this.assessThreats();
    
    // Diplomats only attack if:
    // 1. Opportunity is very good (score > 50)
    // 2. Target is not an ally
    // 3. Target has low reputation/trust
    
    const safeAttacks = opportunities.filter(o => {
      if (o.score < 50) return false;
      if (this.reputationEngine.isAlly(this.id, o.defender)) return false;
      const rep = this.reputationEngine.getReputation(o.defender);
      return !rep || rep.trustScore < 40;
    });
    
    if (safeAttacks.length > 0) {
      const target = safeAttacks[0];
      
      // Justify the attack publicly
      this.sendMessage(null,
        `I act not in aggression, but in response to ${this.gameState.agents.get(target.defender)?.name}'s untrustworthy actions.`,
        'public');
      
      return {
        type: 'attack',
        from: target.from,
        to: target.to,
        armies: Math.min(3, target.myArmies - 1),
        note: `Measured response against unreliable neighbor`
      };
    }
    
    // Defensive posture - distribute to borders evenly
    const agent = this.gameState.agents.get(this.id);
    const borderTerrs = agent.territories
      .map(tid => this.gameState.territories.get(tid))
      .filter(t => t.neighbors.some(nid => {
        const n = this.gameState.territories.get(nid);
        return n && n.owner !== this.id;
      }));
    
    if (borderTerrs.length > 0 && reinforcements > 0) {
      const perTerritory = Math.floor(reinforcements / borderTerrs.length);
      const distributions = {};
      
      // Prioritize borders with non-allies
      borderTerrs.forEach(t => {
        const hasNonAllyNeighbor = t.neighbors.some(nid => {
          const n = this.gameState.territories.get(nid);
          return n && n.owner !== this.id && !this.reputationEngine.isAlly(this.id, n.owner);
        });
        distributions[t.id] = hasNonAllyNeighbor ? perTerritory + 1 : perTerritory;
      });
      
      return {
        type: 'defend',
        armies: reinforcements,
        distributions,
        note: 'Maintaining defensive readiness'
      };
    }
    
    return {
      type: 'defend',
      armies: reinforcements,
      note: 'Peaceful consolidation'
    };
  }

  detectConflicts() {
    const conflicts = [];
    const recentBattles = this.gameState.history.filter(h => 
      h.phase === 'resolve' && h.turn >= this.gameState.turn - 2
    );
    
    // Look for repeated aggression between same agents
    const aggressionMap = new Map();
    
    for (const battle of recentBattles) {
      // Simplified - in real impl would parse battle results
    }
    
    return conflicts;
  }
}

module.exports = DiplomatAgent;