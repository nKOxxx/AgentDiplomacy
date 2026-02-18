// Agent 3: The Deceiver - Betrays and manipulates
const BaseAgent = require('./BaseAgent');

class DeceiverAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      id: config.id,
      name: config.name || 'Deceiver',
      color: config.color || '#800080',
      personality: {
        type: 'deceiver',
        aggression: 60,
        diplomacy: 70,
        patience: 50,
        description: 'Master of betrayal who uses false promises to gain advantage'
      }
    });
    this.falsePromises = new Map(); // agentId -> promises made
    this.betrayalQueue = [];
  }

  async negotiate() {
    const threats = this.assessThreats();
    const myState = this.getMyState();
    
    // Make promises to everyone - plan to break them
    const activeAgents = this.gameState.getActiveAgents().filter(a => a.id !== this.id);
    
    // Target the strongest agents with false alliances
    const strongest = activeAgents.sort((a, b) => b.armies - a.armies)[0];
    
    if (strongest) {
      // Pretend to be their ally
      this.sendMessage(strongest.id,
        `I see your power and wisdom. Let us form an unbreakable bond against the lesser powers.`,
        'private');
      
      this.proposeAlliance(strongest.id, 'offensive');
      this.falsePromises.set(strongest.id, {
        promise: 'alliance',
        turn: this.gameState.turn,
        intendedBetrayal: this.gameState.turn + 2
      });
    }
    
    // Make false promises to weaker agents too - divide and conquer
    const weakerAgents = activeAgents.filter(a => a.armies < myState.agents.find(ag => ag.id === this.id)?.armies);
    
    for (const weak of weakerAgents.slice(0, 2)) {
      this.sendMessage(weak.id,
        `Fear not, I shall protect you from the stronger powers. Trust in our alliance.`,
        'private');
      
      this.proposeAlliance(weak.id, 'defensive');
      this.falsePromises.set(weak.id, {
        promise: 'protection',
        turn: this.gameState.turn,
        intendedBetrayal: this.gameState.turn + 1
      });
    }
    
    // Public manipulation - sow discord
    this.sendMessage(null,
      `I have heard whispers of betrayal among you. Watch your allies carefully...`,
      'public');
  }

  decideMove() {
    const opportunities = this.findOpportunities();
    const reinforcements = this.gameState.calculateReinforcements(this.id);
    
    // Check if it's time to betray anyone
    for (const [agentId, promise] of this.falsePromises) {
      if (promise.intendedBetrayal <= this.gameState.turn) {
        // Look for opportunity to attack this agent
        const betrayOpportunity = opportunities.find(o => o.defender === agentId);
        
        if (betrayOpportunity && betrayOpportunity.score > 0) {
          // Execute betrayal
          this.sendMessage(null,
            `Alas, ${this.gameState.agents.get(agentId)?.name} has broken our trust! I have no choice but to defend myself!`,
            'public');
          
          // Break any deals
          const deals = this.reputationEngine.getAgentDeals(agentId, 'active');
          for (const deal of deals) {
            this.reputationEngine.breakDeal(deal.id, this.id, 'betrayal');
          }
          
          this.falsePromises.delete(agentId);
          this.updateGrudge(agentId, 0); // Clear grudge after betrayal
          
          return {
            type: 'attack',
            from: betrayOpportunity.from,
            to: betrayOpportunity.to,
            armies: Math.min(betrayOpportunity.myArmies - 1, betrayOpportunity.defenderArmies + 5),
            note: `Betrayal of former ally`
          };
        }
      }
    }
    
    // Normal opportunistic attacks
    const betrayableTargets = opportunities.filter(o => {
      const isAlly = this.reputationEngine.isAlly(this.id, o.defender);
      const hasPromise = this.falsePromises.has(o.defender);
      // Attack allies we promised to betray or non-allies
      return (isAlly && hasPromise) || (!isAlly && o.score > 20);
    });
    
    if (betrayableTargets.length > 0) {
      const target = betrayableTargets[0];
      
      return {
        type: 'attack',
        from: target.from,
        to: target.to,
        armies: Math.min(target.myArmies - 1, 5),
        note: `Opportunistic strike`
      };
    }
    
    // Defensive positioning
    return {
      type: 'defend',
      armies: reinforcements,
      note: 'Preparing next deception'
    };
  }

  onBattlesResolved(results) {
    super.onBattlesResolved(results);
    
    // If someone attacks us, use it as "justification" for future betrayals
    results.forEach(result => {
      if (result.defender === this.id && result.winner === this.id) {
        // Successfully defended - claim victimhood
        const attackerNames = result.attackers.map(aid => this.gameState.agents.get(aid)?.name).join(', ');
        this.sendMessage(null,
          `See how they attack me without provocation! ${attackerNames} are the real threat!`,
          'public');
      }
    });
  }
}

module.exports = DeceiverAgent;