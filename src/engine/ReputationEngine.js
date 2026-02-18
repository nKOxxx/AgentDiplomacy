// Reputation Engine - Track agent trustworthiness and deal history
const { EventEmitter } = require('events');

class ReputationEngine extends EventEmitter {
  constructor() {
    super();
    this.agentReputations = new Map(); // agentId -> ReputationData
    this.deals = new Map(); // dealId -> DealData
    this.alliances = new Map(); // allianceId -> AllianceData
    this.dealHistory = []; // All historical deals
  }

  initializeAgent(agentId, name) {
    this.agentReputations.set(agentId, {
      agentId,
      name,
      trustScore: 50, // 0-100 scale, 50 is neutral
      dealsMade: 0,
      dealsKept: 0,
      dealsBroken: 0,
      alliancesHonored: 0,
      alliancesBroken: 0,
      betrayals: [], // List of agents betrayed
      betrayedBy: [], // List of agents who betrayed this agent
      consistencyScore: 50, // How predictable/consistently honest
      aggressionScore: 50, // How aggressive (attacks vs diplomacy)
      diplomacyScore: 50, // How much they negotiate vs act silently
      history: [],
      lastUpdated: Date.now()
    });
  }

  // Deal tracking
  recordDeal(deal) {
    const dealData = {
      id: deal.id || this.generateId(),
      turn: deal.turn,
      phase: deal.phase,
      proposer: deal.proposer,
      acceptor: deal.acceptor,
      terms: deal.terms,
      type: deal.type, // 'non-aggression', 'alliance', 'trade', 'attack-agreement'
      status: 'pending', // pending, active, completed, broken, expired
      createdAt: Date.now(),
      expiresAt: deal.expiresAt || null,
      fulfilled: {
        [deal.proposer]: false,
        [deal.acceptor]: false
      },
      brokenBy: null,
      brokenAt: null
    };

    this.deals.set(dealData.id, dealData);
    
    // Update reputations for both parties
    this.updateDealCounts(deal.proposer, 'made');
    this.updateDealCounts(deal.acceptor, 'made');

    this.emit('dealProposed', dealData);
    return dealData;
  }

  acceptDeal(dealId, acceptorId) {
    const deal = this.deals.get(dealId);
    if (!deal) throw new Error('Deal not found');
    if (deal.acceptor !== acceptorId) throw new Error('Not authorized to accept');
    
    deal.status = 'active';
    deal.acceptedAt = Date.now();
    
    this.emit('dealAccepted', deal);
    return deal;
  }

  fulfillDeal(dealId, agentId) {
    const deal = this.deals.get(dealId);
    if (!deal) return false;
    if (deal.status !== 'active') return false;

    deal.fulfilled[agentId] = true;
    
    // Check if both parties fulfilled
    const allFulfilled = Object.values(deal.fulfilled).every(v => v === true);
    if (allFulfilled) {
      deal.status = 'completed';
      deal.completedAt = Date.now();
      
      this.updateDealCounts(deal.proposer, 'kept');
      this.updateDealCounts(deal.acceptor, 'kept');
      
      this.emit('dealCompleted', deal);
    } else {
      this.emit('dealPartiallyFulfilled', { deal, agentId });
    }

    return true;
  }

  breakDeal(dealId, agentId, reason) {
    const deal = this.deals.get(dealId);
    if (!deal) return false;
    if (deal.status !== 'active' && deal.status !== 'pending') return false;

    deal.status = 'broken';
    deal.brokenBy = agentId;
    deal.brokenAt = Date.now();
    deal.breakReason = reason;

    // Update betrayals
    const otherParty = deal.proposer === agentId ? deal.acceptor : deal.proposer;
    
    this.recordBetrayal(agentId, otherParty, deal.type);
    
    this.updateDealCounts(agentId, 'broken');
    this.updateDealCounts(otherParty, 'kept'); // Other party kept their end

    this.emit('dealBroken', deal);
    return deal;
  }

  recordBetrayal(betrayerId, victimId, type) {
    // Update betrayer's reputation
    const betrayer = this.agentReputations.get(betrayerId);
    if (betrayer) {
      betrayer.betrayals.push({
        victim: victimId,
        type,
        turn: this.currentTurn,
        timestamp: Date.now()
      });
      betrayer.trustScore = Math.max(0, betrayer.trustScore - 10);
    }

    // Update victim's record
    const victim = this.agentReputations.get(victimId);
    if (victim) {
      victim.betrayedBy.push({
        betrayer: betrayerId,
        type,
        turn: this.currentTurn,
        timestamp: Date.now()
      });
    }

    this.emit('betrayalRecorded', { betrayer: betrayerId, victim: victimId, type });
  }

  // Alliance tracking
  formAlliance(alliance) {
    const allianceData = {
      id: alliance.id || this.generateId(),
      name: alliance.name || `Alliance ${this.alliances.size + 1}`,
      members: new Set(alliance.members),
      type: alliance.type || 'defensive', // defensive, offensive, trade
      formedAt: Date.now(),
      expiresAt: alliance.expiresAt || null,
      status: 'active',
      brokenBy: null,
      terms: alliance.terms || {}
    };

    this.alliances.set(allianceData.id, allianceData);
    
    // Update reputation for all members
    alliance.members.forEach(memberId => {
      this.updateAllianceCounts(memberId, 'formed');
    });

    this.emit('allianceFormed', allianceData);
    return allianceData;
  }

  breakAlliance(allianceId, agentId, reason) {
    const alliance = this.alliances.get(allianceId);
    if (!alliance) return false;
    if (!alliance.members.has(agentId)) return false;

    alliance.status = 'broken';
    alliance.brokenBy = agentId;
    alliance.brokenAt = Date.now();
    alliance.breakReason = reason;

    // Record betrayals for all other members
    alliance.members.forEach(memberId => {
      if (memberId !== agentId) {
        this.recordBetrayal(agentId, memberId, 'alliance');
        this.updateAllianceCounts(memberId, 'honored');
      }
    });

    this.updateAllianceCounts(agentId, 'broken');

    this.emit('allianceBroken', alliance);
    return alliance;
  }

  leaveAlliance(allianceId, agentId) {
    const alliance = this.alliances.get(allianceId);
    if (!alliance) return false;
    
    alliance.members.delete(agentId);
    
    if (alliance.members.size < 2) {
      alliance.status = 'dissolved';
      this.emit('allianceDissolved', alliance);
    } else {
      this.emit('allianceMemberLeft', { alliance, agentId });
    }

    return true;
  }

  // Action analysis for reputation scoring
  analyzeAction(action) {
    const { agentId, type, target, context } = action;
    const rep = this.agentReputations.get(agentId);
    if (!rep) return;

    switch(type) {
      case 'attack':
        // Check if attacking an ally
        if (this.isAlly(agentId, target)) {
          this.recordBetrayal(agentId, target, 'attack-ally');
        }
        rep.aggressionScore = Math.min(100, rep.aggressionScore + 2);
        break;
        
      case 'negotiate':
        rep.diplomacyScore = Math.min(100, rep.diplomacyScore + 1);
        break;
        
      case 'propose-deal':
        rep.diplomacyScore = Math.min(100, rep.diplomacyScore + 2);
        break;
        
      case 'break-deal':
        rep.trustScore = Math.max(0, rep.trustScore - 15);
        break;
        
      case 'keep-deal':
        rep.trustScore = Math.min(100, rep.trustScore + 5);
        rep.consistencyScore = Math.min(100, rep.consistencyScore + 2);
        break;
    }

    rep.history.push({
      type,
      target,
      context,
      timestamp: Date.now()
    });

    // Trim history if too long
    if (rep.history.length > 100) {
      rep.history = rep.history.slice(-100);
    }

    rep.lastUpdated = Date.now();
    this.emit('reputationUpdated', { agentId, rep });
  }

  // Helper methods
  updateDealCounts(agentId, type) {
    const rep = this.agentReputations.get(agentId);
    if (!rep) return;

    switch(type) {
      case 'made':
        rep.dealsMade++;
        break;
      case 'kept':
        rep.dealsKept++;
        break;
      case 'broken':
        rep.dealsBroken++;
        break;
    }

    // Recalculate trust score based on deal history
    const totalCompleted = rep.dealsKept + rep.dealsBroken;
    if (totalCompleted > 0) {
      const baseTrust = (rep.dealsKept / totalCompleted) * 100;
      // Weight recent behavior more heavily
      rep.trustScore = Math.round((rep.trustScore * 0.3) + (baseTrust * 0.7));
    }
  }

  updateAllianceCounts(agentId, type) {
    const rep = this.agentReputations.get(agentId);
    if (!rep) return;

    switch(type) {
      case 'formed':
        // No counter for forming
        break;
      case 'honored':
        rep.alliancesHonored++;
        break;
      case 'broken':
        rep.alliancesBroken++;
        break;
    }
  }

  isAlly(agentId1, agentId2) {
    for (const alliance of this.alliances.values()) {
      if (alliance.status === 'active' && 
          alliance.members.has(agentId1) && 
          alliance.members.has(agentId2)) {
        return true;
      }
    }
    return false;
  }

  getActiveAlliances(agentId) {
    return Array.from(this.alliances.values())
      .filter(a => a.status === 'active' && a.members.has(agentId));
  }

  getReputation(agentId) {
    return this.agentReputations.get(agentId);
  }

  getAllReputations() {
    return Array.from(this.agentReputations.values());
  }

  getAgentDeals(agentId, status = null) {
    return Array.from(this.deals.values())
      .filter(d => d.proposer === agentId || d.acceptor === agentId)
      .filter(d => !status || d.status === status);
  }

  // Trust calculation between two agents
  calculateTrust(agentId1, agentId2) {
    const rep1 = this.agentReputations.get(agentId1);
    const rep2 = this.agentReputations.get(agentId2);
    
    if (!rep1 || !rep2) return 0;

    // Base trust is average of both agents' trust scores
    let trust = (rep1.trustScore + rep2.trustScore) / 2;

    // Adjust for history between them
    const betrayals1to2 = rep1.betrayals.filter(b => b.victim === agentId2).length;
    const betrayals2to1 = rep2.betrayals.filter(b => b.victim === agentId1).length;
    
    trust -= betrayals1to2 * 10;
    trust -= betrayals2to1 * 10;

    // Check for current alliance
    if (this.isAlly(agentId1, agentId2)) {
      trust += 20;
    }

    // Check for pending deals
    const pendingDeals = this.getAgentDeals(agentId1, 'active')
      .filter(d => d.proposer === agentId2 || d.acceptor === agentId2);
    if (pendingDeals.length > 0) {
      trust += 10;
    }

    return Math.max(0, Math.min(100, trust));
  }

  // Get reputation summary for display
  getReputationSummary() {
    const summary = {
      rankings: [],
      mostTrusted: null,
      leastTrusted: null,
      mostAggressive: null,
      bestDiplomat: null
    };

    const reps = this.getAllReputations();
    
    if (reps.length === 0) return summary;

    // Sort by trust score
    summary.rankings = reps
      .map(r => ({
        agentId: r.agentId,
        name: r.name,
        trustScore: r.trustScore,
        dealsMade: r.dealsMade,
        dealsKept: r.dealsKept,
        dealsBroken: r.dealsBroken,
        betrayalCount: r.betrayals.length,
        betrayedCount: r.betrayedBy.length
      }))
      .sort((a, b) => b.trustScore - a.trustScore);

    summary.mostTrusted = summary.rankings[0];
    summary.leastTrusted = summary.rankings[summary.rankings.length - 1];
    
    summary.mostAggressive = reps
      .sort((a, b) => b.aggressionScore - a.aggressionScore)[0];
    
    summary.bestDiplomat = reps
      .sort((a, b) => b.diplomacyScore - a.diplomacyScore)[0];

    return summary;
  }

  generateId() {
    return Math.random().toString(36).substring(2, 15);
  }

  // Serialization
  toJSON() {
    return {
      reputations: Array.from(this.agentReputations.entries()),
      deals: Array.from(this.deals.entries()),
      alliances: Array.from(this.alliances.entries()).map(([id, a]) => [id, {
        ...a,
        members: Array.from(a.members)
      }]),
      dealHistory: this.dealHistory
    };
  }

  static fromJSON(data) {
    const engine = new ReputationEngine();
    
    engine.agentReputations = new Map(data.reputations);
    engine.deals = new Map(data.deals);
    engine.alliances = new Map(data.alliances.map(([id, a]) => [id, {
      ...a,
      members: new Set(a.members)
    }]));
    engine.dealHistory = data.dealHistory || [];
    
    return engine;
  }
}

module.exports = ReputationEngine;