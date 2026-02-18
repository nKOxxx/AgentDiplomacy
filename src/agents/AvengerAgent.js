// Agent 7: The Avenger - Holds grudges and seeks retribution
const BaseAgent = require('./BaseAgent');

class AvengerAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      id: config.id,
      name: config.name || 'Avenger',
      color: config.color || '#8b0000',
      personality: {
        type: 'avenger',
        aggression: 70,
        diplomacy: 30,
        patience: 40,
        description: 'Holds grudges forever and prioritizes revenge over victory'
      }
    });
    this.grudgeList = new Map(); // agentId -> grudge level
    this.attackHistory = []; // Who has attacked me
  }

  async negotiate() {
    // Warn others about our grudges
    for (const [agentId, grudge] of this.grudgeList) {
      if (grudge.level > 50) {
        const agent = this.gameState.agents.get(agentId);
        if (agent) {
          this.sendMessage(null,
            `${agent.name}, you have wronged me. There will be consequences.`,
            'public');
        }
      }
    }
    
    // Seek allies against our enemies
    const enemies = this.getEnemies();
    if (enemies.length > 0) {
      for (const enemy of enemies) {
        const potentialAllies = this.findPotentialAllies(enemy.id);
        
        for (const ally of potentialAllies.slice(0, 2)) {
          this.sendMessage(ally.id,
            `${enemy.name} is a threat to us both. Join me in bringing them to justice.`,
            'private');
          
          this.proposeAlliance(ally.id, 'offensive', enemy.id);
        }
      }
    }
  }

  decideMove() {
    const opportunities = this.findOpportunities();
    const reinforcements = this.gameState.calculateReinforcements(this.id);
    
    // Priority 1: Attack our highest grudge target if possible
    const sortedGrudges = Array.from(this.grudgeList.entries())
      .sort((a, b) => b[1].level - a[1].level);
    
    for (const [grudgeId, grudgeData] of sortedGrudges) {
      if (grudgeData.level >= 30) {
        const revengeOpportunity = opportunities.find(o => o.defender === grudgeId);
        
        if (revengeOpportunity) {
          const target = this.gameState.agents.get(grudgeId);
          
          this.sendMessage(null,
            `Your crimes are not forgotten, ${target?.name}. Face judgment!`,
            'public');
          
          // Use maximum force for revenge
          const attackingArmies = Math.min(
            revengeOpportunity.myArmies - 1,
            revengeOpportunity.defenderArmies + 5
          );
          
          return {
            type: 'attack',
            from: revengeOpportunity.from,
            to: revengeOpportunity.to,
            armies: Math.max(1, attackingArmies),
            note: `Revenge against ${target?.name}`
          };
        }
      }
    }
    
    // Priority 2: Good strategic attacks
    const strategicAttacks = opportunities.filter(o => {
      if (o.score < 35) return false;
      if (o.myArmies <= o.defenderArmies) return false;
      return true;
    });
    
    if (strategicAttacks.length > 0) {
      // Prefer attacking agents with grudges
      const grudgeAttack = strategicAttacks.find(o => this.grudgeList.has(o.defender));
      const target = grudgeAttack || strategicAttacks[0];
      
      return {
        type: 'attack',
        from: target.from,
        to: target.to,
        armies: Math.min(target.myArmies - 1, target.defenderArmies + 2),
        note: 'Strategic advance'
      };
    }
    
    // Defensive reinforcement
    const agent = this.gameState.agents.get(this.id);
    const borderTerrs = agent.territories
      .map(tid => this.gameState.territories.get(tid))
      .filter(t => t.neighbors.some(nid => {
        const n = this.gameState.territories.get(nid);
        return n && n.owner !== this.id;
      }));
    
    // Prioritize borders with grudge enemies
    const prioritizedBorders = borderTerrs.sort((a, b) => {
      const grudgeA = Math.max(...a.neighbors.map(nid => {
        const n = this.gameState.territories.get(nid);
        return n ? (this.grudgeList.get(n.owner)?.level || 0) : 0;
      }));
      const grudgeB = Math.max(...b.neighbors.map(nid => {
        const n = this.gameState.territories.get(nid);
        return n ? (this.grudgeList.get(n.owner)?.level || 0) : 0;
      }));
      return grudgeB - grudgeA;
    });
    
    if (prioritizedBorders.length > 0 && reinforcements > 0) {
      return {
        type: 'defend',
        armies: reinforcements,
        distributions: { [prioritizedBorders[0].id]: reinforcements },
        note: 'Preparing for vengeance'
      };
    }
    
    return {
      type: 'defend',
      armies: reinforcements,
      note: 'Consolidating strength'
    };
  }

  onBattlesResolved(results) {
    super.onBattlesResolved(results);
    
    results.forEach(result => {
      // Track who attacked us
      if (result.defender === this.id) {
        result.attackers.forEach(attackerId => {
          this.addGrudge(attackerId, 30, 'attacked me');
          
          this.attackHistory.push({
            turn: this.gameState.turn,
            attacker: attackerId,
            territory: result.territory,
            won: result.winner === this.id
          });
        });
        
        // If we lost territory, MASSIVE grudge
        if (result.winner !== this.id) {
          result.attackers.forEach(attackerId => {
            this.addGrudge(attackerId, 50, 'took my territory');
          });
        }
      }
      
      // If we attacked and won, reduce grudge slightly (vengeance served)
      if (result.attackers.includes(this.id) && result.winner === this.id) {
        const currentGrudge = this.grudgeList.get(result.defender);
        if (currentGrudge) {
          currentGrudge.level = Math.max(0, currentGrudge.level - 20);
        }
      }
    });
  }

  addGrudge(agentId, amount, reason) {
    const current = this.grudgeList.get(agentId);
    if (current) {
      current.level = Math.min(100, current.level + amount);
      current.reasons.push({ reason, turn: this.gameState.turn });
    } else {
      const agent = this.gameState.agents.get(agentId);
      this.grudgeList.set(agentId, {
        agentId,
        agentName: agent?.name || 'Unknown',
        level: amount,
        reasons: [{ reason, turn: this.gameState.turn }],
        created: this.gameState.turn
      });
    }
  }

  getEnemies() {
    return Array.from(this.grudgeList.entries())
      .filter(([_, grudge]) => grudge.level >= 30)
      .map(([id, _]) => this.gameState.agents.get(id))
      .filter(a => a && !a.eliminated);
  }
}

module.exports = AvengerAgent;