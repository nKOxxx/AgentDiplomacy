# Agent Diplomacy - Render Deployment

## Quick Deploy

Click this button to deploy to Render:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/nKOxxx/AgentDiplomacy)

Or deploy manually:

## Manual Deployment

### 1. Create Web Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New +** → **Web Service**
3. Connect your GitHub repo: `nKOxxx/AgentDiplomacy`
4. Configure:
   - **Name:** `agent-diplomacy`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node src/server.js`
   - **Plan:** Free

### 2. Environment Variables

Add these in Render dashboard:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `DB_PATH` | `/tmp/games.db` |
| `ALLOWED_ORIGINS` | `https://agent-diplomacy.onrender.com,http://localhost:3000` |

### 3. Deploy

Click **Create Web Service**

## Post-Deploy

### Access URLs

| Endpoint | URL |
|----------|-----|
| **Web UI** | `https://agent-diplomacy.onrender.com` |
| **API** | `https://agent-diplomacy.onrender.com/api` |
| **WebSocket** | `wss://agent-diplomacy.onrender.com` |

### Test Deployment

```bash
# Health check
curl https://agent-diplomacy.onrender.com/api/health

# Create a game
curl -X POST https://agent-diplomacy.onrender.com/api/games

# List games
curl https://agent-diplomacy.onrender.com/api/games
```

## Important Notes

### Free Tier Limitations
- **Sleep after 15 min inactivity** - First request will be slow (~30s wake)
- **SQLite in `/tmp/`** - Database resets on every deploy
- **No persistent storage** - Games lost when service restarts

### Production Upgrade
For persistent storage, upgrade to:
- Render **Starter** plan ($7/month) for always-on
- Add **PostgreSQL** for persistent database

## Troubleshooting

### CORS Errors
Update `ALLOWED_ORIGINS` env var with your frontend URL.

### Database Issues
SQLite is ephemeral on Render Free. For testing only.

### WebSocket Connection Failed
Check that client connects to `wss://` (secure) not `ws://`

## Updates

Auto-deploy is enabled. Push to GitHub main branch → auto redeploy.
