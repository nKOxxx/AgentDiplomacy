// Database Manager - SQLite persistence layer
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class DatabaseManager {
  constructor(dbPath = './db/games.db') {
    this.dbPath = dbPath;
    this.db = null;
  }

  async initialize() {
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Database connection failed:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    const tables = [
      // Games table
      `CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'active',
        turn INTEGER DEFAULT 1,
        phase TEXT DEFAULT 'lobby',
        winner TEXT,
        game_data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        ended_at INTEGER
      )`,

      // Game events table (audit log)
      `CREATE TABLE IF NOT EXISTS game_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        turn INTEGER NOT NULL,
        phase TEXT NOT NULL,
        event_type TEXT NOT NULL,
        agent_id TEXT,
        data TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (game_id) REFERENCES games(id)
      )`,

      // Conversations table
      `CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        turn INTEGER NOT NULL,
        phase TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT DEFAULT 'public',
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (game_id) REFERENCES games(id)
      )`,

      // Moves table
      `CREATE TABLE IF NOT EXISTS moves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        turn INTEGER NOT NULL,
        agent_id TEXT NOT NULL,
        move_type TEXT NOT NULL,
        move_data TEXT NOT NULL,
        signature TEXT NOT NULL,
        hash TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (game_id) REFERENCES games(id)
      )`,

      // Reputation table
      `CREATE TABLE IF NOT EXISTS reputations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        target_agent_id TEXT,
        trust_score INTEGER,
        deals_made INTEGER DEFAULT 0,
        deals_kept INTEGER DEFAULT 0,
        deals_broken INTEGER DEFAULT 0,
        betrayal_count INTEGER DEFAULT 0,
        reputation_data TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (game_id) REFERENCES games(id)
      )`,

      // Deals table
      `CREATE TABLE IF NOT EXISTS deals (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        turn INTEGER NOT NULL,
        proposer TEXT NOT NULL,
        acceptor TEXT NOT NULL,
        deal_type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        terms TEXT,
        fulfilled_by TEXT,
        broken_by TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        FOREIGN KEY (game_id) REFERENCES games(id)
      )`,

      // Battle results table
      `CREATE TABLE IF NOT EXISTS battles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        turn INTEGER NOT NULL,
        territory_id TEXT NOT NULL,
        defender TEXT NOT NULL,
        attackers TEXT NOT NULL,
        winner TEXT NOT NULL,
        remaining_armies INTEGER,
        result_data TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (game_id) REFERENCES games(id)
      )`,

      // Replay snapshots
      `CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        turn INTEGER NOT NULL,
        phase TEXT NOT NULL,
        snapshot_data TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (game_id) REFERENCES games(id)
      )`
    ];

    for (const sql of tables) {
      await this.run(sql);
    }

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_events_game ON game_events(game_id)',
      'CREATE INDEX IF NOT EXISTS idx_conversations_game ON conversations(game_id)',
      'CREATE INDEX IF NOT EXISTS idx_moves_game ON moves(game_id)',
      'CREATE INDEX IF NOT EXISTS idx_reputations_game ON reputations(game_id)',
      'CREATE INDEX IF NOT EXISTS idx_deals_game ON deals(game_id)',
      'CREATE INDEX IF NOT EXISTS idx_battles_game ON battles(game_id)',
      'CREATE INDEX IF NOT EXISTS idx_snapshots_game ON snapshots(game_id)'
    ];

    for (const sql of indexes) {
      await this.run(sql);
    }

    console.log('Database tables created');
  }

  // Promisified database methods
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Game operations
  async saveGame(gameId, gameData) {
    const sql = `
      INSERT INTO games (id, status, turn, phase, winner, game_data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        turn = excluded.turn,
        phase = excluded.phase,
        winner = excluded.winner,
        game_data = excluded.game_data,
        updated_at = excluded.updated_at
    `;
    
    const now = Date.now();
    await this.run(sql, [
      gameId,
      gameData.status || 'active',
      gameData.turn || 1,
      gameData.phase || 'lobby',
      gameData.winner || null,
      JSON.stringify(gameData),
      gameData.createdAt || now,
      now
    ]);
  }

  async loadGame(gameId) {
    const sql = 'SELECT * FROM games WHERE id = ?';
    const row = await this.get(sql, [gameId]);
    
    if (!row) return null;
    
    return {
      ...row,
      game_data: JSON.parse(row.game_data)
    };
  }

  async getActiveGames() {
    const sql = "SELECT id, status, turn, phase, created_at FROM games WHERE status = 'active' ORDER BY updated_at DESC";
    return this.all(sql);
  }

  async getCompletedGames(limit = 10) {
    const sql = "SELECT id, status, turn, winner, created_at, ended_at FROM games WHERE status = 'ended' ORDER BY ended_at DESC LIMIT ?";
    return this.all(sql, [limit]);
  }

  async endGame(gameId, winner) {
    const sql = `
      UPDATE games 
      SET status = 'ended', winner = ?, ended_at = ?, updated_at = ?
      WHERE id = ?
    `;
    const now = Date.now();
    await this.run(sql, [winner, now, now, gameId]);
  }

  // Event logging
  async logEvent(gameId, event) {
    const sql = `
      INSERT INTO game_events (game_id, turn, phase, event_type, agent_id, data, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.run(sql, [
      gameId,
      event.turn,
      event.phase,
      event.type,
      event.agentId || null,
      JSON.stringify(event.data),
      event.timestamp || Date.now()
    ]);
  }

  async getGameEvents(gameId, options = {}) {
    let sql = 'SELECT * FROM game_events WHERE game_id = ?';
    const params = [gameId];

    if (options.turn) {
      sql += ' AND turn = ?';
      params.push(options.turn);
    }

    if (options.type) {
      sql += ' AND event_type = ?';
      params.push(options.type);
    }

    sql += ' ORDER BY timestamp ASC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = await this.all(sql, params);
    return rows.map(row => ({
      ...row,
      data: JSON.parse(row.data)
    }));
  }

  // Conversation logging
  async logConversation(conversation) {
    const sql = `
      INSERT INTO conversations (id, game_id, turn, phase, agent_id, message, type, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.run(sql, [
      conversation.id,
      conversation.gameId,
      conversation.turn,
      conversation.phase,
      conversation.agentId,
      conversation.message,
      conversation.type,
      conversation.timestamp
    ]);
  }

  async getConversations(gameId, options = {}) {
    let sql = 'SELECT * FROM conversations WHERE game_id = ?';
    const params = [gameId];

    if (options.type) {
      sql += ' AND type = ?';
      params.push(options.type);
    }

    if (options.turn) {
      sql += ' AND turn = ?';
      params.push(options.turn);
    }

    sql += ' ORDER BY timestamp ASC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    return this.all(sql, params);
  }

  // Move logging
  async logMove(gameId, move) {
    const sql = `
      INSERT INTO moves (game_id, turn, agent_id, move_type, move_data, signature, hash, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.run(sql, [
      gameId,
      move.turn,
      move.agentId,
      move.move.type,
      JSON.stringify(move.move),
      move.signature,
      move.hash,
      move.timestamp
    ]);
  }

  async getMoves(gameId, turn) {
    const sql = 'SELECT * FROM moves WHERE game_id = ? AND turn = ? ORDER BY timestamp ASC';
    const rows = await this.all(sql, [gameId, turn]);
    
    return rows.map(row => ({
      ...row,
      move_data: JSON.parse(row.move_data)
    }));
  }

  // Snapshot for replay
  async saveSnapshot(gameId, turn, phase, snapshotData) {
    const sql = `
      INSERT INTO snapshots (game_id, turn, phase, snapshot_data, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    await this.run(sql, [
      gameId,
      turn,
      phase,
      JSON.stringify(snapshotData),
      Date.now()
    ]);
  }

  async getSnapshots(gameId) {
    const sql = 'SELECT * FROM snapshots WHERE game_id = ? ORDER BY turn ASC';
    const rows = await this.all(sql, [gameId]);
    
    return rows.map(row => ({
      ...row,
      snapshot_data: JSON.parse(row.snapshot_data)
    }));
  }

  // Reputation tracking
  async saveReputation(gameId, reputation) {
    const sql = `
      INSERT INTO reputations (game_id, agent_id, trust_score, deals_made, deals_kept, deals_broken, betrayal_count, reputation_data, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT DO UPDATE SET
        trust_score = excluded.trust_score,
        deals_made = excluded.deals_made,
        deals_kept = excluded.deals_kept,
        deals_broken = excluded.deals_broken,
        betrayal_count = excluded.betrayal_count,
        reputation_data = excluded.reputation_data,
        timestamp = excluded.timestamp
    `;
    
    await this.run(sql, [
      gameId,
      reputation.agentId,
      reputation.trustScore,
      reputation.dealsMade,
      reputation.dealsKept,
      reputation.dealsBroken,
      reputation.betrayals?.length || 0,
      JSON.stringify(reputation),
      Date.now()
    ]);
  }

  async getReputations(gameId) {
    const sql = 'SELECT * FROM reputations WHERE game_id = ?';
    const rows = await this.all(sql, [gameId]);
    
    return rows.map(row => ({
      ...row,
      reputation_data: JSON.parse(row.reputation_data)
    }));
  }

  // Deal tracking
  async saveDeal(gameId, deal) {
    const sql = `
      INSERT INTO deals (id, game_id, turn, proposer, acceptor, deal_type, status, terms, fulfilled_by, broken_by, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        fulfilled_by = excluded.fulfilled_by,
        broken_by = excluded.broken_by,
        completed_at = excluded.completed_at
    `;
    
    await this.run(sql, [
      deal.id,
      gameId,
      deal.turn,
      deal.proposer,
      deal.acceptor,
      deal.type,
      deal.status,
      JSON.stringify(deal.terms),
      deal.fulfilled ? JSON.stringify(Object.keys(deal.fulfilled).filter(k => deal.fulfilled[k])) : null,
      deal.brokenBy,
      deal.createdAt,
      deal.completedAt || null
    ]);
  }

  async getDeals(gameId) {
    return this.all('SELECT * FROM deals WHERE game_id = ? ORDER BY created_at ASC', [gameId]);
  }

  // Battle logging
  async logBattle(gameId, battle) {
    const sql = `
      INSERT INTO battles (game_id, turn, territory_id, defender, attackers, winner, remaining_armies, result_data, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.run(sql, [
      gameId,
      battle.turn,
      battle.territory,
      battle.defender,
      JSON.stringify(battle.attackers),
      battle.winner,
      battle.remainingArmies,
      JSON.stringify(battle),
      Date.now()
    ]);
  }

  async getBattles(gameId) {
    const sql = 'SELECT * FROM battles WHERE game_id = ? ORDER BY turn ASC';
    const rows = await this.all(sql, [gameId]);
    
    return rows.map(row => ({
      ...row,
      result_data: JSON.parse(row.result_data),
      attackers: JSON.parse(row.attackers)
    }));
  }

  // Statistics
  async getGameStats() {
    const stats = {};
    
    stats.totalGames = (await this.get('SELECT COUNT(*) as count FROM games')).count;
    stats.activeGames = (await this.get("SELECT COUNT(*) as count FROM games WHERE status = 'active'")).count;
    stats.completedGames = (await this.get("SELECT COUNT(*) as count FROM games WHERE status = 'ended'")).count;
    
    const avgTurns = await this.get('SELECT AVG(turn) as avg FROM games WHERE status = "ended"');
    stats.averageTurns = avgTurns.avg || 0;
    
    return stats;
  }

  async close() {
    if (this.db) {
      return new Promise((resolve, reject) => {
        this.db.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }
}

module.exports = DatabaseManager;