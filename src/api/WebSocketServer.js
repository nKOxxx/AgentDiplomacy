// WebSocket Server - Real-time updates for spectators
const WebSocket = require('ws');
const url = require('url');

class WebSocketServer {
  constructor(server, gameManager) {
    this.wss = new WebSocket.Server({ server });
    this.gameManager = gameManager;
    this.clients = new Map(); // ws -> { gameId, type, agentId }
    
    this.setupHandlers();
    this.setupGameListeners();
  }

  setupHandlers() {
    this.wss.on('connection', (ws, req) => {
      const params = url.parse(req.url, true).query;
      const { gameId, type = 'spectator', agentId } = params;

      console.log(`WebSocket connection: ${type} for game ${gameId}`);

      // Store client info
      this.clients.set(ws, { gameId, type, agentId, subscribedAt: Date.now() });

      // Send initial state
      this.sendInitialState(ws, gameId);

      // Handle messages from client
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.handleClientMessage(ws, message);
        } catch (err) {
          console.error('Invalid WebSocket message:', err);
          this.sendError(ws, 'Invalid message format');
        }
      });

      // Handle close
      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(`WebSocket disconnected: ${type} for game ${gameId}`);
      });

      // Handle errors
      ws.on('error', (err) => {
        console.error('WebSocket error:', err);
        this.clients.delete(ws);
      });

      // Send welcome message
      this.send(ws, {
        type: 'connected',
        data: {
          gameId,
          clientType: type,
          timestamp: Date.now()
        }
      });
    });
  }

  setupGameListeners() {
    // Listen for game events
    this.gameManager.on('gameCreated', (data) => {
      this.broadcastToAll({
        type: 'game_created',
        data
      });
    });

    this.gameManager.on('phaseStarted', (data) => {
      this.broadcastToGame(data.gameId, {
        type: 'phase_change',
        data: {
          phase: data.phase,
          turn: data.turn,
          timestamp: Date.now()
        }
      });
    });

    this.gameManager.on('turnStarted', (data) => {
      this.broadcastToGame(data.gameId, {
        type: 'turn_start',
        data: {
          turn: data.turn,
          timestamp: Date.now()
        }
      });
    });

    this.gameManager.on('gameEnded', (data) => {
      this.broadcastToGame(data.gameId, {
        type: 'game_end',
        data: {
          winner: data.winner,
          type: data.type,
          turns: data.turns,
          timestamp: Date.now()
        }
      });
    });
  }

  handleClientMessage(ws, message) {
    const client = this.clients.get(ws);
    if (!client) return;

    switch(message.type) {
      case 'subscribe':
        // Change subscription
        if (message.gameId) {
          client.gameId = message.gameId;
          this.sendInitialState(ws, message.gameId);
        }
        break;

      case 'ping':
        this.send(ws, { type: 'pong', timestamp: Date.now() });
        break;

      case 'get_state':
        this.sendInitialState(ws, client.gameId);
        break;

      case 'send_message':
        // Handle player sending a message
        if (client.type === 'player' && client.agentId) {
          this.handlePlayerMessage(client.gameId, client.agentId, message.data);
        }
        break;

      case 'submit_move':
        // Handle player submitting a move
        if (client.type === 'player' && client.agentId) {
          this.handlePlayerMove(client.gameId, client.agentId, message.data);
        }
        break;

      default:
        this.sendError(ws, `Unknown message type: ${message.type}`);
    }
  }

  async sendInitialState(ws, gameId) {
    const game = this.gameManager.getGame(gameId);
    if (!game) {
      this.sendError(ws, 'Game not found');
      return;
    }

    const client = this.clients.get(ws);
    
    let state;
    if (client.type === 'player' && client.agentId) {
      // Send private state to player
      state = game.getAgentState(client.agentId);
    } else {
      // Send public state to spectators
      state = game.getPublicState();
    }

    this.send(ws, {
      type: 'initial_state',
      data: state
    });
  }

  async handlePlayerMessage(gameId, agentId, data) {
    try {
      const result = await this.gameManager.sendMessage(
        gameId, 
        agentId, 
        data.message, 
        data.target, 
        data.type || 'public'
      );
      
      // Broadcast the message to all clients
      this.broadcastToGame(gameId, {
        type: 'conversation',
        data: {
          id: result.id,
          agentId,
          message: data.message,
          type: data.type || 'public',
          timestamp: result.timestamp
        }
      });
    } catch (err) {
      console.error('Failed to handle player message:', err);
    }
  }

  async handlePlayerMove(gameId, agentId, move) {
    try {
      const result = await this.gameManager.submitMove(gameId, agentId, move);
      
      // Notify the player
      const playerWs = this.findPlayerSocket(gameId, agentId);
      if (playerWs) {
        this.send(playerWs, {
          type: 'move_accepted',
          data: {
            hash: result.hash,
            timestamp: result.timestamp
          }
        });
      }
      
      // Broadcast that a move was committed (without revealing details)
      this.broadcastToGame(gameId, {
        type: 'move_committed',
        data: {
          agentId,
          hash: result.hash,
          timestamp: result.timestamp
        }
      }, { excludeAgent: agentId }); // Don't send to the player who made the move
    } catch (err) {
      console.error('Failed to handle player move:', err);
      
      // Notify the player of error
      const playerWs = this.findPlayerSocket(gameId, agentId);
      if (playerWs) {
        this.sendError(playerWs, err.message);
      }
    }
  }

  findPlayerSocket(gameId, agentId) {
    for (const [ws, client] of this.clients) {
      if (client.gameId === gameId && 
          client.type === 'player' && 
          client.agentId === agentId) {
        return ws;
      }
    }
    return null;
  }

  broadcastToGame(gameId, message, options = {}) {
    for (const [ws, client] of this.clients) {
      if (client.gameId === gameId) {
        // Skip if we need to exclude a specific agent
        if (options.excludeAgent && client.agentId === options.excludeAgent) {
          continue;
        }
        
        if (ws.readyState === WebSocket.OPEN) {
          this.send(ws, message);
        }
      }
    }
  }

  broadcastToAll(message) {
    for (const [ws, client] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        this.send(ws, message);
      }
    }
  }

  send(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendError(ws, error) {
    this.send(ws, {
      type: 'error',
      data: { message: error }
    });
  }

  // Called by external systems to broadcast updates
  broadcastGameUpdate(gameId, updateType, data) {
    this.broadcastToGame(gameId, {
      type: updateType,
      data,
      timestamp: Date.now()
    });
  }

  broadcastReputationUpdate(gameId, reputationData) {
    this.broadcastToGame(gameId, {
      type: 'reputation_update',
      data: reputationData,
      timestamp: Date.now()
    });
  }

  broadcastBattleResult(gameId, battleResult) {
    this.broadcastToGame(gameId, {
      type: 'battle_result',
      data: battleResult,
      timestamp: Date.now()
    });
  }

  getStats() {
    const stats = {
      totalConnections: this.clients.size,
      games: {},
      types: {
        spectator: 0,
        player: 0
      }
    };

    for (const [ws, client] of this.clients) {
      // Count by game
      if (!stats.games[client.gameId]) {
        stats.games[client.gameId] = { spectators: 0, players: 0 };
      }
      
      if (client.type === 'player') {
        stats.games[client.gameId].players++;
        stats.types.player++;
      } else {
        stats.games[client.gameId].spectators++;
        stats.types.spectator++;
      }
    }

    return stats;
  }

  close() {
    this.wss.close();
  }
}

module.exports = WebSocketServer;