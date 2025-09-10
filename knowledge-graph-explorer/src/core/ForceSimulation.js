/**
 * Force Simulation Manager for Knowledge Graph Explorer
 * Handles D3 force simulation setup, configuration, and lifecycle management
 */
class ForceSimulation {
  constructor(config = {}) {
    this.config = {
      width: 800,
      height: 600,
      
      // Force strengths
      linkDistance: 80,
      linkStrength: 0.7,
      chargeStrength: -400,
      chargeDistanceMax: 500,
      collisionRadius: 25,
      centerStrength: 1,
      
      // Simulation parameters
      alphaMin: 0.001,
      alphaDecay: 0.0228,
      velocityDecay: 0.4,
      
      ...config
    };

    this.simulation = null;
    this.nodes = [];
    this.links = [];
    this.isRunning = false;
    
    // Event callbacks
    this.onTick = null;
    this.onEnd = null;
    
    this.setupSimulation();
  }

  /**
   * Initialize the D3 force simulation with default forces
   */
  setupSimulation() {
    const centerX = this.config.width / 2;
    const centerY = this.config.height / 2;

    this.simulation = d3.forceSimulation()
      .alphaMin(this.config.alphaMin)
      .alphaDecay(this.config.alphaDecay)
      .velocityDecay(this.config.velocityDecay)
      .on('tick', () => {
        if (this.onTick) {
          this.onTick(this.simulation);
        }
      })
      .on('end', () => {
        this.isRunning = false;
        if (this.onEnd) {
          this.onEnd(this.simulation);
        }
      });

    // Setup default forces
    this.setupForces(centerX, centerY);
  }

  /**
   * Configure all simulation forces
   * @param {number} centerX - Center X coordinate
   * @param {number} centerY - Center Y coordinate
   */
  setupForces(centerX, centerY) {
    // Link force - attracts connected nodes
    this.simulation.force('link', d3.forceLink()
      .id(d => d.id)
      .distance(d => this.getLinkDistance(d))
      .strength(d => this.getLinkStrength(d))
    );

    // Charge force - repels nodes from each other
    this.simulation.force('charge', d3.forceManyBody()
      .strength(d => this.getChargeStrength(d))
      .distanceMax(this.config.chargeDistanceMax)
    );

    // Center force - attracts nodes toward center
    this.simulation.force('center', d3.forceCenter(centerX, centerY)
      .strength(this.config.centerStrength)
    );

    // Collision force - prevents node overlap
    this.simulation.force('collision', d3.forceCollide()
      .radius(d => this.getCollisionRadius(d))
      .strength(0.8)
      .iterations(2)
    );
  }

  /**
   * Calculate link distance for a specific link
   * @param {Object} link - Link data
   * @returns {number} - Distance value
   */
  getLinkDistance(link) {
    if (link.distance !== undefined) {
      return link.distance;
    }
    
    // Adjust distance based on link strength
    const baseDistance = this.config.linkDistance;
    const strength = link.strength || 0.5;
    
    // Stronger connections should be closer
    return baseDistance * (1.5 - strength);
  }

  /**
   * Calculate link strength for a specific link
   * @param {Object} link - Link data
   * @returns {number} - Strength value (0-1)
   */
  getLinkStrength(link) {
    if (link.strength !== undefined) {
      return link.strength * this.config.linkStrength;
    }
    return this.config.linkStrength;
  }

  /**
   * Calculate charge (repulsion) strength for a specific node
   * @param {Object} node - Node data
   * @returns {number} - Negative charge strength
   */
  getChargeStrength(node) {
    const baseStrength = this.config.chargeStrength;
    const size = node.size || 10;
    
    // Larger nodes should have stronger repulsion
    const sizeMultiplier = Math.sqrt(size / 10);
    return baseStrength * sizeMultiplier;
  }

  /**
   * Calculate collision radius for a specific node
   * @param {Object} node - Node data
   * @returns {number} - Collision radius
   */
  getCollisionRadius(node) {
    const nodeRadius = node.size || 10;
    return nodeRadius + this.config.collisionRadius;
  }

  /**
   * Update simulation data and restart if needed
   * @param {Array} nodes - Array of node objects
   * @param {Array} links - Array of link objects
   * @param {boolean} restart - Whether to restart the simulation
   */
  updateData(nodes, links, restart = true) {
    this.nodes = nodes || [];
    this.links = links || [];

    // Update simulation nodes and links
    this.simulation.nodes(this.nodes);
    
    const linkForce = this.simulation.force('link');
    if (linkForce) {
      linkForce.links(this.links);
    }

    if (restart) {
      this.restart();
    }
  }

  /**
   * Start or restart the simulation
   * @param {number} alpha - Initial alpha value (energy level)
   */
  restart(alpha = 1) {
    if (this.simulation) {
      this.isRunning = true;
      this.simulation.alpha(alpha).restart();
    }
  }

  /**
   * Stop the simulation
   */
  stop() {
    if (this.simulation) {
      this.isRunning = false;
      this.simulation.stop();
    }
  }

  /**
   * Pause/resume the simulation
   */
  toggle() {
    if (this.isRunning) {
      this.stop();
    } else {
      this.restart();
    }
  }

  /**
   * Update the center point of the simulation
   * @param {number} x - New center X coordinate
   * @param {number} y - New center Y coordinate
   */
  updateCenter(x, y) {
    const centerForce = this.simulation.force('center');
    if (centerForce) {
      centerForce.x(x).y(y);
    }
  }

  /**
   * Update simulation dimensions and recalculate center
   * @param {number} width - New width
   * @param {number} height - New height
   */
  updateDimensions(width, height) {
    this.config.width = width;
    this.config.height = height;
    this.updateCenter(width / 2, height / 2);
  }

  /**
   * Apply custom positioning to specific nodes
   * @param {Array} nodePositions - Array of {id, x, y} objects
   * @param {boolean} fix - Whether to fix these positions
   */
  setNodePositions(nodePositions, fix = false) {
    const positionMap = new Map();
    nodePositions.forEach(pos => {
      positionMap.set(pos.id, pos);
    });

    this.nodes.forEach(node => {
      const position = positionMap.get(node.id);
      if (position) {
        node.x = position.x;
        node.y = position.y;
        
        if (fix) {
          node.fx = position.x;
          node.fy = position.y;
        }
      }
    });
  }

  /**
   * Release fixed positions for specified nodes
   * @param {Array} nodeIds - Array of node IDs to unfix
   */
  unfixNodes(nodeIds = null) {
    const toUnfix = nodeIds ? new Set(nodeIds) : null;
    
    this.nodes.forEach(node => {
      if (!toUnfix || toUnfix.has(node.id)) {
        node.fx = null;
        node.fy = null;
      }
    });
  }

  /**
   * Fix a node at its current position
   * @param {string} nodeId - ID of node to fix
   */
  fixNode(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (node && node.x !== undefined && node.y !== undefined) {
      node.fx = node.x;
      node.fy = node.y;
    }
  }

  /**
   * Temporarily increase simulation energy for layout adjustments
   * @param {number} alpha - Energy level (0-1)
   */
  reheat(alpha = 0.3) {
    if (this.simulation) {
      this.simulation.alpha(alpha).restart();
    }
  }

  /**
   * Configure force strengths dynamically
   * @param {Object} forceConfig - Object with force configuration
   */
  updateForceStrengths(forceConfig) {
    Object.assign(this.config, forceConfig);

    // Update existing forces
    const linkForce = this.simulation.force('link');
    if (linkForce && forceConfig.linkDistance !== undefined) {
      linkForce.distance(d => this.getLinkDistance(d));
    }
    if (linkForce && forceConfig.linkStrength !== undefined) {
      linkForce.strength(d => this.getLinkStrength(d));
    }

    const chargeForce = this.simulation.force('charge');
    if (chargeForce && forceConfig.chargeStrength !== undefined) {
      chargeForce.strength(d => this.getChargeStrength(d));
    }

    const collisionForce = this.simulation.force('collision');
    if (collisionForce && forceConfig.collisionRadius !== undefined) {
      collisionForce.radius(d => this.getCollisionRadius(d));
    }

    // Reheat to apply changes
    if (this.isRunning) {
      this.reheat();
    }
  }

  /**
   * Add custom force to the simulation
   * @param {string} name - Force name
   * @param {Function} force - D3 force function
   */
  addCustomForce(name, force) {
    if (this.simulation) {
      this.simulation.force(name, force);
    }
  }

  /**
   * Remove a force from the simulation
   * @param {string} name - Force name to remove
   */
  removeForce(name) {
    if (this.simulation) {
      this.simulation.force(name, null);
    }
  }

  /**
   * Get current simulation statistics
   * @returns {Object} - Simulation state information
   */
  getStats() {
    if (!this.simulation) {
      return null;
    }

    // Get forces by checking what forces are actually set
    const forces = [];
    const forceNames = ['link', 'charge', 'center', 'collision'];
    
    forceNames.forEach(name => {
      if (this.simulation.force(name)) {
        forces.push(name);
      }
    });

    // Check for any additional forces by trying common custom force names
    // This is a workaround since D3's internal _forces is not reliable
    const customForceNames = ['customX', 'customY', 'radial', 'x', 'y'];
    customForceNames.forEach(name => {
      if (this.simulation.force(name)) {
        forces.push(name);
      }
    });

    return {
      alpha: this.simulation.alpha(),
      alphaMin: this.simulation.alphaMin(),
      alphaTarget: this.simulation.alphaTarget(),
      isRunning: this.isRunning,
      nodeCount: this.nodes.length,
      linkCount: this.links.length,
      forces: forces,
      velocityDecay: this.simulation.velocityDecay()
    };
  }

  /**
   * Set tick callback function
   * @param {Function} callback - Function to call on each tick
   */
  onTickCallback(callback) {
    this.onTick = callback;
  }

  /**
   * Set end callback function
   * @param {Function} callback - Function to call when simulation ends
   */
  onEndCallback(callback) {
    this.onEnd = callback;
  }

  /**
   * Calculate the bounds of all nodes
   * @param {number} padding - Padding around the bounds
   * @returns {Object} - Bounds object {minX, maxX, minY, maxY, width, height}
   */
  getNodeBounds(padding = 0) {
    if (this.nodes.length === 0) {
      return null;
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    this.nodes.forEach(node => {
      if (node.x !== undefined && node.y !== undefined) {
        const radius = (node.size || 10) + padding;
        minX = Math.min(minX, node.x - radius);
        maxX = Math.max(maxX, node.x + radius);
        minY = Math.min(minY, node.y - radius);
        maxY = Math.max(maxY, node.y + radius);
      }
    });

    if (minX === Infinity) {
      return null;
    }

    return {
      minX, maxX, minY, maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    };
  }

  /**
   * Apply a layout preset
   * @param {string} layoutType - Type of layout ('circle', 'grid', 'random')
   * @param {Object} options - Layout-specific options
   */
  applyLayout(layoutType, options = {}) {
    const { width = this.config.width, height = this.config.height } = options;
    const centerX = width / 2;
    const centerY = height / 2;

    switch (layoutType) {
      case 'circle':
        this.applyCircleLayout(centerX, centerY, options);
        break;
      case 'grid':
        this.applyGridLayout(width, height, options);
        break;
      case 'random':
        this.applyRandomLayout(width, height, options);
        break;
      default:
        console.warn(`Unknown layout type: ${layoutType}`);
    }

    this.reheat();
  }

  /**
   * Apply circular layout
   * @param {number} centerX - Center X coordinate
   * @param {number} centerY - Center Y coordinate
   * @param {Object} options - Layout options
   */
  applyCircleLayout(centerX, centerY, options = {}) {
    const { radius = Math.min(this.config.width, this.config.height) / 3 } = options;
    const angleStep = (2 * Math.PI) / this.nodes.length;

    this.nodes.forEach((node, index) => {
      const angle = index * angleStep;
      node.x = centerX + radius * Math.cos(angle);
      node.y = centerY + radius * Math.sin(angle);
    });
  }

  /**
   * Apply grid layout
   * @param {number} width - Layout width
   * @param {number} height - Layout height
   * @param {Object} options - Layout options
   */
  applyGridLayout(width, height, options = {}) {
    const { padding = 50 } = options;
    const cols = Math.ceil(Math.sqrt(this.nodes.length));
    const rows = Math.ceil(this.nodes.length / cols);
    
    const cellWidth = (width - 2 * padding) / cols;
    const cellHeight = (height - 2 * padding) / rows;

    this.nodes.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      
      node.x = padding + col * cellWidth + cellWidth / 2;
      node.y = padding + row * cellHeight + cellHeight / 2;
    });
  }

  /**
   * Apply random layout
   * @param {number} width - Layout width
   * @param {number} height - Layout height
   * @param {Object} options - Layout options
   */
  applyRandomLayout(width, height, options = {}) {
    const { padding = 50 } = options;
    
    this.nodes.forEach(node => {
      node.x = padding + Math.random() * (width - 2 * padding);
      node.y = padding + Math.random() * (height - 2 * padding);
    });
  }

  /**
   * Cleanup and destroy the simulation
   */
  destroy() {
    if (this.simulation) {
      this.simulation.stop();
      this.simulation = null;
    }
    this.nodes = [];
    this.links = [];
    this.onTick = null;
    this.onEnd = null;
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ForceSimulation;
} else if (typeof window !== 'undefined') {
  window.ForceSimulation = ForceSimulation;
}