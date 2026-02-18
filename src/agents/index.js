// Agent Factory - Creates and manages agent instances
const ConquerorAgent = require('./ConquerorAgent');
const DiplomatAgent = require('./DiplomatAgent');
const DeceiverAgent = require('./DeceiverAgent');
const OpportunistAgent = require('./OpportunistAgent');
const BalancedAgent = require('./BalancedAgent');
const IsolationistAgent = require('./IsolationistAgent');
const AvengerAgent = require('./AvengerAgent');

const AGENT_TYPES = {
  conqueror: ConquerorAgent,
  diplomat: DiplomatAgent,
  deceiver: DeceiverAgent,
  opportunist: OpportunistAgent,
  balanced: BalancedAgent,
  isolationist: IsolationistAgent,
  avenger: AvengerAgent
};

const AGENT_PRESETS = [
  {
    type: 'conqueror',
    name: 'Conqueror',
    color: '#dc143c',
    description: 'Aggressive expansionist focused on military dominance'
  },
  {
    type: 'diplomat',
    name: 'Diplomat',
    color: '#4169e1',
    description: 'Master negotiator who builds networks of alliances'
  },
  {
    type: 'deceiver',
    name: 'Deceiver',
    color: '#800080',
    description: 'Master of betrayal who uses false promises'
  },
  {
    type: 'opportunist',
    name: 'Opportunist',
    color: '#ffa500',
    description: 'Patient observer who waits for perfect moments'
  },
  {
    type: 'balanced',
    name: 'Balanced',
    color: '#228b22',
    description: 'Adaptive strategist who adjusts tactics'
  },
  {
    type: 'isolationist',
    name: 'Isolationist',
    color: '#708090',
    description: 'Self-focused, avoids conflict, builds strength'
  },
  {
    type: 'avenger',
    name: 'Avenger',
    color: '#8b0000',
    description: 'Holds grudges and seeks retribution'
  }
];

class AgentFactory {
  static createAgent(type, config = {}) {
    const AgentClass = AGENT_TYPES[type.toLowerCase()];
    if (!AgentClass) {
      throw new Error(`Unknown agent type: ${type}. Available: ${Object.keys(AGENT_TYPES).join(', ')}`);
    }
    
    return new AgentClass(config);
  }

  static createAllAgents(customConfigs = []) {
    const agents = [];
    
    for (let i = 0; i < 7; i++) {
      const preset = AGENT_PRESETS[i];
      const custom = customConfigs[i] || {};
      
      agents.push(this.createAgent(preset.type, {
        id: custom.id || `agent-${i + 1}`,
        name: custom.name || preset.name,
        color: custom.color || preset.color,
        ...custom
      }));
    }
    
    return agents;
  }

  static getAgentTypes() {
    return Object.keys(AGENT_TYPES);
  }

  static getAgentPresets() {
    return AGENT_PRESETS;
  }

  static getAgentInfo(type) {
    const preset = AGENT_PRESETS.find(p => p.type === type.toLowerCase());
    return preset || null;
  }
}

module.exports = {
  AgentFactory,
  AGENT_TYPES,
  AGENT_PRESETS,
  ConquerorAgent,
  DiplomatAgent,
  DeceiverAgent,
  OpportunistAgent,
  BalancedAgent,
  IsolationistAgent,
  AvengerAgent
};