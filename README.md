# Agent Diplomacy

A territory-control strategy game for AI agents - combining elements of Risk and Diplomacy with simultaneous move resolution and full public negotiation logs.

![Agent Diplomacy](https://img.shields.io/badge/AI-Agents-blue)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![WebSocket](https://img.shields.io/badge/WebSocket-Real--time-orange)

## Features

### Core Gameplay
- **7 AI Agents** with distinct personalities and strategies
- **Territory Control** on a Risk-inspired world map
- **Simultaneous Move Resolution** - no first-mover advantage
- **Public Negotiations** - all conversations visible to spectators
- **Reputation System** - tracks trustworthiness and deal history

### Agent Personalities
1. **Conqueror** - Aggressive expansionist focused on military dominance
2. **Diplomat** - Master negotiator building networks of alliances
3. **Deceiver** - Uses false promises and betrayal for advantage
4. **Opportunist** - Patient observer waiting for perfect moments
5. **Balanced** - Adaptive strategy based on game state
6. **Isolationist** - Focuses on own territory, minimal interaction
7. **Avenger** - Holds grudges and prioritizes revenge

### Technical Features
- **Event-Driven Architecture** for simultaneous moves
- **State Machine** for game phases (negotiation → commit → resolve)
- **WebSocket Real-Time Updates** for spectators
- **SQLite Persistence** for game history and replays
- **Cryptographic Move Signatures** to prevent tampering
- **Rate Limiting** and security headers

## Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd AgentDiplomacy

# Install dependencies
npm install

# Start the server
npm start
```

The server will start on `http://localhost:3000` with a WebSocket endpoint at `ws://localhost:3000`.

### API Quick Start

```bash
# Create a new game
curl -X POST http://localhost:3000/api/games

# Response: {"gameId": "game-123...", "status": "created", ...}

# Start the game
curl -X POST http://localhost:3000/api/games/{gameId}/start

# Watch via WebSocket
# Connect to: ws://localhost:3000?gameId={gameId}&type=spectator
```

## API Endpoints

### Games
- `POST /api/games` - Create a new game
- `GET /api/games` - List games
- `GET /api/games/:gameId` - Get game state
- `POST /api/games/:gameId/start` - Start game
- `POST /api/games/:gameId/pause` - Pause game
- `POST /api/games/:gameId/resume` - Resume game
- `POST /api/games/:gameId/stop` - Stop game

### Agents
- `GET /api/agents/types` - Get available agent types
- `GET /api/games/:gameId/agents/:agentId` - Get agent state

### Reputation
- `GET /api/games/:gameId/reputation` - Get reputations
- `GET /api/games/:gameId/reputation/summary` - Get summary

### Replays
- `GET /api/games/:gameId/replay` - Get full replay
- `GET /api/games/:gameId/snapshot/:turn` - Get turn snapshot

### Spectator
- `GET /api/games/:gameId/spectate` - Get full spectator state
- `GET /api/games/:gameId/conversations` - Get conversations

## WebSocket Protocol

Connect to `ws://localhost:3000?gameId=<gameId>&type=spectator`

### Incoming Messages
- `initial_state` - Full game state
- `phase_change` - Phase transition
- `turn_start` - New turn begins
- `conversation` - New message
- `battle_result` - Battle resolved
- `move_committed` - Agent committed move
- `game_end` - Game concluded

### Outgoing Messages
- `ping` - Keep connection alive
- `get_state` - Request state refresh

## Architecture

```
AgentDiplomacy/
├── src/
│   ├── agents/           # AI agent implementations
│   │   ├── BaseAgent.js
│   │   ├── ConquerorAgent.js
│   │   ├── DiplomatAgent.js
│   │   ├── DeceiverAgent.js
│   │   ├── OpportunistAgent.js
│   │   ├── BalancedAgent.js
│   │   ├── IsolationistAgent.js
│   │   ├── AvengerAgent.js
│   │   └── index.js
│   ├── engine/           # Game logic
│   │   ├── GameState.js
│   │   ├── PhaseManager.js
│   │   └── ReputationEngine.js
│   ├── api/              # Server & API
│   │   ├── server.js
│   │   ├── GameManager.js
│   │   └── WebSocketServer.js
│   ├── utils/            # Utilities
│   │   └── DatabaseManager.js
│   └── server.js         # Entry point
├── public/               # Web UI
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── map.js
│       └── client.js
└── db/                   # SQLite database
```

## Game Phases

1. **Negotiation** (60s) - Agents can send public messages and propose deals
2. **Commit** (30s) - Agents secretly submit their moves
3. **Resolve** (10s) - All moves revealed, battles resolved, reinforcements distributed

## Reputation System

The reputation engine tracks:
- **Trust Score** (0-100) - Based on deal history
- **Deals Made/Kept/Broken** - Quantified reliability
- **Betrayals** - Record of broken alliances
- **Aggression Score** - Combat vs diplomatic tendencies

Agents use this information to decide who to trust and who to target.

## Security

- Input validation on all agent actions
- Sandboxed agent execution (no external calls)
- Cryptographically signed moves (SHA-256)
- Rate limiting on API endpoints
- Audit log of all game events
- Helmet.js for security headers

## Development

```bash
# Run in development mode with auto-restart
npm run dev

# Run tests
npm test

# Initialize database
npm run init-db
```

## Customization

### Creating New Agent Types

Extend the `BaseAgent` class and implement your strategy:

```javascript
const BaseAgent = require('./BaseAgent');

class MyAgent extends BaseAgent {
  async negotiate() {
    // Your negotiation logic
  }
  
  decideMove() {
    // Your move logic
    return {
      type: 'attack',
      from: 'na1',
      to: 'na2',
      armies: 3
    };
  }
}
```

### Map Customization

Edit `GameState.js` to modify territory positions and connections.

## License

MIT

## Credits

Inspired by classic board games Risk and Diplomacy, with AI agents powered by strategic heuristics and personality-driven behavior.