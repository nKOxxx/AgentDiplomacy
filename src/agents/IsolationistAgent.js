// Agent 6: The Isolationist - Focuses on own territory, minimal interaction
const BaseAgent = require('./BaseAgent');

class IsolationistAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      id: config.id,
      name: config.name || 'Isolationist',
      color: config.color || '#708090',
      personality: {
        type: 'isolationist',
        aggression: 20,
        diplomacy: 10,
        patience: 90,
        description: 'Self-focused agent that avoids conflict and builds internal strength'
      }
    });
    this.fortressTerritories = new Set();
  }

  async negotiate() {
    // Minimal negotiation - only non-aggression pacts with immediate neighbors
    const agent = this.gameState.agents.get(this.id);
    const neighbors = new Set();
    
    // Find all neighboring agents
    for (const tid of agent.territories) {
      const t = this.gameState.territories.get(tid);
      for (const nid of t.neighbors) {
        const n = this.gameState.territories.get(nid);
        if (n && n.owner !== this.id) {
          neighbors.add(n.owner);
        }
      }
    }
    
    // Request non-aggression from neighbors
    if (this.gameState.turn === 1 || this.gameState.turn % 5 === 0) {
      for (const neighborId of neighbors) {
        const neighbor = this.gameState.agents.get(neighborId);
        if (neighbor) {
          this.sendMessage(neighborId,
            `I seek only peace and security. A non-aggression pact would benefit us both.`,
            'private');
          
          this.reputationEngine.recordDeal({
            turn: this.gameState.turn,
            phase: this.gameState.phase,
            proposer: this.id,
            acceptor: neighborId,
            type: 'non-aggression',
            terms: { duration: 5 }
          });
        }
      }
    }
    
    // Occasional public statement
    if (this.gameState.turn % 10 === 1) {
      this.sendMessage(null,
        `I turn inward, strengthening my lands. Let others waste themselves in conflict.`,
        'public');
    }
  }

  decideMove() {
    const opportunities = this.findOpportunities();
    const reinforcements = this.gameState.calculateReinforcements(this.id);
    const agent = this.gameState.agents.get(this.id);
    
    // Only attack if:
    // 1. We have overwhelming advantage (3:1)
    // 2. Target is not a neighbor we've promised peace to
    // 3. It's a territorial necessity (completing continent)
    
    const necessaryAttacks = opportunities.filter(o => {
      // Check for continent completion
      const continent = this.gameState.continents[o.continentBonus?.name?.toLowerCase().replace(' ', '')];
      if (continent) {
        const myContinentTerrs = agent.territories.filter(t => continent.territories.includes(t));
        if (myContinentTerrs.length === continent.territories.length - 1) {
          return o.myArmies >= o.defenderArmies * 2;
        }
      }
      
      // Overwhelming advantage only
      return o.myArmies >= o.defenderArmies * 3 && !this.reputationEngine.isAlly(this.id, o.defender);
    });
    
    if (necessaryAttacks.length > 0) {
      const target = necessaryAttacks[0];
      
      this.sendMessage(null,
        `Reluctantly, I expand to secure necessary resources. I seek no wider conflict.`,
        'public');
      
      return {
        type: 'attack',
        from: target.from,
        to: target.to,
        armies: Math.ceil(target.defenderArmies * 1.5),
        note: 'Necessary expansion for security'
      };
    }
    
    // Defensive reinforcement - build fortress
    const borderTerrs = agent.territories
      .map(tid => this.gameState.territories.get(tid))
      .filter(t => t.neighbors.some(nid => {
        const n = this.gameState.territories.get(nid);
        return n && n.owner !== this.id;
      }));
    
    if (borderTerrs.length > 0) {
      // Identify choke points (territories with many neighbors)
      const chokePoints = borderTerrs
        .sort((a, b) => {
          const enemyNeighborsA = a.neighbors.filter(nid => {
            const n = this.gameState.territories.get(nid);
            return n && n.owner !== this.id;
          }).length;
          const enemyNeighborsB = b.neighbors.filter(nid => {
            const n = this.gameState.territories.get(nid);
            return n && n.owner !== this.id;
          }).length;
          return enemyNeighborsB - enemyNeighborsA;
        });
      
      const distributions = {};
      
      // Heavily fortify choke points
      if (chokePoints.length > 0 && reinforcements > 0) {
        const primaryChoke = chokePoints[0];
        const secondaryChokes = chokePoints.slice(1, 3);
        
        distributions[primaryChoke.id] = Math.ceil(reinforcements * 0.5);
        let remaining = reinforcements - distributions[primaryChoke.id];
        
        secondaryChokes.forEach(t => {
          const amount = Math.floor(remaining / secondaryChokes.length);
          distributions[t.id] = amount;
          remaining -= amount;
        });
        
        // Distribute remainder to other borders
        if (remaining > 0) {
          borderTerrs.forEach(t => {
            if (!distributions[t.id]) {
              distributions[t.id] = 1;
              remaining--;
            }
          });
        }
      }
      
      return {
        type: 'defend',
        armies: reinforcements,
        distributions,
        note: 'Fortifying defensive positions'
      };
    }
    
    return {
      type: 'defend',
      armies: reinforcements,
      note: 'Internal development'
    };
  }

  onBattlesResolved(results) {
    super.onBattlesResolved(results);
    
    // If attacked, increase fortification of that border
    results.forEach(result => {
      if (result.defender === this.id) {
        // Mark this territory as needing more defense
        this.fortressTerritories.add(result.territory);
        
        // Issue warning
        const attackers = result.attackers.map(aid => this.gameState.agents.get(aid)?.name).join(', ');
        this.sendMessage(null,
          `${attackers} violate my borders. My defenses will be strengthened.`,
          'public');
      }
    });
  }
}

module.exports = IsolationistAgent;