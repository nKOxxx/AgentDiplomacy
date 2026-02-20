// Map Renderer - Handles SVG map generation
const MapRenderer = {
  territories: new Map(),
  
  // Territory positions (simplified world map layout)
  territoryPositions: {
    // North America
    'na1': { x: 80, y: 80, label: 'Alaska' },
    'na2': { x: 180, y: 120, label: 'Alberta' },
    'na3': { x: 220, y: 280, label: 'C. America' },
    'na4': { x: 320, y: 220, label: 'E. US' },
    'na5': { x: 420, y: 60, label: 'Greenland' },
    'na6': { x: 150, y: 80, label: 'NW Terr' },
    'na7': { x: 260, y: 140, label: 'Ontario' },
    'na8': { x: 360, y: 140, label: 'Quebec' },
    'na9': { x: 200, y: 200, label: 'W. US' },
    
    // South America
    'sa1': { x: 300, y: 360, label: 'Venezuela' },
    'sa2': { x: 280, y: 440, label: 'Peru' },
    'sa3': { x: 360, y: 440, label: 'Brazil' },
    'sa4': { x: 320, y: 540, label: 'Argentina' },
    
    // Europe
    'eu1': { x: 480, y: 100, label: 'Iceland' },
    'eu2': { x: 540, y: 80, label: 'Scandinavia' },
    'eu3': { x: 460, y: 160, label: 'Britain' },
    'eu4': { x: 540, y: 160, label: 'N. Europe' },
    'eu5': { x: 620, y: 140, label: 'Ukraine' },
    'eu6': { x: 480, y: 220, label: 'W. Europe' },
    'eu7': { x: 560, y: 240, label: 'S. Europe' },
    'eu8': { x: 640, y: 280, label: 'Middle East' },
    
    // Africa
    'af1': { x: 560, y: 320, label: 'Egypt' },
    'af2': { x: 480, y: 360, label: 'N. Africa' },
    'af3': { x: 600, y: 400, label: 'E. Africa' },
    'af4': { x: 540, y: 460, label: 'Congo' },
    'af5': { x: 660, y: 500, label: 'Madagascar' },
    'af6': { x: 580, y: 560, label: 'S. Africa' },
    
    // Asia
    'as1': { x: 780, y: 80, label: 'Siberia' },
    'as2': { x: 880, y: 60, label: 'Yakutsk' },
    'as3': { x: 980, y: 80, label: 'Kamchatka' },
    'as4': { x: 720, y: 160, label: 'Ural' },
    'as5': { x: 820, y: 140, label: 'Irkutsk' },
    'as6': { x: 880, y: 200, label: 'Mongolia' },
    'as7': { x: 1020, y: 240, label: 'Japan' },
    'as8': { x: 700, y: 240, label: 'Afghanistan' },
    'as9': { x: 820, y: 260, label: 'China' },
    'as10': { x: 740, y: 320, label: 'India' },
    'as11': { x: 880, y: 360, label: 'SE Asia' },
    
    // Australia
    'au1': { x: 920, y: 480, label: 'Indonesia' },
    'au2': { x: 1020, y: 440, label: 'New Guinea' },
    'au3': { x: 1060, y: 520, label: 'E. Australia' },
    'au4': { x: 960, y: 560, label: 'W. Australia' }
  },

  // Territory colors by continent
  continentColors: {
    na: '#3a4a5c',
    sa: '#4a5c3a',
    eu: '#5c4a3a',
    af: '#5c5c3a',
    as: '#3a5c5c',
    au: '#5c3a5c'
  },

  agentColors: {
    'agent-1': '#dc143c',
    'agent-2': '#4169e1',
    'agent-3': '#800080',
    'agent-4': '#ffa500',
    'agent-5': '#228b22',
    'agent-6': '#708090',
    'agent-7': '#8b0000'
  },

  onTerritoryClick(territoryId) {
    // Dispatch custom event that client.js can listen for
    const event = new CustomEvent('territoryClick', { detail: { territoryId } });
    document.dispatchEvent(event);
    
    // Highlight the territory
    this.highlightTerritory(territoryId, '#ffff00');
    
    console.log('Territory clicked:', territoryId);
  },

  render(gameState) {
    // Clear any previous winner markings
    this.clearWinner();
    
    this.renderConnections(gameState);
    this.renderTerritories(gameState);
    this.renderArmies(gameState);
  },

  renderConnections(gameState) {
    const connectionsGroup = document.getElementById('connections');
    if (!connectionsGroup) return;
    connectionsGroup.innerHTML = '';

    const drawn = new Set();

    gameState.territories.forEach(territory => {
      const from = this.territoryPositions[territory.id];
      if (!from) return;

      // Skip if no neighbors defined
      if (!territory.neighbors || !Array.isArray(territory.neighbors)) return;

      territory.neighbors.forEach(neighborId => {
        const key = [territory.id, neighborId].sort().join('-');
        if (drawn.has(key)) return;
        drawn.add(key);

        const to = this.territoryPositions[neighborId];
        if (!to) return;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', from.x);
        line.setAttribute('y1', from.y);
        line.setAttribute('x2', to.x);
        line.setAttribute('y2', to.y);
        line.setAttribute('class', 'connection-line');
        connectionsGroup.appendChild(line);
      });
    });
  },

  renderTerritories(gameState) {
    const territoriesGroup = document.getElementById('territories');
    if (!territoriesGroup) return;
    territoriesGroup.innerHTML = '';

    gameState.territories.forEach(territory => {
      const pos = this.territoryPositions[territory.id];
      if (!pos) return;

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', `territory ${territory.owner ? '' : 'neutral'}`);
      g.setAttribute('data-territory', territory.id);

      // Territory circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', pos.x);
      circle.setAttribute('cy', pos.y);
      circle.setAttribute('r', 28);
      circle.setAttribute('class', 'territory-path');
      
      // Set color based on owner
      if (territory.owner) {
        const color = this.agentColors[territory.owner] || '#666';
        circle.setAttribute('fill', color);
      } else {
        const continent = territory.id.substring(0, 2);
        circle.setAttribute('fill', this.continentColors[continent] || '#444');
      }

      // Territory label
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', pos.x);
      label.setAttribute('y', pos.y + 40);
      label.setAttribute('class', 'territory-label');
      label.textContent = pos.label;

      g.appendChild(circle);
      g.appendChild(label);
      
      // Add click handler
      g.addEventListener('click', () => {
        this.onTerritoryClick(territory.id);
      });
      g.style.cursor = 'pointer';
      
      territoriesGroup.appendChild(g);

      // Store reference
      this.territories.set(territory.id, { element: g, circle, label, data: territory });
    });
  },

  renderArmies(gameState) {
    const armiesGroup = document.getElementById('armies');
    if (!armiesGroup) return;
    armiesGroup.innerHTML = '';

    gameState.territories.forEach(territory => {
      if (territory.armies <= 0) return;

      const pos = this.territoryPositions[territory.id];
      if (!pos) return;

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'army-marker');

      // Army circle background
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', pos.x);
      circle.setAttribute('cy', pos.y);
      circle.setAttribute('r', 14);
      circle.setAttribute('class', 'army-circle');

      // Army count
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', pos.x);
      text.setAttribute('y', pos.y);
      text.setAttribute('class', 'army-text');
      text.textContent = territory.armies;

      g.appendChild(circle);
      g.appendChild(text);
      armiesGroup.appendChild(g);
    });
  },

  updateTerritory(territoryId, owner, armies) {
    const territory = this.territories.get(territoryId);
    if (!territory) return;

    // Update color
    if (owner) {
      const color = this.agentColors[owner] || '#666';
      territory.circle.setAttribute('fill', color);
      territory.element.classList.remove('neutral');
    }

    // Trigger re-render of armies
    // This would be called by the main client after state update
  },

  highlightTerritory(territoryId, color = '#ffff00') {
    const territory = this.territories.get(territoryId);
    if (territory) {
      territory.circle.style.filter = `drop-shadow(0 0 10px ${color})`;
      setTimeout(() => {
        territory.circle.style.filter = '';
      }, 2000);
    }
  },

  // Show battle animation between two territories
  showBattle(fromId, toId, winner) {
    const fromPos = this.territoryPositions[fromId];
    const toPos = this.territoryPositions[toId];
    if (!fromPos || !toPos) return;

    const svg = document.getElementById('gameMap');
    
    // Create attack arrow
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    arrow.setAttribute('x1', fromPos.x);
    arrow.setAttribute('y1', fromPos.y);
    arrow.setAttribute('x2', toPos.x);
    arrow.setAttribute('y2', toPos.y);
    arrow.setAttribute('class', 'attack-arrow');
    
    // Add to a temporary group
    const battleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    battleGroup.setAttribute('id', 'battle-effect');
    battleGroup.appendChild(arrow);
    svg.appendChild(battleGroup);
    
    // Flash the target territory
    const targetTerritory = this.territories.get(toId);
    if (targetTerritory) {
      targetTerritory.element.classList.add('battle-effect');
    }
    
    // Remove after animation
    setTimeout(() => {
      battleGroup.remove();
      if (targetTerritory) {
        targetTerritory.element.classList.remove('battle-effect');
      }
    }, 2000);
  },

  // Clear alliance lines
  clearAlliances() {
    const svg = document.getElementById('gameMap');
    const existing = svg.querySelectorAll('.alliance-line, .betrayal-line');
    existing.forEach(el => el.remove());
  },

  // Clear winner markings
  clearWinner() {
    const svg = document.getElementById('gameMap');
    if (!svg) return;
    
    // Remove crown
    const crown = svg.querySelector('.winner-crown');
    if (crown) crown.remove();
    
    // Remove gold styling from all territories
    this.territories.forEach(territory => {
      if (territory && territory.circle) {
        territory.circle.style.filter = '';
        territory.circle.setAttribute('stroke', 'none');
        territory.circle.setAttribute('stroke-width', '0');
      }
    });
  },

  // Render alliance lines between agents
  renderAlliances(gameState) {
    this.clearAlliances();
    
    if (!gameState.diplomaticEvents || gameState.diplomaticEvents.length === 0) return;
    
    const svg = document.getElementById('gameMap');
    const recentEvents = gameState.diplomaticEvents.slice(-5); // Show last 5
    
    recentEvents.forEach(event => {
      // Find territories owned by these agents
      const fromTerritories = gameState.territories.filter(t => t.owner === event.from);
      const toTerritories = gameState.territories.filter(t => t.owner === event.to);
      
      if (fromTerritories.length === 0 || toTerritories.length === 0) return;
      
      // Use their first territory as anchor point
      const fromPos = this.territoryPositions[fromTerritories[0].id];
      const toPos = this.territoryPositions[toTerritories[0].id];
      
      if (!fromPos || !toPos) return;
      
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', fromPos.x);
      line.setAttribute('y1', fromPos.y);
      line.setAttribute('x2', toPos.x);
      line.setAttribute('y2', toPos.y);
      
      if (event.type === 'alliance') {
        line.setAttribute('class', 'alliance-line');
        line.setAttribute('stroke', '#4caf50');
        line.setAttribute('stroke-width', '3');
        line.setAttribute('stroke-dasharray', '5,5');
      } else if (event.type === 'betrayal') {
        line.setAttribute('class', 'betrayal-line');
        line.setAttribute('stroke', '#f44336');
        line.setAttribute('stroke-width', '4');
        line.setAttribute('stroke-dasharray', '10,3');
      }
      
      svg.appendChild(line);
      
      // Remove after 8 seconds
      setTimeout(() => line.remove(), 8000);
    });
  },

  // Mark winner with crown and glow
  markWinner(gameState) {
    if (!gameState.winner) return;
    
    // Find winner's territories
    const winnerTerritories = gameState.territories.filter(t => t.owner === gameState.winner);
    
    winnerTerritories.forEach(t => {
      const territory = this.territories.get(t.id);
      if (territory && territory.circle) {
        territory.circle.style.filter = 'drop-shadow(0 0 15px gold)';
        territory.circle.setAttribute('stroke', '#ffd700');
        territory.circle.setAttribute('stroke-width', '4');
      }
    });
    
    // Add crown to winner's first territory
    if (winnerTerritories.length > 0) {
      const firstTerritory = this.territories.get(winnerTerritories[0].id);
      if (firstTerritory) {
        const pos = this.territoryPositions[winnerTerritories[0].id];
        const svg = document.getElementById('gameMap');
        
        const crown = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        crown.setAttribute('x', pos.x - 10);
        crown.setAttribute('y', pos.y - 35);
        crown.setAttribute('font-size', '24');
        crown.setAttribute('class', 'winner-crown');
        crown.textContent = '👑';
        
        svg.appendChild(crown);
      }
    }
  },

  // Show territory conquest (change of ownership)
  showConquest(territoryId, newOwner) {
    const territory = this.territories.get(territoryId);
    if (!territory) return;
    
    // Update color immediately
    const color = this.agentColors[newOwner] || '#666';
    territory.circle.setAttribute('fill', color);
    
    // Add conquest animation
    territory.element.classList.add('conquered');
    territory.element.classList.remove('neutral');
    
    // Remove animation class after it plays
    setTimeout(() => {
      territory.element.classList.remove('conquered');
    }, 1500);
  },

  // Show all battles from a resolution
  showResolution(battles) {
    if (!battles || battles.length === 0) return;
    
    battles.forEach((battle, index) => {
      setTimeout(() => {
        this.showBattle(battle.from, battle.to, battle.winner);
        if (battle.territoryChanged) {
          setTimeout(() => {
            this.showConquest(battle.to, battle.winner);
          }, 1000);
        }
      }, index * 500); // Stagger battles
    });
  },

  // Show deal success animation between two agents
  showDealSuccess(agent1Id, agent2Id) {
    // Find territories owned by these agents from gameState
    const svg = document.getElementById('gameMap');
    if (!svg) return;
    
    // We'll need to access gameState from client - for now create visual at center
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'deal-success-line');
    
    // Create connecting line between their territories if we can find them
    // For now, create a celebration burst at random positions
    const burst = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    burst.setAttribute('cx', 600);
    burst.setAttribute('cy', 400);
    burst.setAttribute('r', 10);
    burst.setAttribute('fill', '#4caf50');
    burst.setAttribute('opacity', '0.8');
    burst.style.animation = 'dealLineSuccess 2s ease-out forwards';
    
    svg.appendChild(burst);
    setTimeout(() => burst.remove(), 2000);
  },

  // Show deal failure/betrayal animation
  showDealFailure(agent1Id, agent2Id) {
    const svg = document.getElementById('gameMap');
    if (!svg) return;
    
    // Create explosion effect
    const burst = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    burst.setAttribute('cx', 600);
    burst.setAttribute('cy', 400);
    burst.setAttribute('r', 10);
    burst.setAttribute('fill', '#f44336');
    burst.setAttribute('opacity', '0.8');
    burst.style.animation = 'dealLineFail 2s ease-out forwards';
    
    svg.appendChild(burst);
    setTimeout(() => burst.remove(), 2000);
  }
};

// Export for use in client.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MapRenderer;
}