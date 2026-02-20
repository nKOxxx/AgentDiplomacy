// Client Application - Main controller for the web UI
const DiplomacyClient = {
  ws: null,
  gameId: null,
  gameState: null,
  reconnectAttempts: 0,
  maxReconnectAttempts: 5,
  reconnectDelay: 3000,
  phaseTimer: null,

  async init() {
    // Parse URL params
    const params = new URLSearchParams(window.location.search);
    this.gameId = params.get('gameId');

    // Initialize UI
    this.setupEventListeners();
    this.setupTabs();
    this.loadAgentTypes();

    // If no gameId, try to find an active game
    if (!this.gameId) {
      try {
        const response = await fetch('/api/games');
        const data = await response.json();
        if (data.games && data.games.length > 0) {
          const activeGame = data.games.find(g => g.status === 'active') || data.games[0];
          this.gameId = activeGame.id;
          // Update URL without reloading
          window.history.replaceState({}, '', `?gameId=${this.gameId}`);
        }
      } catch (e) {
        console.error('Failed to fetch games:', e);
      }
    }

    // Connect to game or show new game modal
    if (this.gameId) {
      this.connect();
      await this.loadGameState();
      // Start polling as backup
      this.startPolling();
    } else {
      this.showNewGameModal();
    }

    // Start phase timer
    this.startPhaseTimer();
  },

  connect() {
    const wsUrl = `ws://${window.location.host}?gameId=${this.gameId}&type=spectator`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.updateStatus('connected');
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };

    this.ws.onclose = () => {
      console.log('WebSocket closed');
      this.updateStatus('disconnected');
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.updateStatus('error');
    };
  },

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached');
      this.showError('Connection lost. Please refresh the page.');
    }
  },

  async loadGameState() {
    try {
      const response = await fetch(`/api/games/${this.gameId}`);
      if (response.ok) {
        this.gameState = await response.json();
        this.render();
      }
    } catch (e) {
      console.error('Failed to load game state:', e);
    }
  },

  handleMessage(message) {
    switch(message.type) {
      case 'connected':
        console.log('Connected to game:', message.data.gameId);
        break;

      case 'initial_state':
        this.gameState = message.data;
        this.render();
        break;

      case 'phase_change':
        this.handlePhaseChange(message.data);
        break;

      case 'turn_start':
        this.handleTurnStart(message.data);
        break;

      case 'conversation':
        this.addConversation(message.data);
        break;

      case 'battle_result':
        this.handleBattleResult(message.data);
        break;

      case 'move_committed':
        this.handleMoveCommitted(message.data);
        break;

      case 'game_end':
        this.handleGameEnd(message.data);
        break;

      case 'error':
        this.showError(message.data.message);
        break;

      case 'pong':
        // Heartbeat response
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  },

  handlePhaseChange(data) {
    if (this.gameState) {
      this.gameState.phase = data.phase;
      this.gameState.phaseStartTime = data.timestamp;
    }
    
    // Flash the screen on phase change
    document.body.classList.add('phase-transition');
    setTimeout(() => {
      document.body.classList.remove('phase-transition');
    }, 500);
    
    // If resolve phase, re-render to show battle results
    if (data.phase === 'resolve') {
      this.renderMap();
    }
    
    this.updatePhaseUI();
  },

  handleTurnStart(data) {
    if (this.gameState) {
      this.gameState.turn = data.turn;
    }
    this.updateTurnUI();
    this.addHistory(`Turn ${data.turn} started`);
  },

  handleBattleResult(data) {
    const territory = data.territory;
    const winner = this.gameState?.agents.find(a => a.id === data.winner);
    const defender = this.gameState?.agents.find(a => a.id === data.defender);
    const attacker = this.gameState?.agents.find(a => a.id === data.attacker);
    
    if (winner && defender) {
      const action = winner.id === data.attacker ? 'CONQUERED' : 'DEFENDED';
      const message = `${winner.name} ${action} ${territory} from ${defender.name}`;
      
      // Add to history
      this.addHistory(message);
      
      // Add to battle log with visual flair
      this.addBattleLog(message, winner.color, action === 'CONQUERED');
      
      // Visual feedback on map
      if (typeof MapRenderer !== 'undefined') {
        if (action === 'CONQUERED') {
          MapRenderer.showConquest(territory, data.winner);
        }
      }
      
      // Force re-render to update territory colors
      this.renderMap();
    }
  },

  addBattleLog(message, color, isConquest) {
    const logContent = document.getElementById('battleLogContent');
    if (!logContent) return;
    
    const entry = document.createElement('div');
    entry.style.cssText = `
      padding: 4px 0;
      border-bottom: 1px solid #333;
      color: ${isConquest ? '#ffd700' : '#fff'};
      font-weight: ${isConquest ? 'bold' : 'normal'};
      animation: ${isConquest ? 'fadeInGold 0.5s' : 'fadeIn 0.3s'};
    `;
    entry.textContent = `⚔️ ${message}`;
    
    logContent.insertBefore(entry, logContent.firstChild);
    
    // Keep only last 10 entries
    while (logContent.children.length > 10) {
      logContent.removeChild(logContent.lastChild);
    }
  },

  handleMoveCommitted(data) {
    const agent = this.gameState?.agents.find(a => a.id === data.agentId);
    if (agent) {
      this.addHistory(`${agent.name} committed their move`);
    }
  },

  handleGameEnd(data) {
    const winner = this.gameState?.agents.find(a => a.id === data.winner);
    
    // Show prominent game over message
    const battleLog = document.getElementById('battleLogContent');
    if (battleLog) {
      battleLog.innerHTML = `
        <div style="
          background: linear-gradient(135deg, #ffd700, #ffed4e);
          color: #000;
          padding: 15px;
          border-radius: 8px;
          text-align: center;
          font-weight: bold;
          animation: winnerCelebrate 2s infinite;
        ">
          <div style="font-size: 24px;">🏆</div>
          <div>GAME OVER!</div>
          <div style="color: ${winner?.color || '#333'}; font-size: 18px;">
            ${winner?.name || 'Unknown'} WINS!
          </div>
          <button onclick="location.reload()" style="
            margin-top: 10px;
            padding: 8px 20px;
            background: #333;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          ">🔄 PLAY AGAIN</button>
        </div>
      `;
    }
    
    // Also update game info
    const gameInfo = document.getElementById('gameInfo');
    if (gameInfo) {
      gameInfo.innerHTML = `
        <span style="color: gold; font-size: 20px;">🏆 ${winner?.name || 'Unknown'} WINS!</span>
      `;
    }
  },

  render() {
    console.log('Rendering game state:', this.gameState);
    if (!this.gameState) {
      console.warn('No game state to render');
      return;
    }
    this.updatePhaseUI();
    this.updateTurnUI();
    this.renderMap();
    this.renderAgents();
    this.renderConversations();
    this.renderReputation();
    console.log('Render complete');
  },

  updatePhaseUI() {
    const phaseEl = document.getElementById('gamePhase');
    const statusIndicator = document.getElementById('statusIndicator');
    
    if (this.gameState) {
      const phase = this.gameState.phase;
      phaseEl.textContent = phase;
      phaseEl.className = `phase-${phase}`;
      
      if (phase === 'ended') {
        statusIndicator.className = 'status-indicator ended';
      } else {
        statusIndicator.className = 'status-indicator';
      }
    }
  },

  updateTurnUI() {
    const turnEl = document.getElementById('gameTurn');
    if (this.gameState) {
      turnEl.textContent = `Turn: ${this.gameState.turn}/${this.gameState.maxTurns || 50}`;
    }
  },

  startPhaseTimer() {
    setInterval(() => {
      this.updateTimer();
    }, 100); // Update every 100ms for smooth countdown
  },

  updateTimer() {
    const timerEl = document.getElementById('phaseTimer');
    
    if (this.gameState?.phaseStartTime && this.gameState?.phaseDuration) {
      const elapsed = Date.now() - this.gameState.phaseStartTime;
      const remaining = Math.max(0, this.gameState.phaseDuration - elapsed);
      
      const seconds = Math.ceil(remaining / 1000);
      
      // Show clean whole seconds with phase label
      const phaseNames = {
        negotiation: '💬',
        commit: '✍️',
        resolve: '⚔️'
      };
      const phaseIcon = phaseNames[this.gameState?.phase] || '⏱️';
      
      timerEl.textContent = `${phaseIcon} ${seconds}s`;
      timerEl.style.letterSpacing = '0.05em';
      
      // Calmer visual feedback - only change color in final 2 seconds
      if (remaining < 2000) {
        timerEl.style.color = 'var(--danger)';
        timerEl.style.fontWeight = 'bold';
      } else if (remaining < 4000) {
        timerEl.style.color = 'var(--warning, #ffa500)';
        timerEl.style.fontWeight = 'normal';
      } else {
        timerEl.style.color = 'var(--accent-secondary)';
        timerEl.style.fontWeight = 'normal';
      }
    } else {
      timerEl.textContent = '--';
    }
  },

  renderMap() {
    console.log('renderMap called, MapRenderer exists:', typeof MapRenderer !== 'undefined');
    if (typeof MapRenderer !== 'undefined' && this.gameState) {
      try {
        MapRenderer.render(this.gameState);
        console.log('Map rendered successfully');
      } catch (err) {
        console.error('MapRenderer error:', err);
      }
    } else {
      console.warn('MapRenderer not loaded or no gameState');
    }
  },

  renderAgents() {
    const container = document.getElementById('agentsList');
    if (!container || !this.gameState?.agents) return;

    container.innerHTML = this.gameState.agents.map(agent => `
      <div class="agent-card">
        <div class="agent-avatar" style="background: ${agent.color}">
          ${agent.name.charAt(0)}
        </div>
        <div class="agent-info">
          <h4>${agent.name}</h4>
          <span class="agent-type">${agent.personality || 'Unknown'}</span>
          <div class="agent-stats">
            <div class="agent-stat">
              <span class="agent-stat-icon">🏴</span>
              <span>${agent.territories}</span>
            </div>
            <div class="agent-stat">
              <span class="agent-stat-icon">⚔️</span>
              <span>${agent.armies}</span>
            </div>
            <div class="agent-stat">
              <span class="agent-stat-icon">💰</span>
              <span>${agent.resources}</span>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  },

  renderConversations() {
    const container = document.getElementById('conversationsList');
    if (!container || !this.gameState?.conversations) return;

    const conversations = this.gameState.conversations.slice(-50); // Last 50 messages

    if (conversations.length === 0) {
      container.innerHTML = '<div class="empty-state">No conversations yet...</div>';
      return;
    }

    container.innerHTML = conversations.map(conv => {
      const agent = this.gameState.agents.find(a => a.id === conv.agentId);
      const isPrivate = conv.type === 'private';
      
      return `
        <div class="conversation-item ${isPrivate ? 'private' : ''}">
          <div class="conversation-header">
            <span class="conversation-agent" style="color: ${agent?.color || '#666'}">
              ${agent?.name || 'Unknown'}
            </span>
            <span class="conversation-turn">Turn ${conv.turn}</span>
            <span class="conversation-time">${this.formatTime(conv.timestamp)}</span>
          </div>
          <div class="conversation-message">${this.escapeHtml(conv.message)}</div>
        </div>
      `;
    }).join('');

    // Auto-scroll to bottom
    container.scrollTop = container.scrollHeight;
  },

  addConversation(data) {
    if (!this.gameState) return;
    
    this.gameState.conversations.push(data);
    this.renderConversations();
  },

  renderReputation() {
    const container = document.getElementById('reputationList');
    if (!container || !this.gameState?.reputations) return;

    if (this.gameState.reputations.length === 0) {
      container.innerHTML = '<div class="empty-state">Reputation data will appear here...</div>';
      return;
    }

    container.innerHTML = this.gameState.reputations.map(rep => {
      const trustColor = rep.trustScore > 70 ? '#4caf50' : rep.trustScore > 40 ? '#ff9800' : '#f44336';
      
      return `
        <div class="reputation-card">
          <div class="reputation-header">
            <div class="reputation-avatar" style="background: ${trustColor}20; color: ${trustColor}">
              ${rep.name?.charAt(0) || '?'}
            </div>
            <div class="reputation-info">
              <h4>${rep.name || 'Unknown'}</h4>
              <span>${rep.dealsMade || 0} deals made</span>
            </div>
            <div class="reputation-score">
              <div class="reputation-score-value" style="color: ${trustColor}">${rep.trustScore || 50}</div>
              <div class="reputation-score-label">Trust</div>
            </div>
          </div>
          <div class="reputation-stats">
            <div class="reputation-stat">
              <div class="reputation-stat-value" style="color: #4caf50">${rep.dealsKept || 0}</div>
              <div class="reputation-stat-label">Kept</div>
            </div>
            <div class="reputation-stat">
              <div class="reputation-stat-value" style="color: #f44336">${rep.dealsBroken || 0}</div>
              <div class="reputation-stat-label">Broken</div>
            </div>
            <div class="reputation-stat">
              <div class="reputation-stat-value" style="color: #ff9800">${rep.betrayals?.length || 0}</div>
              <div class="reputation-stat-label">Betrayals</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  addHistory(message) {
    const container = document.getElementById('historyList');
    if (!container) return;

    // Remove empty state if present
    if (container.querySelector('.empty-state')) {
      container.innerHTML = '';
    }

    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <span class="history-turn">T${this.gameState?.turn || '-'}</span>
      <span class="history-action">${message}</span>
      <span class="history-time">${this.formatTime(Date.now())}</span>
    `;

    container.appendChild(item);
    container.scrollTop = container.scrollHeight;
  },

  setupEventListeners() {
    // New game button
    document.getElementById('newGameBtn')?.addEventListener('click', () => {
      this.showNewGameModal();
    });

    // Cancel new game
    document.getElementById('cancelNewGame')?.addEventListener('click', () => {
      this.hideNewGameModal();
    });

    // New game form
    document.getElementById('newGameForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.createNewGame();
    });

    // Sound toggle
    document.getElementById('toggleSoundBtn')?.addEventListener('click', () => {
      this.toggleSound();
    });

    // Game over modal buttons
    document.getElementById('viewReplayBtn')?.addEventListener('click', () => {
      this.hideGameOverModal();
      // TODO: Implement replay view
    });

    document.getElementById('newGameAfterEnd')?.addEventListener('click', () => {
      this.hideGameOverModal();
      this.showNewGameModal();
    });

    // Territory click events from MapRenderer
    document.addEventListener('territoryClick', (e) => {
      this.handleTerritoryClick(e.detail.territoryId);
    });
  },

  handleTerritoryClick(territoryId) {
    // Find territory data
    const territory = this.gameState?.territories?.find(t => t.id === territoryId);
    if (!territory) return;

    // Find owner agent
    const owner = this.gameState?.agents?.find(a => a.id === territory.owner);
    
    // Show info (you could show a tooltip or panel here)
    console.log('Territory:', territory.name);
    console.log('Owner:', owner?.name || 'Neutral');
    console.log('Armies:', territory.armies);
    
    // Show simple alert for now (can be replaced with nicer UI)
    const info = `${territory.name}\nOwner: ${owner?.name || 'Neutral'}\nArmies: ${territory.armies}`;
    // Uncomment to show alert: alert(info);
  },

  setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;

        // Update buttons
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update panels
        tabPanels.forEach(p => p.classList.remove('active'));
        document.getElementById(`${tabId}Tab`)?.classList.add('active');
      });
    });
  },

  async loadAgentTypes() {
    try {
      const response = await fetch('/api/agents/types');
      const data = await response.json();
      
      const container = document.getElementById('agentSelection');
      if (container && data.types) {
        container.innerHTML = data.types.map((type, index) => `
          <label class="agent-option">
            <input type="checkbox" name="agentTypes" value="${type.type}" checked>
            <span class="agent-option-name">${index + 1}. ${type.name}</span>
          </label>
        `).join('');
      }
    } catch (err) {
      console.error('Failed to load agent types:', err);
      // Fallback: populate with default agents
      const container = document.getElementById('agentSelection');
      if (container) {
        const defaultAgents = [
          { type: 'conqueror', name: 'Conqueror' },
          { type: 'diplomat', name: 'Diplomat' },
          { type: 'deceiver', name: 'Deceiver' },
          { type: 'opportunist', name: 'Opportunist' },
          { type: 'balanced', name: 'Balanced' },
          { type: 'isolationist', name: 'Isolationist' },
          { type: 'avenger', name: 'Avenger' }
        ];
        container.innerHTML = defaultAgents.map((type, index) => `
          <label class="agent-option">
            <input type="checkbox" name="agentTypes" value="${type.type}" checked>
            <span class="agent-option-name">${index + 1}. ${type.name}</span>
          </label>
        `).join('');
      }
    }
  },

  async createNewGame() {
    const form = document.getElementById('newGameForm');
    const formData = new FormData(form);
    
    const agentTypes = formData.getAll('agentTypes');
    const mapType = formData.get('mapType');
    const maxTurns = parseInt(formData.get('maxTurns'));

    try {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentTypes, mapType, maxTurns })
      });

      const data = await response.json();

      if (response.ok) {
        this.gameId = data.gameId;
        this.hideNewGameModal();
        
        // Update URL
        window.history.pushState({}, '', `?gameId=${this.gameId}`);
        
        // Connect to new game
        this.connect();
        
        // Start the game
        await fetch(`/api/games/${this.gameId}/start`, { method: 'POST' });
      } else {
        this.showError(data.error || 'Failed to create game');
      }
    } catch (err) {
      console.error('Failed to create game:', err);
      this.showError('Failed to create game');
    }
  },

  showNewGameModal() {
    document.getElementById('newGameModal')?.classList.add('show');
  },

  hideNewGameModal() {
    document.getElementById('newGameModal')?.classList.remove('show');
  },

  showGameOverModal(winner, type) {
    const modal = document.getElementById('gameOverModal');
    const winnerNameEl = document.getElementById('winnerName');
    const winReasonEl = document.getElementById('winReason');

    if (winner) {
      winnerNameEl.textContent = winner.name;
      winnerNameEl.style.color = winner.color;
    } else {
      winnerNameEl.textContent = 'No Winner';
    }

    const winTypes = {
      elimination: 'Victory by Elimination',
      domination: 'Victory by Domination',
      turns: 'Victory by Score'
    };
    winReasonEl.textContent = winTypes[type] || 'Game Ended';

    modal?.classList.add('show');
  },

  hideGameOverModal() {
    document.getElementById('gameOverModal')?.classList.remove('show');
  },

  updateStatus(status) {
    const indicator = document.getElementById('statusIndicator');
    if (indicator) {
      indicator.className = `status-indicator ${status}`;
    }
  },

  showError(message) {
    // Simple alert for now - could be a toast notification
    console.error(message);
    // alert(message);
  },

  toggleSound() {
    // TODO: Implement sound toggle
    console.log('Sound toggle');
  },

  formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // Poll for updates as backup to WebSocket
  startPolling() {
    setInterval(async () => {
      if (!this.gameId) return;
      try {
        const response = await fetch(`/api/games/${this.gameId}`);
        if (response.ok) {
          const newState = await response.json();
          // Only re-render if state changed
          if (JSON.stringify(newState) !== JSON.stringify(this.gameState)) {
            this.gameState = newState;
            this.render();
          }
        }
      } catch (e) {
        // Silent fail - WebSocket is primary
      }
    }, 1000); // Poll every second
  }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Agent Diplomacy initializing...');
  try {
    await DiplomacyClient.init();
    console.log('Agent Diplomacy initialized successfully');
  } catch (err) {
    console.error('Failed to initialize:', err);
    document.body.innerHTML = '<div style="padding: 40px; color: white; text-align: center;"><h1>⚠️ Error Loading Game</h1><p>' + err.message + '</p><p>Please refresh the page.</p></div>';
  }
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DiplomacyClient;
}