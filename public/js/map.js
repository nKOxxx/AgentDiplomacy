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

  render(gameState) {
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
  }
};

// Export for use in client.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MapRenderer;
}