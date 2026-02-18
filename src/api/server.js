// API Server - Express routes for Agent Diplomacy
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

class APIServer {
  constructor(gameManager, reputationEngine) {
    this.app = express();
    this.gameManager = gameManager;
    this.reputationEngine = reputationEngine;
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // Security headers
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'", "ws:", "wss:"]
        }
      }
    }));

    // CORS
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: { error: 'Too many requests, please try again later' }
    });
    this.app.use('/api/', limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Static files
    this.app.use(express.static('public'));
  }

  setupRoutes() {
    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // Game management routes
    this.setupGameRoutes();
    this.setupAgentRoutes();
    this.setupReputationRoutes();
    this.setupReplayRoutes();
    this.setupSpectatorRoutes();

    // Error handling
    this.app.use((err, req, res, next) => {
      console.error('API Error:', err);
      res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        code: err.code || 'INTERNAL_ERROR'
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  setupGameRoutes() {
    // Create new game
    this.app.post('/api/games', async (req, res, next) => {
      try {
        const { agentTypes, mapType, maxTurns } = req.body;
        
        const game = await this.gameManager.createGame({
          agentTypes: agentTypes || ['conqueror', 'diplomat', 'deceiver', 'opportunist', 'balanced', 'isolationist', 'avenger'],
          mapType: mapType || 'classic',
          maxTurns: maxTurns || 50
        });

        res.status(201).json({
          gameId: game.gameId,
          status: 'created',
          agents: Array.from(game.agents.values()).map(a => ({
            id: a.id,
            name: a.name,
            type: a.personality?.type,
            color: a.color
          })),
          map: mapType || 'classic'
        });
      } catch (err) {
        next(err);
      }
    });

    // Get all games
    this.app.get('/api/games', async (req, res, next) => {
      try {
        const { status, limit = 20 } = req.query;
        const games = await this.gameManager.listGames({ status, limit: parseInt(limit) });
        res.json({ games });
      } catch (err) {
        next(err);
      }
    });

    // Get game state
    this.app.get('/api/games/:gameId', async (req, res, next) => {
      try {
        const { gameId } = req.params;
        const game = this.gameManager.getGame(gameId);
        
        if (!game) {
          return res.status(404).json({ error: 'Game not found' });
        }

        res.json(game.getPublicState());
      } catch (err) {
        next(err);
      }
    });

    // Start game
    this.app.post('/api/games/:gameId/start', async (req, res, next) => {
      try {
        const { gameId } = req.params;
        await this.gameManager.startGame(gameId);
        res.json({ status: 'started', gameId });
      } catch (err) {
        next(err);
      }
    });

    // Pause game
    this.app.post('/api/games/:gameId/pause', async (req, res, next) => {
      try {
        const { gameId } = req.params;
        await this.gameManager.pauseGame(gameId);
        res.json({ status: 'paused', gameId });
      } catch (err) {
        next(err);
      }
    });

    // Resume game
    this.app.post('/api/games/:gameId/resume', async (req, res, next) => {
      try {
        const { gameId } = req.params;
        await this.gameManager.resumeGame(gameId);
        res.json({ status: 'resumed', gameId });
      } catch (err) {
        next(err);
      }
    });

    // Stop/End game
    this.app.post('/api/games/:gameId/stop', async (req, res, next) => {
      try {
        const { gameId } = req.params;
        await this.gameManager.stopGame(gameId);
        res.json({ status: 'stopped', gameId });
      } catch (err) {
        next(err);
      }
    });

    // Get game events
    this.app.get('/api/games/:gameId/events', async (req, res, next) => {
      try {
        const { gameId } = req.params;
        const { turn, type, limit } = req.query;
        
        const events = await this.gameManager.getGameEvents(gameId, {
          turn: turn ? parseInt(turn) : undefined,
          type,
          limit: limit ? parseInt(limit) : undefined
        });
        
        res.json({ events });
      } catch (err) {
        next(err);
      }
    });
  }

  setupAgentRoutes() {
    // Get agent types
    this.app.get('/api/agents/types', (req, res) => {
      const { AgentFactory } = require('../agents');
      res.json({ types: AgentFactory.getAgentPresets() });
    });

    // Get agent state (private view)
    this.app.get('/api/games/:gameId/agents/:agentId', async (req, res, next) => {
      try {
        const { gameId, agentId } = req.params;
        const game = this.gameManager.getGame(gameId);
        
        if (!game) {
          return res.status(404).json({ error: 'Game not found' });
        }

        const agentState = game.getAgentState(agentId);
        if (!agentState) {
          return res.status(404).json({ error: 'Agent not found' });
        }

        res.json(agentState);
      } catch (err) {
        next(err);
      }
    });

    // Submit move (for human players or external agents)
    this.app.post('/api/games/:gameId/agents/:agentId/move', async (req, res, next) => {
      try {
        const { gameId, agentId } = req.params;
        const { move } = req.body;

        // Validate move
        if (!move || !move.type) {
          return res.status(400).json({ error: 'Invalid move data' });
        }

        const result = await this.gameManager.submitMove(gameId, agentId, move);
        res.json({ success: true, result });
      } catch (err) {
        next(err);
      }
    });

    // Send message (for human players)
    this.app.post('/api/games/:gameId/agents/:agentId/message', async (req, res, next) => {
      try {
        const { gameId, agentId } = req.params;
        const { message, target, type = 'public' } = req.body;

        if (!message || message.length > 500) {
          return res.status(400).json({ error: 'Invalid message' });
        }

        const result = await this.gameManager.sendMessage(gameId, agentId, message, target, type);
        res.json({ success: true, messageId: result.id });
      } catch (err) {
        next(err);
      }
    });
  }

  setupReputationRoutes() {
    // Get reputations for a game
    this.app.get('/api/games/:gameId/reputation', async (req, res, next) => {
      try {
        const { gameId } = req.params;
        const reputations = await this.gameManager.getReputations(gameId);
        res.json({ reputations });
      } catch (err) {
        next(err);
      }
    });

    // Get reputation summary
    this.app.get('/api/games/:gameId/reputation/summary', async (req, res, next) => {
      try {
        const { gameId } = req.params;
        const summary = this.reputationEngine.getReputationSummary();
        res.json(summary);
      } catch (err) {
        next(err);
      }
    });

    // Get deals
    this.app.get('/api/games/:gameId/deals', async (req, res, next) => {
      try {
        const { gameId } = req.params;
        const { status } = req.query;
        const deals = await this.gameManager.getDeals(gameId, status);
        res.json({ deals });
      } catch (err) {
        next(err);
      }
    });
  }

  setupReplayRoutes() {
    // Get replay data
    this.app.get('/api/games/:gameId/replay', async (req, res, next) => {
      try {
        const { gameId } = req.params;
        const replay = await this.gameManager.getReplay(gameId);
        res.json(replay);
      } catch (err) {
        next(err);
      }
    });

    // Get snapshot at specific turn
    this.app.get('/api/games/:gameId/snapshot/:turn', async (req, res, next) => {
      try {
        const { gameId, turn } = req.params;
        const snapshot = await this.gameManager.getSnapshot(gameId, parseInt(turn));
        
        if (!snapshot) {
          return res.status(404).json({ error: 'Snapshot not found' });
        }

        res.json(snapshot);
      } catch (err) {
        next(err);
      }
    });
  }

  setupSpectatorRoutes() {
    // Get full game state for spectators
    this.app.get('/api/games/:gameId/spectate', async (req, res, next) => {
      try {
        const { gameId } = req.params;
        const game = this.gameManager.getGame(gameId);
        
        if (!game) {
          return res.status(404).json({ error: 'Game not found' });
        }

        const publicState = game.getPublicState();
        const conversations = game.conversations;
        const reputations = this.reputationEngine.getAllReputations();

        res.json({
          ...publicState,
          conversations,
          reputations,
          timeRemaining: this.gameManager.getTimeRemaining(gameId)
        });
      } catch (err) {
        next(err);
      }
    });

    // Get conversations
    this.app.get('/api/games/:gameId/conversations', async (req, res, next) => {
      try {
        const { gameId } = req.params;
        const { turn, type, since } = req.query;
        
        const conversations = await this.gameManager.getConversations(gameId, {
          turn: turn ? parseInt(turn) : undefined,
          type,
          since: since ? parseInt(since) : undefined
        });

        res.json({ conversations });
      } catch (err) {
        next(err);
      }
    });
  }

  listen(port = 3000) {
    this.server = this.app.listen(port, () => {
      console.log(`API Server listening on port ${port}`);
    });
    return this.server;
  }

  close() {
    if (this.server) {
      this.server.close();
    }
  }
}

module.exports = APIServer;