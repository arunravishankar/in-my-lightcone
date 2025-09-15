// === src/core/LabelLayoutManager.js ===
/**
 * Label Layout Manager for Knowledge Graph Explorer
 * Handles intelligent positioning of node labels to prevent overlaps
 */
class LabelLayoutManager {
  constructor(config = {}) {
    this.config = {
      // Label positioning preferences
      enabled: true,
      preferredPositions: ['bottom', 'right', 'top', 'left'],
      maxDistance: 50,
      minDistance: 15,
      padding: 8,

      // Collision detection
      collisionIterations: 3,
      positioningIterations: 2,

      // Animation
      transitionDuration: 200,

      // Font metrics (estimated ratios for common fonts)
      fontMetrics: {
        widthRatio: 0.6,  // Character width to font size ratio
        heightRatio: 1.1  // Line height to font size ratio
      },

      ...config
    };

    this.labels = [];
    this.nodes = [];
    this.labelElements = null;
    this.currentZoomScale = 1;

    // Cache for text measurements
    this.textMeasureCache = new Map();

    // Position constants for different directions
    this.POSITIONS = {
      bottom: { dx: 0, dy: 1 },
      right: { dx: 1, dy: 0 },
      top: { dx: 0, dy: -1 },
      left: { dx: -1, dy: 0 }
    };
  }

  /**
   * Initialize with node data and label elements
   * @param {Array} nodes - Array of node objects
   * @param {Selection} labelElements - D3 selection of label elements
   */
  initialize(nodes, labelElements) {
    this.nodes = nodes;
    this.labelElements = labelElements;
    this.updateLabelData();
  }

  /**
   * Update label data from current node positions and visibility
   */
  updateLabelData() {
    if (!this.labelElements || !this.nodes) return;

    this.labels = [];

    this.labelElements.each((d, i, nodes) => {
      const element = nodes[i];
      const node = d;

      // Only process visible labels
      const opacity = parseFloat(d3.select(element).style('opacity')) || 0;
      if (opacity <= 0) return;

      const labelData = {
        id: node.id,
        node: node,
        element: element,
        text: node.label || '',
        originalX: node.x,
        originalY: node.y + (node.size || 10) + 18,
        x: node.x,
        y: node.y + (node.size || 10) + 18,
        width: 0,
        height: 0,
        fontSize: this.getCurrentFontSize(element),
        preferredPosition: 'bottom',
        currentPosition: 'bottom'
      };

      // Calculate text dimensions
      this.calculateTextDimensions(labelData);

      this.labels.push(labelData);
    });
  }

  /**
   * Calculate text dimensions for a label
   * @param {Object} labelData - Label data object
   */
  calculateTextDimensions(labelData) {
    const cacheKey = `${labelData.text}_${labelData.fontSize}_${this.currentZoomScale}`;

    if (this.textMeasureCache.has(cacheKey)) {
      const cached = this.textMeasureCache.get(cacheKey);
      labelData.width = cached.width;
      labelData.height = cached.height;
      return;
    }

    // Use text measurement if available, otherwise estimate
    if (labelData.element) {
      try {
        const bbox = labelData.element.getBBox();
        labelData.width = bbox.width;
        labelData.height = bbox.height;
      } catch (e) {
        // Fallback to estimation
        this.estimateTextDimensions(labelData);
      }
    } else {
      this.estimateTextDimensions(labelData);
    }

    // Cache the result
    this.textMeasureCache.set(cacheKey, {
      width: labelData.width,
      height: labelData.height
    });

    // Limit cache size
    if (this.textMeasureCache.size > 200) {
      const firstKey = this.textMeasureCache.keys().next().value;
      this.textMeasureCache.delete(firstKey);
    }
  }

  /**
   * Estimate text dimensions based on font metrics
   * @param {Object} labelData - Label data object
   */
  estimateTextDimensions(labelData) {
    const fontSize = labelData.fontSize;
    const text = labelData.text || '';

    labelData.width = text.length * fontSize * this.config.fontMetrics.widthRatio;
    labelData.height = fontSize * this.config.fontMetrics.heightRatio;
  }

  /**
   * Get current font size from element or zoom-adjusted default
   * @param {Element} element - Label element
   * @returns {number} Font size in pixels
   */
  getCurrentFontSize(element) {
    if (element) {
      const style = window.getComputedStyle(element);
      const fontSize = parseFloat(style.fontSize);
      if (!isNaN(fontSize)) return fontSize;
    }

    // Fallback: estimate based on zoom scale
    const baseSize = 14;
    return baseSize / this.currentZoomScale;
  }

  /**
   * Update zoom scale for font size calculations
   * @param {number} zoomScale - Current zoom scale
   */
  updateZoomScale(zoomScale) {
    this.currentZoomScale = zoomScale;
    this.textMeasureCache.clear(); // Clear cache when zoom changes
  }

  /**
   * Calculate optimal label positions to avoid overlaps
   * @param {Array} visibleLabels - Array of visible labels (optional, uses all if not provided)
   */
  calculateOptimalPositions(visibleLabels = null) {
    if (!this.config.enabled) return;

    const labelsToProcess = visibleLabels || this.labels.filter(label =>
      this.labelElements && this.labelElements.filter(function() { return this === label.element; }).size() > 0
    );

    if (labelsToProcess.length === 0) return;

    // Update text dimensions for all labels
    labelsToProcess.forEach(label => {
      this.calculateTextDimensions(label);
    });

    // Apply collision avoidance algorithm
    for (let iteration = 0; iteration < this.config.positioningIterations; iteration++) {
      this.resolveCollisions(labelsToProcess);
    }
  }

  /**
   * Resolve collisions between labels using intelligent repositioning
   * @param {Array} labels - Labels to process
   */
  resolveCollisions(labels) {
    // Create spatial index for efficient collision detection
    const spatialIndex = this.createSpatialIndex(labels);

    for (let i = 0; i < labels.length; i++) {
      const labelA = labels[i];
      const conflicts = this.findConflicts(labelA, spatialIndex);

      if (conflicts.length > 0) {
        this.repositionLabel(labelA, conflicts);
      }
    }
  }

  /**
   * Create a simple spatial index for labels
   * @param {Array} labels - Labels to index
   * @returns {Map} Spatial index map
   */
  createSpatialIndex(labels) {
    const gridSize = 100;
    const index = new Map();

    labels.forEach(label => {
      const bounds = this.getLabelBounds(label);
      const gridX = Math.floor(bounds.centerX / gridSize);
      const gridY = Math.floor(bounds.centerY / gridSize);

      // Add to multiple grid cells if label spans across them
      for (let x = Math.floor(bounds.left / gridSize); x <= Math.floor(bounds.right / gridSize); x++) {
        for (let y = Math.floor(bounds.top / gridSize); y <= Math.floor(bounds.bottom / gridSize); y++) {
          const key = `${x},${y}`;
          if (!index.has(key)) index.set(key, []);
          index.get(key).push(label);
        }
      }
    });

    return index;
  }

  /**
   * Find labels that conflict with the given label
   * @param {Object} label - Label to check conflicts for
   * @param {Map} spatialIndex - Spatial index for efficient lookup
   * @returns {Array} Array of conflicting labels
   */
  findConflicts(label, spatialIndex) {
    const bounds = this.getLabelBounds(label);
    const gridSize = 100;
    const conflicts = new Set();

    // Check relevant grid cells
    for (let x = Math.floor(bounds.left / gridSize); x <= Math.floor(bounds.right / gridSize); x++) {
      for (let y = Math.floor(bounds.top / gridSize); y <= Math.floor(bounds.bottom / gridSize); y++) {
        const key = `${x},${y}`;
        const candidates = spatialIndex.get(key) || [];

        candidates.forEach(candidate => {
          if (candidate.id !== label.id && this.labelsOverlap(label, candidate)) {
            conflicts.add(candidate);
          }
        });
      }
    }

    return Array.from(conflicts);
  }

  /**
   * Check if two labels overlap
   * @param {Object} labelA - First label
   * @param {Object} labelB - Second label
   * @returns {boolean} True if labels overlap
   */
  labelsOverlap(labelA, labelB) {
    const boundsA = this.getLabelBounds(labelA);
    const boundsB = this.getLabelBounds(labelB);

    return !(boundsA.right < boundsB.left ||
             boundsA.left > boundsB.right ||
             boundsA.bottom < boundsB.top ||
             boundsA.top > boundsB.bottom);
  }

  /**
   * Get bounding box for a label including padding
   * @param {Object} label - Label object
   * @returns {Object} Bounding box {left, right, top, bottom, centerX, centerY}
   */
  getLabelBounds(label) {
    const padding = this.config.padding;
    const halfWidth = label.width / 2;
    const halfHeight = label.height / 2;

    return {
      left: label.x - halfWidth - padding,
      right: label.x + halfWidth + padding,
      top: label.y - halfHeight - padding,
      bottom: label.y + halfHeight + padding,
      centerX: label.x,
      centerY: label.y
    };
  }

  /**
   * Reposition a label to avoid conflicts
   * @param {Object} label - Label to reposition
   * @param {Array} conflicts - Conflicting labels
   */
  repositionLabel(label, conflicts) {
    const node = label.node;
    let bestPosition = null;
    let bestScore = -Infinity;

    // Try each preferred position
    for (const position of this.config.preferredPositions) {
      const candidatePos = this.calculatePositionForDirection(node, label, position);
      const score = this.scorePosition(candidatePos, conflicts, label);

      if (score > bestScore) {
        bestScore = score;
        bestPosition = candidatePos;
      }
    }

    if (bestPosition) {
      label.x = bestPosition.x;
      label.y = bestPosition.y;
      label.currentPosition = bestPosition.direction;
    }
  }

  /**
   * Calculate label position for a specific direction from node
   * @param {Object} node - Node object
   * @param {Object} label - Label object
   * @param {string} direction - Direction ('bottom', 'right', 'top', 'left')
   * @returns {Object} Position {x, y, direction}
   */
  calculatePositionForDirection(node, label, direction) {
    const pos = this.POSITIONS[direction];
    const nodeRadius = node.size || 10;
    const distance = this.config.minDistance + nodeRadius;

    let x = node.x;
    let y = node.y;

    if (direction === 'bottom') {
      y = node.y + distance + (label.height / 2);
    } else if (direction === 'top') {
      y = node.y - distance - (label.height / 2);
    } else if (direction === 'right') {
      x = node.x + distance + (label.width / 2);
    } else if (direction === 'left') {
      x = node.x - distance - (label.width / 2);
    }

    return { x, y, direction };
  }

  /**
   * Score a position based on conflicts and preferences
   * @param {Object} position - Position to score
   * @param {Array} conflicts - Conflicting labels
   * @param {Object} label - Label being positioned
   * @returns {number} Position score (higher is better)
   */
  scorePosition(position, conflicts, label) {
    let score = 0;

    // Create temporary label with new position
    const tempLabel = { ...label, x: position.x, y: position.y };

    // Penalty for conflicts
    conflicts.forEach(conflict => {
      if (this.labelsOverlap(tempLabel, conflict)) {
        score -= 100;
      }
    });

    // Bonus for preferred positions
    const preferenceIndex = this.config.preferredPositions.indexOf(position.direction);
    score += (this.config.preferredPositions.length - preferenceIndex) * 10;

    // Penalty for distance from node
    const distance = Math.sqrt(
      Math.pow(position.x - label.node.x, 2) +
      Math.pow(position.y - label.node.y, 2)
    );

    if (distance > this.config.maxDistance) {
      score -= (distance - this.config.maxDistance) * 2;
    }

    return score;
  }

  /**
   * Apply calculated positions to label elements with animation
   * @param {Array} labelsToUpdate - Labels to update (optional, uses all if not provided)
   */
  applyPositions(labelsToUpdate = null) {
    if (!this.labelElements) return;

    const labels = labelsToUpdate || this.labels;

    // Update positions with smooth transitions
    labels.forEach(label => {
      const element = d3.select(label.element);

      if (this.config.transitionDuration > 0) {
        element
          .transition()
          .duration(this.config.transitionDuration)
          .ease(d3.easeQuadOut)
          .attr('x', label.x)
          .attr('y', label.y);
      } else {
        element
          .attr('x', label.x)
          .attr('y', label.y);
      }
    });
  }

  /**
   * Update data and recalculate positions
   * @param {Array} nodes - Updated node array
   * @param {Selection} labelElements - Updated label elements
   */
  updateData(nodes, labelElements) {
    this.nodes = nodes;
    this.labelElements = labelElements;
    this.updateLabelData();

    if (this.config.enabled) {
      this.calculateOptimalPositions();
      this.applyPositions();
    }
  }

  /**
   * Force immediate position update without animation
   */
  forceUpdate() {
    this.updateLabelData();

    if (this.config.enabled) {
      this.calculateOptimalPositions();

      // Apply positions immediately
      const originalDuration = this.config.transitionDuration;
      this.config.transitionDuration = 0;
      this.applyPositions();
      this.config.transitionDuration = originalDuration;
    }
  }

  /**
   * Update configuration
   * @param {Object} newConfig - Configuration updates
   */
  updateConfig(newConfig) {
    Object.assign(this.config, newConfig);

    if (this.config.enabled) {
      this.forceUpdate();
    }
  }

  /**
   * Enable or disable label collision detection
   * @param {boolean} enabled - Whether to enable collision detection
   */
  setEnabled(enabled) {
    this.config.enabled = enabled;

    if (enabled) {
      this.forceUpdate();
    }
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    this.textMeasureCache.clear();
  }

  /**
   * Get statistics about current label layout
   * @returns {Object} Layout statistics
   */
  getStats() {
    const stats = {
      totalLabels: this.labels.length,
      cacheSize: this.textMeasureCache.size,
      positionDistribution: {},
      averageDistance: 0
    };

    // Count position distribution
    this.labels.forEach(label => {
      const pos = label.currentPosition;
      stats.positionDistribution[pos] = (stats.positionDistribution[pos] || 0) + 1;
    });

    // Calculate average distance from nodes
    if (this.labels.length > 0) {
      const totalDistance = this.labels.reduce((sum, label) => {
        const distance = Math.sqrt(
          Math.pow(label.x - label.node.x, 2) +
          Math.pow(label.y - label.node.y, 2)
        );
        return sum + distance;
      }, 0);

      stats.averageDistance = totalDistance / this.labels.length;
    }

    return stats;
  }

  /**
   * Cleanup and destroy the manager
   */
  destroy() {
    this.labels = [];
    this.nodes = [];
    this.labelElements = null;
    this.textMeasureCache.clear();
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LabelLayoutManager;
} else if (typeof window !== 'undefined') {
  window.LabelLayoutManager = LabelLayoutManager;
}// === src/core/ForceSimulation.js ===
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
      linkDistance: 120,
      linkStrength: 0.3,
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
}// === src/core/UIControlsManager.js ===
/**
 * UI Controls Manager for Knowledge Graph Explorer
 * Handles timeline controls, layer buttons, audience filtering, info panels, and other UI elements
 */
class UIControlsManager {
  constructor(config = {}) {
    this.config = {
      showTimeline: true,
      showLayerControls: true,
      showAudienceControls: true,
      showNodeInfo: true,
      showMiniMap: true,
      timelineHeight: 60,
      controlPanelWidth: 200,
      ...config
    };

    // State
    this.graph = null;
    this.container = null;
    this.layers = [];
    this.timeline = { start: 2000, end: 2025 };
    this.currentTimelinePosition = null;
    this.activeLayer = null;
    this.activeAudience = 'current_focus';
    this.selectedNode = null;

    // DOM elements
    this.uiContainer = null;
    this.timelineContainer = null;
    this.layerContainer = null;
    this.audienceContainer = null;
    this.infoPanel = null;
    this.timelineSlider = null;
    this.refreshButton = null;

    // Event handlers
    this.eventHandlers = {};
  }

  /**
   * Initialize UI controls
   * @param {Element} container - Main container element
   * @param {Object} graph - KnowledgeGraphExplorer instance
   * @param {Object} data - Graph data with layers and timeline info
   */
  initialize(container, graph, data) {
    this.container = container;
    this.graph = graph;
    this.layers = data.layers || [];
    
    // Extract timeline range from config or data
    if (data.timeline) {
      this.timeline = data.timeline;
    }

    this.createUIStructure();
    this.setupEventListeners();
  }

  /**
   * Create the overall UI structure
   */
  createUIStructure() {
    // Don't restructure DOM - just add overlay controls to existing container
    this.container.style.position = 'relative';
    this.container.style.fontFamily = 'system-ui, -apple-system, sans-serif';

    // Create control panels as overlays
    if (this.config.showLayerControls && this.layers.length > 0) {
      this.createLayerControls();
    }

    // Add audience controls (bottom-right)
    if (this.config.showAudienceControls) {
      this.createAudienceControls();
    }

    // Add refresh button
    this.createRefreshButton();

    if (this.config.showTimeline && this.timeline.start && this.timeline.end) {
      this.createTimelineControls();
    }

    if (this.config.showNodeInfo) {
      this.createInfoPanel();
    }
  }
  
  /**
   * Create layer control buttons
   */
  createLayerControls() {
    this.layerContainer = document.createElement('div');
    this.layerContainer.className = 'kg-layer-controls';
    this.layerContainer.style.cssText = `
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(255, 255, 255, 0.95);
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 10px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      z-index: 100;
      max-width: 180px;
    `;

    // Title
    const title = document.createElement('div');
    title.textContent = 'Layers';
    title.style.cssText = `
      font-weight: bold;
      margin-bottom: 8px;
      font-size: 12px;
      color: #333;
    `;
    this.layerContainer.appendChild(title);

    // "All Layers" button
    const allButton = this.createLayerButton('all', 'All Layers', '#666');
    allButton.classList.add('active');
    this.layerContainer.appendChild(allButton);

    // Individual layer buttons
    this.layers.forEach(layer => {
      const button = this.createLayerButton(layer.id, layer.name, layer.color);
      this.layerContainer.appendChild(button);
    });

    this.container.appendChild(this.layerContainer);
  }

  /**
   * Create a single layer button
   */
  createLayerButton(layerId, layerName, color) {
    const button = document.createElement('button');
    button.className = 'kg-layer-btn';
    button.setAttribute('data-layer', layerId);
    button.style.cssText = `
      display: block;
      width: 100%;
      margin: 2px 0;
      padding: 6px 8px;
      border: 1px solid ${color};
      background: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      text-align: left;
      transition: all 0.2s ease;
    `;

    // Color indicator
    const colorDot = document.createElement('span');
    colorDot.style.cssText = `
      display: inline-block;
      width: 8px;
      height: 8px;
      background: ${color};
      border-radius: 50%;
      margin-right: 6px;
    `;
    
    button.appendChild(colorDot);
    button.appendChild(document.createTextNode(layerName));

    // Hover and active states
    button.addEventListener('mouseenter', () => {
      if (!button.classList.contains('active')) {
        button.style.background = color + '20';
      }
    });

    button.addEventListener('mouseleave', () => {
      if (!button.classList.contains('active')) {
        button.style.background = 'white';
      }
    });

    button.addEventListener('click', () => {
      this.setActiveLayer(layerId);
    });

    return button;
  }

  /**
   * Create audience filter controls (bottom-right)
   */
  createAudienceControls() {
    this.audienceContainer = document.createElement('div');
    this.audienceContainer.className = 'kg-audience-controls';
    this.audienceContainer.style.cssText = `
      position: absolute;
      bottom: 10px;
      right: 10px;
      background: rgba(255, 255, 255, 0.95);
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 10px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      z-index: 100;
      max-width: 180px;
    `;

    // Title
    const title = document.createElement('div');
    title.textContent = 'View For';
    title.style.cssText = `
      font-weight: bold;
      margin-bottom: 8px;
      font-size: 12px;
      color: #333;
    `;
    this.audienceContainer.appendChild(title);

    // Audience filter buttons
    const audiences = [
      { id: 'general', name: 'General Audience', color: '#2780e3' },
      { id: 'technical', name: 'Technical', color: '#3fb618' },
      { id: 'current_focus', name: 'Current Focus', color: '#ff6b35' }
    ];

    audiences.forEach(audience => {
      const button = this.createAudienceButton(audience.id, audience.name, audience.color);
      if (audience.id === 'current_focus') {
        button.classList.add('active');
      }
      this.audienceContainer.appendChild(button);
    });

    this.container.appendChild(this.audienceContainer);
  }

  /**
   * Create a single audience filter button
   */
  createAudienceButton(audienceId, audienceName, color) {
    const button = document.createElement('button');
    button.className = 'kg-audience-btn';
    button.setAttribute('data-audience', audienceId);
    button.style.cssText = `
      display: block;
      width: 100%;
      margin: 2px 0;
      padding: 6px 8px;
      border: 1px solid ${color};
      background: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      text-align: center;
      transition: all 0.2s ease;
    `;
    button.textContent = audienceName;

    // Hover and active states
    button.addEventListener('mouseenter', () => {
      if (!button.classList.contains('active')) {
        button.style.background = color + '20';
      }
    });

    button.addEventListener('mouseleave', () => {
      if (!button.classList.contains('active')) {
        button.style.background = 'white';
      }
    });

    button.addEventListener('click', () => {
      this.setActiveAudience(audienceId);
    });

    return button;
  }

  /**
   * Create refresh button for resetting node positions
   */
  createRefreshButton() {
    this.refreshButton = document.createElement('button');
    this.refreshButton.className = 'kg-refresh-btn';
    this.refreshButton.innerHTML = '🔄'; // Refresh icon
    this.refreshButton.title = 'Reset node positions';
    this.refreshButton.style.cssText = `
      position: absolute;
      top: 10px;
      left: ${this.layerContainer ? '200px' : '10px'}; /* Adjust based on layer controls */
      width: 36px;
      height: 36px;
      background: rgba(255, 255, 255, 0.95);
      border: 1px solid #ddd;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      z-index: 100;
      transition: all 0.2s ease;
    `;

    // Hover effects
    this.refreshButton.addEventListener('mouseenter', () => {
      this.refreshButton.style.background = '#f0f0f0';
      this.refreshButton.style.transform = 'scale(1.05)';
    });

    this.refreshButton.addEventListener('mouseleave', () => {
      this.refreshButton.style.background = 'rgba(255, 255, 255, 0.95)';
      this.refreshButton.style.transform = 'scale(1)';
    });

    // Click handler
    this.refreshButton.addEventListener('click', () => {
      this.refreshNodePositions();
    });

    this.container.appendChild(this.refreshButton);
  }

  /**
   * Refresh/reset node positions
   */
  refreshNodePositions() {
    if (!this.graph) return;

    // Add visual feedback
    this.refreshButton.style.transform = 'rotate(360deg)';
    this.refreshButton.style.transition = 'transform 0.5s ease';

    // Reset the transform after animation
    setTimeout(() => {
      this.refreshButton.style.transform = 'scale(1)';
      this.refreshButton.style.transition = 'all 0.2s ease';
    }, 500);

    // Restart the simulation with higher energy
    if (this.graph.components && this.graph.components.forceSimulation) {
      // Clear any fixed positions
      this.graph.nodes.forEach(node => {
        node.fx = null;
        node.fy = null;
      });

      // Restart with high energy
      this.graph.components.forceSimulation.restart(1.0);
    }

    this.emit('refresh', { timestamp: Date.now() });
  }

  /**
   * Create timeline controls (compact version)
   */
  createTimelineControls() {
    this.timelineContainer = document.createElement('div');
    this.timelineContainer.className = 'kg-timeline-controls';
    this.timelineContainer.style.cssText = `
      position: absolute;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(255, 255, 255, 0.95);
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 8px 15px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      z-index: 100;
      min-width: 250px;
    `;

    // Title and current year display
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      font-size: 11px;
      color: #333;
    `;

    const title = document.createElement('span');
    title.textContent = 'Timeline';
    title.style.fontWeight = 'bold';

    this.currentYearDisplay = document.createElement('span');
    this.currentYearDisplay.textContent = 'All Years';
    this.currentYearDisplay.style.color = '#666';

    header.appendChild(title);
    header.appendChild(this.currentYearDisplay);
    this.timelineContainer.appendChild(header);

    // Timeline slider
    this.timelineSlider = document.createElement('input');
    this.timelineSlider.type = 'range';
    this.timelineSlider.min = this.timeline.start;
    this.timelineSlider.max = this.timeline.end;
    this.timelineSlider.value = this.timeline.end;
    this.timelineSlider.style.cssText = `
      width: 100%;
      margin: 4px 0;
      height: 4px;
    `;

    // Timeline labels
    const labels = document.createElement('div');
    labels.style.cssText = `
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #666;
      margin-top: 2px;
    `;

    const startLabel = document.createElement('span');
    startLabel.textContent = this.timeline.start;
    const endLabel = document.createElement('span');
    endLabel.textContent = this.timeline.end;

    labels.appendChild(startLabel);
    labels.appendChild(endLabel);

    // "All Years" toggle button
    const allYearsBtn = document.createElement('button');
    allYearsBtn.textContent = 'Show All Years';
    allYearsBtn.style.cssText = `
      margin-top: 6px;
      padding: 3px 6px;
      border: 1px solid #ddd;
      background: white;
      border-radius: 3px;
      cursor: pointer;
      font-size: 10px;
      width: 100%;
    `;

    this.timelineContainer.appendChild(this.timelineSlider);
    this.timelineContainer.appendChild(labels);
    this.timelineContainer.appendChild(allYearsBtn);

    // Event listeners
    this.timelineSlider.addEventListener('input', (e) => {
      this.setTimelinePosition(parseInt(e.target.value));
    });

    allYearsBtn.addEventListener('click', () => {
      this.showAllYears();
    });

    this.container.appendChild(this.timelineContainer);
  }

  /**
   * Create info panel for displaying node/link details (top-right)
   */
  createInfoPanel() {
    this.infoPanel = document.createElement('div');
    this.infoPanel.className = 'kg-info-panel';
    this.infoPanel.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(255, 255, 255, 0.95);
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 15px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      z-index: 100;
      max-width: 280px;
      height: calc(100% - 200px);
      overflow-y: auto;
      overflow-x: hidden;
      display: none;
      pointer-events: auto;
    `;

    this.container.appendChild(this.infoPanel);
  }

  /**
   * Setup event listeners with the graph
   */
  setupEventListeners() {
    if (!this.graph) return;

    // Listen for node clicks
    this.graph.on('nodeClick', (data) => {
      this.showNodeInfo(data.node);
    });

    // Listen for background clicks to hide info
    this.graph.on('backgroundClick', () => {
      this.hideInfo();
    });

    // Listen for layer changes
    this.graph.on('layerChange', (data) => {
      this.updateLayerButtons(data.layer);
    });
  }

  /**
   * Set active layer
   */
  setActiveLayer(layerId) {
    this.activeLayer = layerId === 'all' ? null : layerId;
    
    // Update graph
    if (this.graph) {
      if (layerId === 'all') {
        this.graph.showAllLayers();
      } else {
        this.graph.setActiveLayer(layerId);
      }
    }

    // Update button states
    this.updateLayerButtons(this.activeLayer);
    
    this.emit('layerChange', { layer: this.activeLayer });
  }

  /**
   * Set active audience filter
   */
  setActiveAudience(audienceId) {
    this.activeAudience = audienceId;
    
    // Update graph visual effects
    if (this.graph) {
      this.graph.setAudienceFilter(audienceId);
    }

    // Update button states
    this.updateAudienceButtons(audienceId);
    
    this.emit('audienceChange', { audience: audienceId });
  }

  /**
   * Update layer button visual states
   */
  updateLayerButtons(activeLayerId) {
    if (!this.layerContainer) return;

    const buttons = this.layerContainer.querySelectorAll('.kg-layer-btn');
    buttons.forEach(btn => {
      const layerId = btn.getAttribute('data-layer');
      const isActive = (activeLayerId === null && layerId === 'all') || 
                      (activeLayerId === layerId);
      
      btn.classList.toggle('active', isActive);
      
      if (isActive) {
        const color = layerId === 'all' ? '#666' : 
                     this.layers.find(l => l.id === layerId)?.color || '#666';
        btn.style.background = color + '30';
        btn.style.fontWeight = 'bold';
      } else {
        btn.style.background = 'white';
        btn.style.fontWeight = 'normal';
      }
    });
  }

  /**
   * Update audience button visual states
   */
  updateAudienceButtons(activeAudienceId) {
    if (!this.audienceContainer) return;

    const buttons = this.audienceContainer.querySelectorAll('.kg-audience-btn');
    buttons.forEach(btn => {
      const audienceId = btn.getAttribute('data-audience');
      const isActive = audienceId === activeAudienceId;
      
      btn.classList.toggle('active', isActive);
      
      if (isActive) {
        const audiences = {
          general: '#2780e3',
          technical: '#3fb618',
          current_focus: '#ff6b35'
        };
        const color = audiences[audienceId] || '#666';
        btn.style.background = color + '30';
        btn.style.fontWeight = 'bold';
      } else {
        btn.style.background = 'white';
        btn.style.fontWeight = 'normal';
      }
    });
  }

  /**
   * Set timeline position
   */
  setTimelinePosition(year) {
    this.currentTimelinePosition = year;
    this.currentYearDisplay.textContent = year.toString();
    
    // TODO: Filter nodes/links by timeline position
    // This would require integration with the graph's data filtering
    
    this.emit('timelineChange', { year: year });
  }

  /**
   * Show all years (reset timeline)
   */
  showAllYears() {
    this.currentTimelinePosition = null;
    this.currentYearDisplay.textContent = 'All Years';
    this.timelineSlider.value = this.timeline.end;
    
    // TODO: Reset timeline filtering
    
    this.emit('timelineChange', { year: null });
  }

  /**
   * Show node information in the info panel
   */
  showNodeInfo(node) {
    if (!this.infoPanel) return;

    this.selectedNode = node;
  
    const title = document.createElement('div');
    title.style.cssText = `
      font-weight: bold;
      font-size: 14px;
      margin-bottom: 8px;
      color: #333;
    `;
    title.textContent = node.label;

    const description = document.createElement('div');
    description.style.cssText = `
      font-size: 12px;
      line-height: 1.4;
      color: #555;
      margin-bottom: 10px;
    `;
    description.textContent = node.description || 'No description available.';

    // Additional details
    const details = document.createElement('div');
    details.style.cssText = `
      font-size: 11px;
      color: #777;
      border-top: 1px solid #eee;
      padding-top: 8px;
      margin-bottom: 10px;
    `;

    if (node.timespan) {
      const timespan = document.createElement('div');
      const endText = node.timespan.end ? node.timespan.end : 'current';
      timespan.textContent = `${node.timespan.start} - ${endText}`;
      details.appendChild(timespan);
    }

    // Layer tag (colored box instead of text)
    if (node.layer) {
      const layerInfo = this.layers.find(l => l.id === node.layer);
      const layerTag = document.createElement('div');
      layerTag.style.cssText = `
        display: inline-block;
        background: ${layerInfo?.color || '#666'};
        color: ${this.isDarkTheme() ? 'white' : 'black'} !important;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 10px;
        font-weight: bold;
        margin-top: 4px;
      `;
      layerTag.textContent = layerInfo?.name || node.layer;
      details.appendChild(layerTag);
    }

    // Related nodes section
    const relatedSection = this.createRelatedNodesSection(node);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      position: absolute;
      top: 5px;
      right: 5px;
      border: none;
      background: none;
      font-size: 16px;
      cursor: pointer;
      color: #999;
    `;
    closeBtn.addEventListener('click', () => this.hideInfo());

    // Create scrollable content area
    const scrollableContent = document.createElement('div');
    scrollableContent.style.cssText = `
      max-height: 320px;
      overflow-y: auto;
      margin-bottom: 10px;
      padding-right: 5px;
    `;

    // Add title, time/layer details, then description to scrollable area
    scrollableContent.appendChild(title);
    scrollableContent.appendChild(details);
    scrollableContent.appendChild(description);

    // Create fixed related section at bottom
    const fixedRelatedSection = document.createElement('div');
    fixedRelatedSection.style.cssText = `
      border-top: 2px solid #ddd;
      padding-top: 8px;
      background: rgba(255, 255, 255, 0.98);
      position: sticky;
      bottom: 0;
    `;
    fixedRelatedSection.appendChild(relatedSection);

    // Clear and populate
    this.infoPanel.innerHTML = '';
    this.infoPanel.appendChild(closeBtn);
    this.infoPanel.appendChild(scrollableContent);
    this.infoPanel.appendChild(fixedRelatedSection);
  
    this.infoPanel.style.display = 'block';
  }

  /**
   * Create the "Related To" section showing connected nodes
   */
  createRelatedNodesSection(node) {
    // Find all links connected to this node (both as parent and child)
    const connectedLinks = this.graph.links.filter(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      return sourceId === node.id || targetId === node.id;
    });

    // Also find direct parent/child relationships
    const children = this.graph.nodes.filter(n => n.parent_node === node.id);
    const parent = node.parent_node ? this.graph.nodes.find(n => n.id === node.parent_node) : null;

    if (connectedLinks.length === 0 && children.length === 0 && !parent) {
      return document.createElement('div'); // Return empty div if no connections
    }

    const section = document.createElement('div');
    section.style.cssText = `
      border-top: 1px solid #eee;
      padding-top: 8px;
      margin-top: 8px;
    `;

    const title = document.createElement('div');
    title.textContent = 'Related To';
    title.style.cssText = `
      font-weight: bold;
      font-size: 11px;
      color: #333;
      margin-bottom: 6px;
    `;
    section.appendChild(title);

    // Add parent node
    if (parent) {
      this.addRelatedNodeLink(section, parent, 'parent');
    }

    // Add child nodes
    children.forEach(child => {
      this.addRelatedNodeLink(section, child, 'child');
    });

    // Add other connected nodes from links
    connectedLinks.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      
      const connectedNodeId = sourceId === node.id ? targetId : sourceId;
      const connectedNode = this.graph.nodes.find(n => n.id === connectedNodeId);
      
      if (connectedNode && connectedNode !== parent && !children.includes(connectedNode)) {
        this.addRelatedNodeLink(section, connectedNode, 'related');
      }
    });

    return section;
  }

  /**
   * Add a related node link to the related nodes section
   * @param {HTMLElement} container - The container to add the link to
   * @param {Object} node - The related node
   * @param {string} relationship - The relationship type ('parent', 'child', 'related')
   */
  addRelatedNodeLink(container, node, relationship) {
    const link = document.createElement('div');
    link.style.cssText = `
      display: flex;
      align-items: center;
      margin: 2px 0;
      padding: 2px 4px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      background: #f8f9fa;
      border: 1px solid #e9ecef;
      transition: background-color 0.2s;
    `;

    // Get layer info for color
    const layerInfo = this.layers.find(l => l.id === node.layer);
    const layerColor = layerInfo?.color || '#666';

    // Create color indicator
    const colorDot = document.createElement('div');
    colorDot.style.cssText = `
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${layerColor};
      margin-right: 6px;
      flex-shrink: 0;
    `;

    // Create text content
    const text = document.createElement('span');
    text.style.cssText = `
      color: #333;
      font-size: 10px;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
    `;

    // Add relationship prefix
    let prefix = '';
    switch (relationship) {
      case 'parent': prefix = '↑ '; break;
      case 'child': prefix = '↓ '; break;
      default: prefix = '→ '; break;
    }

    text.textContent = prefix + node.label;

    link.appendChild(colorDot);
    link.appendChild(text);

    // Add hover effects
    link.addEventListener('mouseenter', () => {
      link.style.backgroundColor = '#e9ecef';
    });

    link.addEventListener('mouseleave', () => {
      link.style.backgroundColor = '#f8f9fa';
    });

    // Add click handler to focus on related node
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      this.panToNode(node);
    });

    container.appendChild(link);
  }

  /**
   * Pan the graph to focus on a specific node
   */
  panToNode(node) {
    if (!this.graph || !node.x || !node.y) return;
  
    // Use the graph's focusOnNode method if available
    if (typeof this.graph.focusOnNode === 'function') {
      this.graph.focusOnNode(node.id);
    }
  }

  /**
   * Hide the info panel
   */
  hideInfo() {
    if (this.infoPanel) {
      this.infoPanel.style.display = 'none';
    }
    this.selectedNode = null;
  }

  /**
   * Get current UI state
   */
  getState() {
    return {
      activeLayer: this.activeLayer,
      activeAudience: this.activeAudience,
      currentTimelinePosition: this.currentTimelinePosition,
      selectedNode: this.selectedNode ? this.selectedNode.id : null,
      layerCount: this.layers.length
    };
  }

  /**
   * Add event listener
   */
  on(eventType, callback) {
    if (!this.eventHandlers[eventType]) {
      this.eventHandlers[eventType] = [];
    }
    this.eventHandlers[eventType].push(callback);
    return this;
  }

  /**
   * Emit event
   */
  emit(eventType, data = {}) {
    if (this.eventHandlers[eventType]) {
      this.eventHandlers[eventType].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in UI event handler for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Cleanup and destroy UI controls
   */
  destroy() {
    if (this.uiContainer && this.uiContainer.parentNode) {
      this.uiContainer.parentNode.removeChild(this.uiContainer);
    }
    this.eventHandlers = {};
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIControlsManager;
} else if (typeof window !== 'undefined') {
  window.UIControlsManager = UIControlsManager;
}// === src/core/InteractionManager.js ===
/**
 * Interaction Manager for Knowledge Graph Explorer
 * Handles mouse/touch interactions, hover effects, and event dispatching
 */
class InteractionManager {
  constructor(config = {}) {
    this.config = {
      hoverRadius: 50,
      maxHoverScale: 1.3,
      hoverTransitionDuration: 100,
      clickRadius: 20,
      doubleClickDelay: 300,
      dragThreshold: 5,
      ...config
    };

    // State
    this.nodes = [];
    this.links = [];
    this.coordinateTransform = null;
    this.isInLayerMode = false;
    this.hoveredNode = null;
    this.draggedNode = null;
    this.isDragging = false;
    this.lastClickTime = 0;
    this.lastClickNode = null;

    // DOM elements
    this.svgElement = null;
    this.nodeElements = null;
    this.linkElements = null;
    this.labelElements = null;

    // Event handlers
    this.eventHandlers = {};
    this.boundHandlers = {};

    this.setupBoundHandlers();
  }

  /**
   * Initialize interaction manager with DOM elements and coordinate transform
   * @param {Object} elements - Object containing SVG and D3 selections
   * @param {CoordinateTransform} coordinateTransform - Coordinate transformation utility
   */
  initialize(elements, coordinateTransform) {
    this.svgElement = elements.svg;
    this.nodeElements = elements.nodes;
    this.linkElements = elements.links;
    this.labelElements = elements.labels;
    this.coordinateTransform = coordinateTransform;

    this.setupEventListeners();
  }

  /**
   * Create bound handler functions to avoid memory leaks
   */
  setupBoundHandlers() {
    this.boundHandlers = {
      mousemove: this.handleMouseMove.bind(this),
      mouseleave: this.handleMouseLeave.bind(this),
      click: this.handleClick.bind(this),
      mousedown: this.handleMouseDown.bind(this),
      mouseup: this.handleMouseUp.bind(this),
      contextmenu: this.handleContextMenu.bind(this)
    };
  }

  /**
   * Setup event listeners on the SVG element
   */
  setupEventListeners() {
    if (!this.svgElement) return;

    // Mouse/touch events
    this.svgElement.on('mousemove', this.boundHandlers.mousemove);
    this.svgElement.on('mouseleave', this.boundHandlers.mouseleave);
    this.svgElement.on('click', this.boundHandlers.click);
    this.svgElement.on('mousedown', this.boundHandlers.mousedown);
    this.svgElement.on('mouseup', this.boundHandlers.mouseup);
    this.svgElement.on('contextmenu', this.boundHandlers.contextmenu);

    // Setup node-specific interactions
    this.setupNodeInteractions();
    this.setupLinkInteractions();
  }

  /**
   * Setup interactions specific to nodes
   */
  setupNodeInteractions() {
    if (!this.nodeElements) return;

    this.nodeElements
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        this.handleNodeClick(event, d);
      })
      .on('mousedown', (event, d) => {
        event.stopPropagation();
        this.handleNodeMouseDown(event, d);
      })
      .on('mouseenter', (event, d) => {
        this.handleNodeMouseEnter(event, d);
      })
      .on('mouseleave', (event, d) => {
        this.handleNodeMouseLeave(event, d);
      });
  }

  /**
   * Setup interactions specific to links
   */
  setupLinkInteractions() {
    if (!this.linkElements) return;

    this.linkElements
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        this.handleLinkClick(event, d);
      })
      .on('mouseenter', (event, d) => {
        this.handleLinkMouseEnter(event, d);
      })
      .on('mouseleave', (event, d) => {
        this.handleLinkMouseLeave(event, d);
      });
  }

  /**
   * Update data references
   * @param {Array} nodes - Array of node objects
   * @param {Array} links - Array of link objects
   */
  updateData(nodes, links) {
    this.nodes = nodes || [];
    this.links = links || [];
  }

  /**
   * Update layer mode state
   * @param {boolean} isInLayerMode - Whether layer mode is active
   */
  updateLayerMode(isInLayerMode) {
    this.isInLayerMode = isInLayerMode;
  }

  /**
   * Handle mouse movement over the SVG
   * @param {Event} event - Mouse event
   */
  handleMouseMove(event) {
    if (this.isDragging) {
      this.handleDragMove(event);
      return;
    }

    if (this.isInLayerMode) return;

    // Get mouse position in graph coordinates
    const mousePos = this.coordinateTransform.eventToGraph(event, this.svgElement.node());

    // Emit dock hover effects for the main graph
    this.emit('dockHover', { mousePosition: mousePos });

    this.updateContinuousHoverEffects(mousePos);
  }

  /**
   * Handle mouse leaving the SVG area
   * @param {Event} event - Mouse event
   */
  handleMouseLeave(event) {
    // Reset dock hover effects
    this.emit('dockHoverReset');

    this.resetHoverEffects();
    if (this.isDragging) {
      this.endDrag();
    }
  }

  /**
   * Handle click events on the SVG background
   * @param {Event} event - Mouse event
   */
  handleClick(event) {
    // Only handle background clicks (not propagated from nodes/links)
    this.emit('backgroundClick', { event });
  }

  /**
   * Handle mouse down events for drag initiation
   * @param {Event} event - Mouse event
   */
  handleMouseDown(event) {
    if (event.button !== 0) return; // Only left mouse button

    const mousePos = this.coordinateTransform.eventToGraph(event, this.svgElement.node());
    const clickedNode = this.findNodeAtPosition(mousePos);

    if (clickedNode) {
      this.startDrag(event, clickedNode);
    }
  }

  /**
   * Handle mouse up events
   * @param {Event} event - Mouse event
   */
  handleMouseUp(event) {
    if (this.isDragging) {
      this.endDrag();
    }
  }

  /**
   * Handle context menu (right-click) events
   * @param {Event} event - Mouse event
   */
  handleContextMenu(event) {
    event.preventDefault();
    
    const mousePos = this.coordinateTransform.eventToGraph(event, this.svgElement.node());
    const clickedNode = this.findNodeAtPosition(mousePos);

    if (clickedNode) {
      this.emit('nodeContextMenu', { node: clickedNode, event });
    } else {
      this.emit('backgroundContextMenu', { event });
    }
  }

  /**
   * Handle node click events
   * @param {Event} event - Mouse event
   * @param {Object} node - Node data
   */
  handleNodeClick(event, node) {
    const currentTime = Date.now();
    const isDoubleClick = (currentTime - this.lastClickTime < this.config.doubleClickDelay) &&
                         (this.lastClickNode === node);

    if (isDoubleClick) {
      this.emit('nodeDoubleClick', { node, event });
    } else {
      this.emit('nodeClick', { node, event });
    }

    this.lastClickTime = currentTime;
    this.lastClickNode = node;
  }

  /**
   * Handle node mouse down for drag initiation
   * @param {Event} event - Mouse event
   * @param {Object} node - Node data
   */
  handleNodeMouseDown(event, node) {
    this.startDrag(event, node);
  }

  /**
   * Handle node mouse enter
   * @param {Event} event - Mouse event
   * @param {Object} node - Node data
   */
  handleNodeMouseEnter(event, node) {
    this.emit('nodeMouseEnter', { node, event });
  }

  /**
   * Handle node mouse leave
   * @param {Event} event - Mouse event
   * @param {Object} node - Node data
   */
  handleNodeMouseLeave(event, node) {
    this.emit('nodeMouseLeave', { node, event });
  }

  /**
   * Handle link click events
   * @param {Event} event - Mouse event
   * @param {Object} link - Link data
   */
  handleLinkClick(event, link) {
    this.emit('linkClick', { link, event });
  }

  /**
   * Handle link mouse enter
   * @param {Event} event - Mouse event
   * @param {Object} link - Link data
   */
  handleLinkMouseEnter(event, link) {
    this.emit('linkMouseEnter', { link, event });
  }

  /**
   * Handle link mouse leave
   * @param {Event} event - Mouse event
   * @param {Object} link - Link data
   */
  handleLinkMouseLeave(event, link) {
    this.emit('linkMouseLeave', { link, event });
  }

  /**
   * Start drag operation
   * @param {Event} event - Mouse event
   * @param {Object} node - Node being dragged
   */
  startDrag(event, node) {
    this.draggedNode = node;
    this.isDragging = false; // Will become true if mouse moves beyond threshold
    this.dragStartPos = this.coordinateTransform.eventToGraph(event, this.svgElement.node());
    
    // Prevent default to avoid text selection
    event.preventDefault();
  }

  /**
   * Handle drag movement
   * @param {Event} event - Mouse event
   */
  handleDragMove(event) {
    if (!this.draggedNode) return;

    const currentPos = this.coordinateTransform.eventToGraph(event, this.svgElement.node());
    
    if (!this.isDragging) {
      // Check if we've moved beyond the drag threshold
      const distance = this.coordinateTransform.calculateDistance(this.dragStartPos, currentPos);
      if (distance > this.config.dragThreshold) {
        this.isDragging = true;
        this.emit('dragStart', { node: this.draggedNode, event });
      }
    }

    if (this.isDragging) {
      // Update node position
      this.draggedNode.fx = currentPos.x;
      this.draggedNode.fy = currentPos.y;
      
      this.emit('dragMove', { 
        node: this.draggedNode, 
        position: currentPos, 
        event 
      });
    }
  }

  /**
   * End drag operation
   */
  endDrag() {
    if (this.draggedNode) {
      if (this.isDragging) {
        this.emit('dragEnd', { node: this.draggedNode });
      }
      
      // Optionally release the node's fixed position
      // this.draggedNode.fx = null;
      // this.draggedNode.fy = null;
    }

    this.draggedNode = null;
    this.isDragging = false;
    this.dragStartPos = null;
  }

  /**
   * Find node at a specific position
   * @param {Object} position - {x, y} position in graph coordinates
   * @returns {Object|null} - Node at position or null
   */
  findNodeAtPosition(position) {
    const clickRadius = this.config.clickRadius;
    
    for (const node of this.nodes) {
      if (node.x !== undefined && node.y !== undefined) {
        const distance = this.coordinateTransform.calculateDistance(position, node);
        const nodeRadius = (node.size || 10) + clickRadius;
        
        if (distance <= nodeRadius) {
          return node;
        }
      }
    }
    
    return null;
  }

  /**
   * Update continuous hover effects based on mouse position
   * @param {Object} mousePosition - {x, y} mouse position in graph coordinates
   */
  updateContinuousHoverEffects(mousePosition) {
    // Find the closest node within hover radius
    let closestNode = null;
    let closestDistance = Infinity;

    this.nodes.forEach(node => {
      if (node.x !== undefined && node.y !== undefined) {
        const distance = this.coordinateTransform.calculateDistance(node, mousePosition);
        const nodeRadius = (node.size || 10);
        
        // Prioritize nodes that the mouse is directly over
        const isDirectlyOver = distance <= nodeRadius;
        
        if (isDirectlyOver && distance < closestDistance) {
          closestNode = node;
          closestDistance = distance;
        } else if (!closestNode && distance <= this.config.hoverRadius) {
          closestNode = node;
          closestDistance = distance;
        }
      }
    });

    if (closestNode !== this.hoveredNode) {
      if (this.hoveredNode) {
        this.emit('nodeHoverEnd', { node: this.hoveredNode });
      }
      
      this.hoveredNode = closestNode;
      
      if (this.hoveredNode) {
        this.emit('nodeHoverStart', { node: this.hoveredNode, distance: closestDistance });
      }
    }

    if (closestNode) {
      this.emit('nodeHover', { 
        node: closestNode, 
        distance: closestDistance, 
        mousePosition 
      });
    } else {
      this.emit('noHover', { mousePosition });
    }
  }

  /**
   * Reset all hover effects
   */
  resetHoverEffects() {
    if (this.hoveredNode) {
      this.emit('nodeHoverEnd', { node: this.hoveredNode });
      this.hoveredNode = null;
    }
    
    this.emit('hoverReset');
  }

  /**
   * Enable or disable node dragging
   * @param {boolean} enabled - Whether dragging should be enabled
   */
  setDragEnabled(enabled) {
    this.config.dragEnabled = enabled;
  }

  /**
   * Enable or disable hover effects
   * @param {boolean} enabled - Whether hover effects should be enabled
   */
  setHoverEnabled(enabled) {
    this.config.hoverEnabled = enabled;
    if (!enabled) {
      this.resetHoverEffects();
    }
  }

  /**
   * Update configuration
   * @param {Object} newConfig - Configuration updates
   */
  updateConfig(newConfig) {
    Object.assign(this.config, newConfig);
  }

  /**
   * Get interaction statistics
   * @returns {Object} - Interaction state information
   */
  getStats() {
    return {
      hoveredNode: this.hoveredNode ? this.hoveredNode.id : null,
      isDragging: this.isDragging,
      draggedNode: this.draggedNode ? this.draggedNode.id : null,
      isInLayerMode: this.isInLayerMode,
      config: { ...this.config }
    };
  }

  /**
   * Programmatically trigger hover on a specific node
   * @param {string} nodeId - ID of node to hover
   */
  hoverNode(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (node && node !== this.hoveredNode) {
      if (this.hoveredNode) {
        this.emit('nodeHoverEnd', { node: this.hoveredNode });
      }
      
      this.hoveredNode = node;
      this.emit('nodeHoverStart', { node, distance: 0 });
      this.emit('nodeHover', { node, distance: 0, mousePosition: node });
    }
  }

  /**
   * Clear programmatic hover
   */
  clearHover() {
    this.resetHoverEffects();
  }

  /**
   * Add event listener
   * @param {string} eventType - Type of event
   * @param {Function} callback - Callback function
   */
  on(eventType, callback) {
    if (!this.eventHandlers[eventType]) {
      this.eventHandlers[eventType] = [];
    }
    this.eventHandlers[eventType].push(callback);
    return this;
  }

  /**
   * Remove event listener
   * @param {string} eventType - Type of event
   * @param {Function} callback - Callback function to remove
   */
  off(eventType, callback) {
    if (this.eventHandlers[eventType]) {
      this.eventHandlers[eventType] = this.eventHandlers[eventType].filter(cb => cb !== callback);
    }
    return this;
  }

  /**
   * Emit event to all listeners
   * @param {string} eventType - Type of event
   * @param {Object} data - Event data
   */
  emit(eventType, data = {}) {
    if (this.eventHandlers[eventType]) {
      this.eventHandlers[eventType].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event handler for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Remove all event listeners and cleanup
   */
  destroy() {
    // Remove DOM event listeners
    if (this.svgElement) {
      Object.values(this.boundHandlers).forEach(handler => {
        this.svgElement.on(handler.name, null);
      });
    }

    // Clear node and link interactions
    if (this.nodeElements) {
      this.nodeElements.on('.interaction', null);
    }
    if (this.linkElements) {
      this.linkElements.on('.interaction', null);
    }

    // Clear state
    this.eventHandlers = {};
    this.hoveredNode = null;
    this.draggedNode = null;
    this.isDragging = false;
    this.nodes = [];
    this.links = [];
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = InteractionManager;
} else if (typeof window !== 'undefined') {
  window.InteractionManager = InteractionManager;
}// === src/core/MiniMapManager.js ===
/**
 * MiniMap Manager for Knowledge Graph Explorer
 * Handles the miniature overview map with viewport indicator and navigation
 */
class MiniMapManager {
  constructor(config = {}) {
    this.config = {
      width: 150,
      height: 120,
      padding: 10,
      position: 'bottom-left', // 'bottom-left', 'bottom-right', 'top-left', 'top-right'
      
      // Visual settings
      backgroundColor: '#f8f9faE6', // 90% opacity
      borderColor: '#2780e3',
      borderWidth: 1,
      borderRadius: 6,
      
      // Viewport indicator
      viewportColor: '#2780e3',
      viewportOpacity: 0.7,
      viewportStrokeWidth: 2,
      
      // Node/link styling in minimap
      nodeOpacity: 0.8,
      linkOpacity: 0.4,
      nodeMinSize: 1,
      nodeMaxSize: 3,
      linkStrokeWidth: 0.5,
      
      // Interaction
      clickToNavigate: true,
      showOnHover: false,
      
      ...config
    };

    // State
    this.nodes = [];
    this.links = [];
    this.isVisible = true;
    this.coordinateTransform = null;
    
    // Rendering state
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.bounds = null;
    
    // DOM elements
    this.container = null;
    this.containerElement = null;
    this.svg = null;
    this.mainGroup = null;
    this.linkGroup = null;
    this.nodeGroup = null;
    this.viewportIndicator = null;

    // Event handlers
    this.eventHandlers = {};
  }

  /**
   * Initialize minimap with parent container and coordinate transform
   * @param {Element} parentContainer - Parent DOM element
   * @param {CoordinateTransform} coordinateTransform - Coordinate transformation utility
   */
  initialize(parentContainer, coordinateTransform) {
    this.container = parentContainer;
    this.coordinateTransform = coordinateTransform;
    
    this.createMiniMapContainer();
    this.setupSVG();
    this.setupEventListeners();
  }

  /**
   * Create the minimap container element
   */
  createMiniMapContainer() {
    this.containerElement = document.createElement('div');
    this.containerElement.className = 'mini-map';
    this.containerElement.style.cssText = this.getContainerStyles();
    
    this.container.appendChild(this.containerElement);
  }

  /**
   * Get CSS styles for the container
   * @returns {string} - CSS style string
   */
  getContainerStyles() {
    const position = this.getPositionStyles();
    
    return `
      position: absolute;
      width: ${this.config.width}px;
      height: ${this.config.height}px;
      background-color: ${this.config.backgroundColor};
      border: ${this.config.borderWidth}px solid ${this.config.borderColor};
      border-radius: ${this.config.borderRadius}px;
      overflow: hidden;
      cursor: pointer;
      backdrop-filter: blur(5px);
      z-index: 10;
      ${position}
    `.replace(/\s+/g, ' ').trim();
  }

  /**
   * Get position styles based on configuration
   * @returns {string} - Position CSS
   */
  getPositionStyles() {
    const margin = 10;
    
    switch (this.config.position) {
      case 'top-left':
        return `top: ${margin}px; left: ${margin}px;`;
      case 'top-right':
        return `top: ${margin}px; right: ${margin}px;`;
      case 'bottom-right':
        return `bottom: ${margin}px; right: ${margin}px;`;
      case 'bottom-left':
      default:
        return `bottom: ${margin}px; left: ${margin}px;`;
    }
  }

  /**
   * Setup SVG and its groups
   */
  setupSVG() {
    this.svg = d3.select(this.containerElement)
      .append('svg')
      .attr('width', this.config.width)
      .attr('height', this.config.height);

    // Create groups for different elements
    this.mainGroup = this.svg.append('g').attr('class', 'mini-map-main');
    this.linkGroup = this.mainGroup.append('g').attr('class', 'mini-map-links');
    this.nodeGroup = this.mainGroup.append('g').attr('class', 'mini-map-nodes');
    
    // Create viewport indicator
    this.viewportIndicator = this.svg.append('rect')
      .attr('class', 'viewport-indicator')
      .attr('fill', 'none')
      .attr('stroke', this.config.viewportColor)
      .attr('stroke-width', this.config.viewportStrokeWidth)
      .attr('opacity', this.config.viewportOpacity);
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    if (this.config.clickToNavigate) {
      this.svg.on('click', (event) => {
        const [x, y] = d3.pointer(event);
        this.navigateToPosition(x, y);
      });
    }

    if (this.config.showOnHover) {
      this.containerElement.addEventListener('mouseenter', () => {
        this.show();
      });
      
      this.containerElement.addEventListener('mouseleave', () => {
        this.hide();
      });
    }
  }

  /**
   * Update data and refresh the minimap
   * @param {Array} nodes - Array of node objects
   * @param {Array} links - Array of link objects
   */
  updateData(nodes, links) {
    this.nodes = nodes || [];
    this.links = links || [];
    this.render();
  }

  /**
   * Calculate bounds of all nodes
   * @returns {Object|null} - Bounds object or null if no nodes
   */
  calculateBounds() {
    if (this.nodes.length === 0) return null;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    this.nodes.forEach(node => {
      if (node.x !== undefined && node.y !== undefined) {
        minX = Math.min(minX, node.x);
        maxX = Math.max(maxX, node.x);
        minY = Math.min(minY, node.y);
        maxY = Math.max(maxY, node.y);
      }
    });

    if (minX === Infinity) return null;

    return {
      minX, maxX, minY, maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    };
  }

  /**
   * Calculate scale and offset for fitting content
   */
  calculateTransform() {
    this.bounds = this.calculateBounds();
    if (!this.bounds) {
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      return;
    }

    const availableWidth = this.config.width - 2 * this.config.padding;
    const availableHeight = this.config.height - 2 * this.config.padding;

    const scaleX = availableWidth / this.bounds.width;
    const scaleY = availableHeight / this.bounds.height;
    this.scale = Math.min(scaleX, scaleY, 0.3); // Max scale to prevent too much zoom

    this.offsetX = (this.config.width - this.bounds.width * this.scale) / 2 - this.bounds.minX * this.scale;
    this.offsetY = (this.config.height - this.bounds.height * this.scale) / 2 - this.bounds.minY * this.scale;
  }

  /**
   * Render the minimap
   */
  render() {
    this.calculateTransform();
    this.renderLinks();
    this.renderNodes();
    this.updateViewportIndicator();
  }

  /**
   * Render links in the minimap
   */
  renderLinks() {
    if (!this.bounds) return;

    const linkSelection = this.linkGroup
      .selectAll('line')
      .data(this.links, d => d.id || `${d.source}-${d.target}`);

    linkSelection.exit().remove();

    linkSelection.enter()
      .append('line')
      .attr('stroke', this.config.borderColor)
      .attr('stroke-width', this.config.linkStrokeWidth)
      .attr('stroke-opacity', this.config.linkOpacity)
      .merge(linkSelection)
      .attr('x1', d => {
        const sourceNode = this.nodes.find(n => n.id === (typeof d.source === 'object' ? d.source.id : d.source));
        return this.offsetX + (sourceNode ? sourceNode.x : 0) * this.scale;
      })
      .attr('y1', d => {
        const sourceNode = this.nodes.find(n => n.id === (typeof d.source === 'object' ? d.source.id : d.source));
        return this.offsetY + (sourceNode ? sourceNode.y : 0) * this.scale;
      })
      .attr('x2', d => {
        const targetNode = this.nodes.find(n => n.id === (typeof d.target === 'object' ? d.target.id : d.target));
        return this.offsetX + (targetNode ? targetNode.x : 0) * this.scale;
      })
      .attr('y2', d => {
        const targetNode = this.nodes.find(n => n.id === (typeof d.target === 'object' ? d.target.id : d.target));
        return this.offsetY + (targetNode ? targetNode.y : 0) * this.scale;
      });
  }

  /**
   * Render nodes in the minimap
   */
  renderNodes() {
    if (!this.bounds) return;

    const nodeSelection = this.nodeGroup
      .selectAll('circle')
      .data(this.nodes, d => d.id);

    nodeSelection.exit().remove();

    nodeSelection.enter()
      .append('circle')
      .attr('stroke', 'none')
      .attr('opacity', this.config.nodeOpacity)
      .merge(nodeSelection)
      .attr('cx', d => this.offsetX + d.x * this.scale)
      .attr('cy', d => this.offsetY + d.y * this.scale)
      .attr('r', d => this.getNodeRadius(d))
      .attr('fill', d => this.getNodeColor(d));
  }

  /**
   * Get node radius for minimap
   * @param {Object} node - Node object
   * @returns {number} - Radius value
   */
  getNodeRadius(node) {
    const baseRadius = (node.size || 10) / 10; // Normalize
    return Math.max(
      this.config.nodeMinSize,
      Math.min(this.config.nodeMaxSize, baseRadius)
    );
  }

  /**
   * Get node color (can be overridden for custom coloring)
   * @param {Object} node - Node object
   * @returns {string} - Color value
   */
  getNodeColor(node) {
    // Default color scheme - can be customized
    const colorMap = {
      'education': '#2780e3',
      'research': '#3fb618',
      'industry': '#ffdd3c',
      'current': '#ff0039',
      'geographic': '#613d7c'
    };
    
    return colorMap[node.type] || colorMap[node.layer] || this.config.borderColor;
  }

  /**
   * Update viewport indicator based on current zoom/pan
   */
  updateViewportIndicator() {
    if (!this.coordinateTransform || !this.bounds) return;

    const transform = this.coordinateTransform.getTransform();
    const viewport = this.coordinateTransform.getVisibleBounds();

    // Calculate viewport rectangle in minimap coordinates
    const viewportWidth = viewport.width * this.scale;
    const viewportHeight = viewport.height * this.scale;
    
    const viewportX = this.offsetX + (viewport.minX - this.bounds.minX) * this.scale;
    const viewportY = this.offsetY + (viewport.minY - this.bounds.minY) * this.scale;

    // Clamp to minimap boundaries
    const clampedX = Math.max(0, Math.min(this.config.width - viewportWidth, viewportX));
    const clampedY = Math.max(0, Math.min(this.config.height - viewportHeight, viewportY));
    const clampedWidth = Math.min(viewportWidth, this.config.width - clampedX);
    const clampedHeight = Math.min(viewportHeight, this.config.height - clampedY);

    this.viewportIndicator
      .attr('x', clampedX)
      .attr('y', clampedY)
      .attr('width', Math.max(1, clampedWidth))
      .attr('height', Math.max(1, clampedHeight));
  }

  /**
   * Navigate to a position clicked in the minimap
   * @param {number} miniX - X coordinate in minimap
   * @param {number} miniY - Y coordinate in minimap
   */
  navigateToPosition(miniX, miniY) {
    if (!this.coordinateTransform || !this.bounds) return;

    // Convert minimap coordinates to graph coordinates
    const graphX = (miniX - this.offsetX) / this.scale + this.bounds.minX;
    const graphY = (miniY - this.offsetY) / this.scale + this.bounds.minY;

    this.emit('navigate', { 
      graphPosition: { x: graphX, y: graphY },
      miniMapPosition: { x: miniX, y: miniY }
    });
  }

  /**
   * Set minimap position
   * @param {string} position - Position string
   */
  setPosition(position) {
    this.config.position = position;
    if (this.containerElement) {
      const positionStyles = this.getPositionStyles();
      this.containerElement.style.cssText = this.getContainerStyles();
    }
  }

  /**
   * Show the minimap
   */
  show() {
    this.isVisible = true;
    if (this.containerElement) {
      this.containerElement.style.display = 'block';
    }
  }

  /**
   * Hide the minimap
   */
  hide() {
    this.isVisible = false;
    if (this.containerElement) {
      this.containerElement.style.display = 'none';
    }
  }

  /**
   * Toggle minimap visibility
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Update minimap size
   * @param {number} width - New width
   * @param {number} height - New height
   */
  resize(width, height) {
    this.config.width = width;
    this.config.height = height;
    
    if (this.containerElement) {
      this.containerElement.style.width = width + 'px';
      this.containerElement.style.height = height + 'px';
    }
    
    if (this.svg) {
      this.svg.attr('width', width).attr('height', height);
    }
    
    this.render();
  }

  /**
   * Update configuration
   * @param {Object} newConfig - Configuration updates
   */
  updateConfig(newConfig) {
    Object.assign(this.config, newConfig);
    
    if (this.containerElement) {
      this.containerElement.style.cssText = this.getContainerStyles();
    }
    
    this.render();
  }

  /**
   * Get minimap statistics
   * @returns {Object} - Minimap state information
   */
  getStats() {
    return {
      isVisible: this.isVisible,
      position: this.config.position,
      dimensions: {
        width: this.config.width,
        height: this.config.height
      },
      bounds: this.bounds,
      transform: {
        scale: this.scale,
        offsetX: this.offsetX,
        offsetY: this.offsetY
      },
      nodeCount: this.nodes.length,
      linkCount: this.links.length
    };
  }

  /**
   * Focus on a specific node in the minimap
   * @param {string} nodeId - Node ID to focus on
   */
  focusNode(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (node && node.x !== undefined && node.y !== undefined) {
      this.navigateToPosition(
        this.offsetX + node.x * this.scale,
        this.offsetY + node.y * this.scale
      );
    }
  }

  /**
   * Highlight specific nodes in the minimap
   * @param {Array} nodeIds - Array of node IDs to highlight
   * @param {Object} highlightConfig - Highlight configuration
   */
  highlightNodes(nodeIds, highlightConfig = {}) {
    const config = {
      color: '#ff0039',
      strokeWidth: 2,
      ...highlightConfig
    };

    const highlightSet = new Set(nodeIds);
    
    this.nodeGroup.selectAll('circle')
      .attr('stroke', d => highlightSet.has(d.id) ? config.color : 'none')
      .attr('stroke-width', d => highlightSet.has(d.id) ? config.strokeWidth : 0);
  }

  /**
   * Clear all highlights
   */
  clearHighlights() {
    this.nodeGroup.selectAll('circle')
      .attr('stroke', 'none')
      .attr('stroke-width', 0);
  }

  /**
   * Add event listener
   * @param {string} eventType - Type of event
   * @param {Function} callback - Callback function
   */
  on(eventType, callback) {
    if (!this.eventHandlers[eventType]) {
      this.eventHandlers[eventType] = [];
    }
    this.eventHandlers[eventType].push(callback);
    return this;
  }

  /**
   * Remove event listener
   * @param {string} eventType - Type of event
   * @param {Function} callback - Callback function to remove
   */
  off(eventType, callback) {
    if (this.eventHandlers[eventType]) {
      this.eventHandlers[eventType] = this.eventHandlers[eventType].filter(cb => cb !== callback);
    }
    return this;
  }

  /**
   * Emit event to all listeners
   * @param {string} eventType - Type of event
   * @param {Object} data - Event data
   */
  emit(eventType, data = {}) {
    if (this.eventHandlers[eventType]) {
      this.eventHandlers[eventType].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in minimap event handler for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Cleanup and destroy the minimap
   */
  destroy() {
    // Remove DOM elements
    if (this.containerElement && this.container) {
      this.container.removeChild(this.containerElement);
    }

    // Clear references
    this.eventHandlers = {};
    this.nodes = [];
    this.links = [];
    this.containerElement = null;
    this.svg = null;
    this.coordinateTransform = null;
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MiniMapManager;
} else if (typeof window !== 'undefined') {
  window.MiniMapManager = MiniMapManager;
}// === src/core/VisualEffectsManager.js ===
/**
 * Visual Effects Manager for Knowledge Graph Explorer
 * Handles 3D-style hover effects, layer transitions, audience filtering, and visual state management
 */
class VisualEffectsManager {
  constructor(config = {}) {
    this.config = {
      // Hover effect settings
      hoverRadius: 50,
      maxHoverScale: 1.3,
      hoverTransitionDuration: 100,
      
      // Layer effect settings
      layerTransitionDuration: 400,
      
      // Audience effect settings
      audienceTransitionDuration: 300,
      audienceBlurAmount: 2,
      audienceOpacityReduced: 0.3,
      
      // Distance-based scaling
      distanceScaling: {
        distance1: 0.9,
        distance2: 0.7,
        distance3: 0.5,
        distanceOther: 0.3
      },
      
      // Layer mode scaling
      layerScaling: {
        activeLayer: 1.0,
        connectedNodes: {
          distance1: 0.7,
          distance2: 0.5,
          distanceOther: 0.3
        },
        disconnectedNodes: 0.5  // Changed from 0.2 to 0.5 for less dramatic zoom out
      },
      
      // Theme settings
      theme: {
        fontSizeBase: 12,
        fontSizeSmall: 10,
        fontSizeLarge: 14,
        defaultOpacity: 1.0,
        dimmedOpacity: 0.6,
        baseStrokeWidth: 2
      },
      
      ...config
    };

    // State
    this.nodes = [];
    this.links = [];
    this.nodeDistances = new Map();
    this.isInLayerMode = false;
    this.isInAudienceMode = false;
    this.currentLayer = null;
    this.currentAudience = 'current_focus';
    this.hoveredNode = null;
    this.selectedNode = null;
    this.selectedNodeRelated = new Set();

    // DOM element references
    this.nodeElements = null;
    this.linkElements = null;
    this.labelElements = null;
  }

  /**
   * Initialize with DOM elements
   * @param {Object} elements - Object containing D3 selections
   */
  initialize(elements) {
    this.nodeElements = elements.nodes;
    this.linkElements = elements.links;
    this.labelElements = elements.labels;
  }

  /**
   * Update data references
   * @param {Array} nodes - Array of node objects
   * @param {Array} links - Array of link objects
   */
  updateData(nodes, links) {
    this.nodes = nodes || [];
    this.links = links || [];
    this.nodeDistances.clear();
  }

  /**
   * Calculate graph distance between two nodes using BFS
   * @param {string} sourceId - Source node ID
   * @param {string} targetId - Target node ID
   * @returns {number} - Graph distance (hops between nodes)
   */
  calculateGraphDistance(sourceId, targetId) {
    if (sourceId === targetId) return 0;
    
    const cacheKey = `${sourceId}-${targetId}`;
    if (this.nodeDistances.has(cacheKey)) {
      return this.nodeDistances.get(cacheKey);
    }
    
    // Build adjacency list
    const adjacencyList = new Map();
    this.nodes.forEach(node => adjacencyList.set(node.id, []));
    
    this.links.forEach(link => {
      const sourceNodeId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetNodeId = typeof link.target === 'object' ? link.target.id : link.target;
      
      if (adjacencyList.has(sourceNodeId) && adjacencyList.has(targetNodeId)) {
        adjacencyList.get(sourceNodeId).push(targetNodeId);
        adjacencyList.get(targetNodeId).push(sourceNodeId);
      }
    });
    
    // BFS to find shortest path
    const queue = [{ nodeId: sourceId, distance: 0 }];
    const visited = new Set([sourceId]);
    
    while (queue.length > 0) {
      const { nodeId, distance } = queue.shift();
      
      if (nodeId === targetId) {
        this.nodeDistances.set(cacheKey, distance);
        this.nodeDistances.set(`${targetId}-${sourceId}`, distance);
        return distance;
      }
      
      const neighbors = adjacencyList.get(nodeId) || [];
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push({ nodeId: neighborId, distance: distance + 1 });
        }
      }
    }
    
    // No path found
    const maxDistance = 999;
    this.nodeDistances.set(cacheKey, maxDistance);
    this.nodeDistances.set(`${targetId}-${sourceId}`, maxDistance);
    return maxDistance;
  }

  /**
   * Apply continuous hover effects (Mac dock style)
   * @param {Object} centerNode - Node being hovered
   * @param {number} centerDistance - Distance from mouse to center node
   * @param {Object} mousePosition - Mouse position in graph coordinates
   */
  applyContinuousHoverEffects(centerNode, centerDistance, mousePosition) {
    if (this.isInLayerMode || this.isInAudienceMode) return;

    const nodeEffects = this.nodes.map(node => {
      let scaleFactor, opacityFactor;
    
      if (node.id === centerNode.id) {
        // Center node scales based on mouse proximity
        const proximityFactor = Math.max(0, 1 - centerDistance / this.config.hoverRadius);
        scaleFactor = 1 + (this.config.maxHoverScale - 1) * proximityFactor;
        opacityFactor = 1.0;
      } else {
        // Other nodes scale based on graph distance from center node
        const graphDistance = this.calculateGraphDistance(centerNode.id, node.id);
        const proximityFactor = Math.max(0, 1 - centerDistance / this.config.hoverRadius);
      
        let baseScale = this.getDistanceBasedScale(graphDistance);
      
        // Apply proximity-based scaling
        scaleFactor = baseScale + (1 - baseScale) * (1 - proximityFactor);
        opacityFactor = baseScale + (1 - baseScale) * (1 - proximityFactor);
      }
    
      return {
        nodeId: node.id,
        scaleFactor,
        opacityFactor
      };
    });
  
    this.applyNodeTransitions(nodeEffects, this.config.hoverTransitionDuration);
  }

  /**
   * Get scale factor based on graph distance
   * @param {number} distance - Graph distance
   * @returns {number} - Scale factor
   */
  getDistanceBasedScale(distance) {
    const scaling = this.config.distanceScaling;
    if (distance === 1) return scaling.distance1;
    if (distance === 2) return scaling.distance2;
    if (distance === 3) return scaling.distance3;
    return scaling.distanceOther;
  }

  /**
   * Reset all hover effects to normal state
   */
  resetHoverEffects() {
    if (this.isInLayerMode || this.isInAudienceMode) {
      // Don't reset if in layer or audience mode - other effects take precedence
      return;
    }

    this.resetToNormalState();
  }

  /**
   * Set selected node information for visual effects
   * @param {Object|null} selectedNode - Selected node or null
   * @param {Set} selectedNodeRelated - Set of related node IDs
   */
  setSelectedNode(selectedNode, selectedNodeRelated) {
    this.selectedNode = selectedNode;
    this.selectedNodeRelated = selectedNodeRelated || new Set();
  }

  /**
   * Apply audience-based visual effects (blur non-relevant nodes)
   * @param {string} audienceId - Current audience filter
   * @param {Array} nodes - Array of node objects
   */
  applyAudienceEffects(audienceId, nodes) {
    this.currentAudience = audienceId;
    this.isInAudienceMode = true;

    if (!this.nodeElements) return;
    
    // Apply blur and opacity effects based on audience relevance
    this.nodeElements
      .transition()
      .duration(this.config.audienceTransitionDuration)
      .style('filter', d => {
        // If this node is related to the selected node, never blur it
        if (this.selectedNode && this.selectedNodeRelated.has(d.id)) {
          return 'none';
        }

        // Handle audience as array or string
        let nodeAudience = d.audience || ['general'];
        if (typeof nodeAudience === 'string') {
          nodeAudience = [nodeAudience];
        }
        return nodeAudience.includes(audienceId) ? 'none' : `blur(${this.config.audienceBlurAmount}px)`;
      })
      .style('opacity', d => {
        // If this node is related to the selected node, full opacity
        if (this.selectedNode && this.selectedNodeRelated.has(d.id)) {
          return this.config.theme.defaultOpacity;
        }

        // Handle audience as array or string
        let nodeAudience = d.audience || ['general'];
        if (typeof nodeAudience === 'string') {
          nodeAudience = [nodeAudience];
        }
        return nodeAudience.includes(audienceId) ? this.config.theme.defaultOpacity : this.config.audienceOpacityReduced;
      });
    
    // Link visibility is now managed by KnowledgeGraphExplorer.updateLinkVisibility()
    // based on label visibility rather than audience relevance
  }

  /**
   * Reset all visual effects to normal state
   */
  resetToNormalState() {
    if (this.nodeElements) {
      this.nodeElements
        .transition()
        .duration(200)
        .ease(d3.easeQuadOut)
        .attr('r', d => d.size || 10)
        .attr('opacity', this.config.theme.defaultOpacity)
        .style('filter', 'none');
    }
    
    if (this.labelElements) {
      this.labelElements
        .transition()
        .duration(200)
        .ease(d3.easeQuadOut)
        .style('font-size', this.config.theme.fontSizeBase + 'px')
        .attr('opacity', this.config.theme.defaultOpacity);
    }
    
    if (this.linkElements) {
      this.linkElements
        .transition()
        .duration(200)
        .ease(d3.easeQuadOut)
        .attr('opacity', this.config.theme.dimmedOpacity)
        .attr('stroke-width', d => Math.sqrt(d.strength || 0.5) * this.config.theme.baseStrokeWidth)
        .style('filter', 'none');
    }
  }

  /**
   * Apply layer-based visual effects
   * @param {string} activeLayer - ID of the active layer
   */
  applyLayerEffects(activeLayer) {
    this.currentLayer = activeLayer;
    this.isInLayerMode = activeLayer !== null;
    
    if (!this.isInLayerMode) {
      // If no audience mode is active, reset to normal state
      if (!this.isInAudienceMode) {
        this.resetToNormalState();
      }
      return;
    }

    const nodeLayerEffects = this.nodes.map(node => {
      const isActiveLayer = node.layer === activeLayer;
      const hasActiveConnection = this.hasConnectionToActiveLayer(node, activeLayer);
      
      let scaleFactor, opacityFactor;
      
      if (isActiveLayer) {
        scaleFactor = this.config.layerScaling.activeLayer;
        opacityFactor = this.config.layerScaling.activeLayer;
      } else if (hasActiveConnection) {
        const distance = this.getMinDistanceToActiveLayer(node, activeLayer);
        const connectedScaling = this.config.layerScaling.connectedNodes;
        
        if (distance === 1) {
          scaleFactor = connectedScaling.distance1;
          opacityFactor = connectedScaling.distance1;
        } else if (distance === 2) {
          scaleFactor = connectedScaling.distance2;
          opacityFactor = connectedScaling.distance2;
        } else {
          scaleFactor = connectedScaling.distanceOther;
          opacityFactor = connectedScaling.distanceOther;
        }
      } else {
        scaleFactor = this.config.layerScaling.disconnectedNodes;
        opacityFactor = this.config.layerScaling.disconnectedNodes;
      }
      
      return {
        nodeId: node.id,
        scaleFactor,
        opacityFactor,
        isActiveLayer
      };
    });
    
    this.applyLayerTransitions(nodeLayerEffects);
  }

  /**
   * Check if node has connection to active layer
   * @param {Object} node - Node to check
   * @param {string} activeLayer - Active layer ID
   * @returns {boolean} - Whether node connects to active layer
   */
  hasConnectionToActiveLayer(node, activeLayer) {
    return this.links.some(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      
      if (node.id === sourceId) {
        const targetNode = this.nodes.find(n => n.id === targetId);
        return targetNode && targetNode.layer === activeLayer;
      } else if (node.id === targetId) {
        const sourceNode = this.nodes.find(n => n.id === sourceId);
        return sourceNode && sourceNode.layer === activeLayer;
      }
      
      return false;
    });
  }

  /**
   * Get minimum distance to any node in active layer
   * @param {Object} node - Node to check
   * @param {string} activeLayer - Active layer ID
   * @returns {number} - Minimum distance to active layer
   */
  getMinDistanceToActiveLayer(node, activeLayer) {
    const activeLayerNodes = this.nodes.filter(n => n.layer === activeLayer);
    let minDistance = 999;
    
    for (const activeNode of activeLayerNodes) {
      const distance = this.calculateGraphDistance(node.id, activeNode.id);
      minDistance = Math.min(minDistance, distance);
    }
    
    return minDistance;
  }

  /**
   * Apply node transitions for hover effects
   * @param {Array} nodeEffects - Array of effect objects
   * @param {number} duration - Transition duration in ms
   */
  applyNodeTransitions(nodeEffects, duration = 250) {
    const effectsMap = new Map();
    nodeEffects.forEach(effect => {
      effectsMap.set(effect.nodeId, effect);
    });
    
    if (this.nodeElements) {
      this.nodeElements
        .transition()
        .duration(duration)
        .ease(d3.easeQuadOut)
        .attr('r', d => {
          const effect = effectsMap.get(d.id);
          return (d.size || 10) * (effect ? effect.scaleFactor : 1);
        })
        .attr('opacity', d => {
          const effect = effectsMap.get(d.id);
          return effect ? effect.opacityFactor : this.config.theme.defaultOpacity;
        });
    }
    
    if (this.labelElements) {
      this.labelElements
        .transition()
        .duration(duration)
        .ease(d3.easeQuadOut)
        .style('font-size', d => {
          const effect = effectsMap.get(d.id);
          const baseFontSize = this.config.theme.fontSizeBase;
          return `${baseFontSize * (effect ? effect.scaleFactor : 1)}px`;
        })
        .attr('opacity', d => {
          const effect = effectsMap.get(d.id);
          return effect ? effect.opacityFactor : this.config.theme.defaultOpacity;
        });
    }
    
    if (this.linkElements) {
      this.linkElements
        .transition()
        .duration(duration)
        .ease(d3.easeQuadOut)
        .attr('opacity', d => {
          const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
          const targetId = typeof d.target === 'object' ? d.target.id : d.target;
          
          const sourceEffect = effectsMap.get(sourceId);
          const targetEffect = effectsMap.get(targetId);
          
          const sourceOpacity = sourceEffect ? sourceEffect.opacityFactor : this.config.theme.defaultOpacity;
          const targetOpacity = targetEffect ? targetEffect.opacityFactor : this.config.theme.defaultOpacity;
          
          return Math.min(sourceOpacity, targetOpacity) * this.config.theme.dimmedOpacity;
        });
    }
  }

  /**
   * Apply layer transitions with longer duration and different easing
   * @param {Array} nodeLayerEffects - Array of layer effect objects
   */
  applyLayerTransitions(nodeLayerEffects) {
    const effectsMap = new Map();
    nodeLayerEffects.forEach(effect => {
      effectsMap.set(effect.nodeId, effect);
    });
    
    if (this.nodeElements) {
      this.nodeElements
        .transition()
        .duration(this.config.layerTransitionDuration)
        .ease(d3.easeQuadInOut)
        .attr('r', d => {
          const effect = effectsMap.get(d.id);
          return (d.size || 10) * (effect ? effect.scaleFactor : 1);
        })
        .attr('opacity', d => {
          const effect = effectsMap.get(d.id);
          return effect ? effect.opacityFactor : this.config.theme.defaultOpacity;
        });
    }
    
    if (this.labelElements) {
      this.labelElements
        .transition()
        .duration(this.config.layerTransitionDuration)
        .ease(d3.easeQuadInOut)
        .style('font-size', d => {
          const effect = effectsMap.get(d.id);
          const baseFontSize = this.config.theme.fontSizeBase;
          return `${baseFontSize * (effect ? effect.scaleFactor : 1)}px`;
        })
        .attr('opacity', d => {
          const effect = effectsMap.get(d.id);
          return effect ? effect.opacityFactor : this.config.theme.defaultOpacity;
        });
    }
    
    if (this.linkElements) {
      this.linkElements
        .transition()
        .duration(this.config.layerTransitionDuration)
        .ease(d3.easeQuadInOut)
        .attr('opacity', d => {
          const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
          const targetId = typeof d.target === 'object' ? d.target.id : d.target;
          
          const sourceEffect = effectsMap.get(sourceId);
          const targetEffect = effectsMap.get(targetId);
          
          const sourceOpacity = sourceEffect ? sourceEffect.opacityFactor : this.config.theme.defaultOpacity;
          const targetOpacity = targetEffect ? targetEffect.opacityFactor : this.config.theme.defaultOpacity;
          
          return Math.min(sourceOpacity, targetOpacity) * this.config.theme.dimmedOpacity;
        })
        .attr('stroke-width', d => {
          const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
          const targetId = typeof d.target === 'object' ? d.target.id : d.target;
          
          const sourceEffect = effectsMap.get(sourceId);
          const targetEffect = effectsMap.get(targetId);
          
          const baseWidth = Math.sqrt(d.strength || 0.5) * this.config.theme.baseStrokeWidth;
          const sourceScale = sourceEffect ? sourceEffect.scaleFactor : 1;
          const targetScale = targetEffect ? targetEffect.scaleFactor : 1;
          
          return baseWidth * Math.max(sourceScale, targetScale);
        });
    }
  }

  /**
   * Highlight specific nodes with special effects
   * @param {Array} nodeIds - Array of node IDs to highlight
   * @param {Object} highlightConfig - Highlight configuration
   */
  highlightNodes(nodeIds, highlightConfig = {}) {
    const config = {
      scaleFactor: 1.2,
      opacityFactor: 1.0,
      duration: 300,
      ...highlightConfig
    };

    const highlightSet = new Set(nodeIds);
    
    const nodeEffects = this.nodes.map(node => ({
      nodeId: node.id,
      scaleFactor: highlightSet.has(node.id) ? config.scaleFactor : 0.5,
      opacityFactor: highlightSet.has(node.id) ? config.opacityFactor : 0.3
    }));

    this.applyNodeTransitions(nodeEffects, config.duration);
  }

  /**
   * Create pulsing animation effect
   * @param {string} nodeId - Node ID to animate
   * @param {Object} pulseConfig - Pulse configuration
   */
  pulseNode(nodeId, pulseConfig = {}) {
    const config = {
      scaleFactor: 1.5,
      duration: 600,
      iterations: 3,
      ...pulseConfig
    };

    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const nodeElement = this.nodeElements ? this.nodeElements.filter(d => d.id === nodeId) : null;
    const labelElement = this.labelElements ? this.labelElements.filter(d => d.id === nodeId) : null;

    if (nodeElement && nodeElement.size() > 0) {
      const baseSize = node.size || 10;
      const baseFontSize = this.config.theme.fontSizeBase;

      // Create pulsing animation
      for (let i = 0; i < config.iterations; i++) {
        nodeElement
          .transition()
          .delay(i * config.duration)
          .duration(config.duration / 2)
          .ease(d3.easeQuadInOut)
          .attr('r', baseSize * config.scaleFactor)
          .transition()
          .duration(config.duration / 2)
          .ease(d3.easeQuadInOut)
          .attr('r', baseSize);

        if (labelElement && labelElement.size() > 0) {
          labelElement
            .transition()
            .delay(i * config.duration)
            .duration(config.duration / 2)
            .ease(d3.easeQuadInOut)
            .style('font-size', `${baseFontSize * config.scaleFactor}px`)
            .transition()
            .duration(config.duration / 2)
            .ease(d3.easeQuadInOut)
            .style('font-size', `${baseFontSize}px`);
        }
      }
    }
  }

  /**
   * Update configuration
   * @param {Object} newConfig - Configuration updates
   */
  updateConfig(newConfig) {
    Object.assign(this.config, newConfig);
  }

  /**
   * Get current visual state
   * @returns {Object} - Visual state information
   */
  getState() {
    return {
      isInLayerMode: this.isInLayerMode,
      isInAudienceMode: this.isInAudienceMode,
      currentLayer: this.currentLayer,
      currentAudience: this.currentAudience,
      hoveredNode: this.hoveredNode ? this.hoveredNode.id : null,
      nodeCount: this.nodes.length,
      linkCount: this.links.length,
      config: { ...this.config }
    };
  }

  /**
   * Clear distance cache (call when graph structure changes)
   */
  clearDistanceCache() {
    this.nodeDistances.clear();
  }

  /**
   * Cleanup and reset all effects
   */
  destroy() {
    this.resetToNormalState();
    this.nodeDistances.clear();
    this.nodes = [];
    this.links = [];
    this.hoveredNode = null;
    this.currentLayer = null;
    this.currentAudience = 'current_focus';
    this.isInLayerMode = false;
    this.isInAudienceMode = false;
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VisualEffectsManager;
} else if (typeof window !== 'undefined') {
  window.VisualEffectsManager = VisualEffectsManager;
}// === src/core/KnowledgeGraphExplorer.js ===
/**
 * Knowledge Graph Explorer - Main Orchestrating Class
 * Coordinates all modular components to create an interactive knowledge graph
 */
class KnowledgeGraphExplorer {
  constructor(container, data, config = {}) {
    this.container = typeof container === 'string' 
      ? document.querySelector(container) 
      : container;
    
    if (!this.container) {
      throw new Error('Container element not found');
    }

    // Validate data before proceeding
    this.validateAndProcessData(data);

    // Configuration with sensible defaults
    this.config = this.mergeConfigurations(config);
    
    // Initialize modular components
    this.components = {
      dataValidator: null,
      coordinateTransform: null,
      forceSimulation: null,
      interactionManager: null,
      visualEffectsManager: null,
      miniMapManager: null,
      labelLayoutManager: null
    };

    // State management
    this.state = {
      currentLayer: null,
      currentAudience: 'current_focus',
      isTimelineActive: false,
      currentTimelinePosition: null,
      selectedNode: null,
      selectedNodeRelated: new Set(),
      selectedNodeDistances: new Map(),
      isInitialized: false,
      isPanning: false
    };

    // Event handlers for external API
    this.eventHandlers = {};

    // Initialize the graph
    this.init();
  }

  /**
   * Generate links from parent_node relationships
   * @returns {Array} - Array of link objects
   */
  generateLinksFromParents() {
    const links = [];
    
    this.nodes.forEach(node => {
      if (node.parent_node && node.parent_node !== null) {
        // Find the parent node
        const parentNode = this.nodes.find(n => n.id === node.parent_node);
        if (parentNode) {
          links.push({
            source: node.parent_node,
            target: node.id,
            strength: 0.5, // Default strength
            id: `${node.parent_node}-${node.id}`
          });
        }
      }
    });
    
    return links;
  }

  /**
   * Validate and process input data
   * @param {Object} data - Input data with nodes
   */
  validateAndProcessData(data) {
    // Use DataValidator if available, otherwise basic validation
    if (typeof DataValidator !== 'undefined') {
      // Generate links for validation
      const tempNodes = data.nodes || [];
      const tempLinks = [];
      
      tempNodes.forEach(node => {
        if (node.parent_node && node.parent_node !== null) {
          tempLinks.push({
            source: node.parent_node,
            target: node.id
          });
        }
      });

      const dataForValidation = {
        nodes: [...tempNodes],
        links: tempLinks
      };
      
      const validation = DataValidator.validate(dataForValidation);
      if (!validation.isValid) {
        console.warn('Data validation warnings:', validation.errors);
        if (validation.errors.length > 0) {
          throw new Error(`Data validation failed: ${validation.errors[0]}`);
        }
      }
    } else {
      // Basic validation fallback
      if (!data || !data.nodes) {
        throw new Error('Data must contain nodes array');
      }
    }

    this.originalData = data;
    this.allNodes = [...data.nodes];
    this.nodes = [...data.nodes];
    
    // Generate links from parent relationships
    this.links = this.generateLinksFromParents();
    this.allLinks = [...this.links];
  }

  /**
   * Merge user configuration with defaults
   * @param {Object} userConfig - User-provided configuration
   * @returns {Object} - Merged configuration
   */
  mergeConfigurations(userConfig) {
    const defaultConfig = {
      // Container dimensions
      width: 900,
      height: 600,
      
      // Visual theme
      theme: {
        primaryColor: '#2780e3',
        secondaryColor: '#3fb618',
        accentColor: '#ffdd3c',
        dangerColor: '#ff0039',
        mutedColor: '#868e96',
        backgroundColor: '#ffffff',
        surfaceColor: '#f8f9fa',
        textPrimary: '#212529',
        textSecondary: '#495057',
        textMuted: '#868e96',
        borderColor: '#dee2e6',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontSizeBase: 14,
        fontSizeSmall: 12,
        fontSizeLarge: 16,
        borderRadius: 6,
        shadowColor: 'rgba(0, 0, 0, 0.15)'
      },

      // Node colors - completely configurable, no hardcoded categories
      nodeColors: {},
      
      // Layer configuration - user-defined
      layers: [],
      
      // Timeline configuration
      timeline: {
        enabled: true,
        start: null, // Auto-calculated if not provided
        end: null    // Auto-calculated if not provided
      },
      
      // Feature toggles
      features: {
        showMiniMap: true,
        showTimeline: true,
        showLegend: true,
        enableHover: true,
        enableDrag: true,
        enableLayerMode: true,
        clickToNavigate: true,
        smartLabelPositioning: true
      },

      // Label positioning configuration
      labelLayout: {
        enabled: true,
        preferredPositions: ['bottom', 'right', 'top', 'left'],
        maxDistance: 50,
        minDistance: 15,
        padding: 8,
        collisionIterations: 3,
        positioningIterations: 2,
        transitionDuration: 200
      },
      
      // Interaction settings
      interaction: {
        hoverRadius: 50,
        maxHoverScale: 1.3,
        clickRadius: 20,
        dragThreshold: 5
      },
      
      // Force simulation settings
      simulation: {
        linkDistance: 80,      // Reduced for compactness
        linkStrength: 0.5,     // Increased for stronger connections
        chargeStrength: -250,  // Reduced for less repulsion
        chargeDistanceMax: 300, // Shorter repulsion range
        collisionRadius: 15,   // Smaller collision radius
        centerStrength: 1.5    // Stronger center pull
      },
      
      // Visual effects settings
      effects: {
        hoverTransitionDuration: 100,
        layerTransitionDuration: 400,
        distanceScaling: {
          distance1: 0.9,
          distance2: 0.7,
          distance3: 0.5,
          distanceOther: 0.3
        }
      },
      
      // MiniMap settings
      miniMap: {
        width: 150,
        height: 120,
        position: 'bottom-left',
        padding: 10
      }
    };

    return this.deepMerge(defaultConfig, userConfig);
  }

  /**
   * Deep merge two objects
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   * @returns {Object} - Merged object
   */
  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * Initialize all components and setup the graph
   */
  init() {
    this.setupContainer();
    this.setupSVG();
    this.initializeComponents();
    this.setupEventBindings();
    this.render();
    this.startSimulation();

    // Apply initial audience filter to show current focus view by default
    this.setAudienceFilter('current_focus');

    this.state.isInitialized = true;

    this.emit('initialized', { config: this.config, state: this.state });
  }

  /**
   * Setup the container element
   */
  setupContainer() {
    this.container.innerHTML = '';
    this.container.style.position = 'relative';
    this.container.style.width = this.config.width + 'px';
    this.container.style.height = this.config.height + 'px';
    this.container.style.backgroundColor = this.config.theme.backgroundColor;
    this.container.style.overflow = 'hidden';
    this.container.style.borderRadius = this.config.theme.borderRadius + 'px';
    this.container.style.fontFamily = this.config.theme.fontFamily;
  }

  /**
   * Setup SVG and its groups
   */
  setupSVG() {
    this.svg = d3.select(this.container)
      .append('svg')
      .attr('width', this.config.width)
      .attr('height', this.config.height);

    this.mainGroup = this.svg.append('g').attr('class', 'main-group');
    this.linkGroup = this.mainGroup.append('g').attr('class', 'links');
    this.nodeGroup = this.mainGroup.append('g').attr('class', 'nodes');
    this.labelGroup = this.mainGroup.append('g').attr('class', 'labels');

    // Setup zoom behavior
    this.zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        this.handleZoom(event);
      });

    this.svg.call(this.zoom);
  }

  /**
   * Initialize all modular components
   */
  initializeComponents() {
    // Initialize coordinate transform
    this.components.coordinateTransform = new CoordinateTransform();
    this.components.coordinateTransform.updateViewport(this.config.width, this.config.height);

    // Initialize force simulation
    this.components.forceSimulation = new ForceSimulation(this.config.simulation);
    this.components.forceSimulation.updateDimensions(this.config.width, this.config.height);
    this.components.forceSimulation.onTickCallback(() => this.updatePositions());

    // Initialize visual effects manager
    this.components.visualEffectsManager = new VisualEffectsManager({
      ...this.config.effects,
      theme: this.config.theme
    });

    // Initialize interaction manager
    this.components.interactionManager = new InteractionManager({
      ...this.config.interaction,
      hoverEnabled: this.config.features.enableHover,
      dragEnabled: this.config.features.enableDrag
    });

    // Initialize minimap if enabled
    if (this.config.features.showMiniMap) {
      this.components.miniMapManager = new MiniMapManager({
        ...this.config.miniMap,
        backgroundColor: this.config.theme.surfaceColor + 'E6',
        borderColor: this.config.theme.primaryColor
      });
    }

    // Initialize label layout manager if smart positioning is enabled
    if (this.config.features.smartLabelPositioning) {
      this.components.labelLayoutManager = new LabelLayoutManager({
        ...this.config.labelLayout
      });
    }

    // Initialize UI controls manager
    this.components.uiControlsManager = new UIControlsManager({
      showTimeline: this.config.features.showTimeline,
      showLayerControls: this.config.features.showLayerControls,
      showAudienceControls: this.config.features.showAudienceControls,
      showNodeInfo: this.config.features.showNodeInfo,
      showMiniMap: this.config.features.showMiniMap
    });
  }

  /**
   * Setup event bindings between components
   */
  setupEventBindings() {
    // Interaction events
    if (this.components.interactionManager) {
      const elements = {
        svg: this.svg,
        nodes: this.nodeGroup.selectAll('.node'),
        links: this.linkGroup.selectAll('.link'),
        labels: this.labelGroup.selectAll('.label')
      };

      this.components.interactionManager.initialize(elements, this.components.coordinateTransform);
      this.components.interactionManager.updateData(this.nodes, this.links);

      // Bind interaction events
      this.components.interactionManager.on('nodeClick', (data) => {
        this.setSelectedNode(data.node);
        this.emit('nodeClick', data);
      });

      this.components.interactionManager.on('linkClick', (data) => {
        this.emit('linkClick', data);
      });

      this.components.interactionManager.on('backgroundClick', (data) => {
        this.setSelectedNode(null);
        this.emit('backgroundClick', data);
      });

      this.components.interactionManager.on('dockHover', (data) => {
        this.applyDockHoverEffects(data.mousePosition);
      });

      this.components.interactionManager.on('dockHoverReset', () => {
        this.resetDockHoverEffects();
      });

      this.components.interactionManager.on('nodeHover', (data) => {
        if (this.config.features.enableHover && this.components.visualEffectsManager) {
          this.components.visualEffectsManager.applyContinuousHoverEffects(
            data.node, data.distance, data.mousePosition
          );
        }
      });

      this.components.interactionManager.on('hoverReset', () => {
        if (this.components.visualEffectsManager) {
          this.components.visualEffectsManager.resetHoverEffects();
        }
      });

      this.components.interactionManager.on('dragStart', (data) => {
        this.emit('dragStart', data);
      });

      this.components.interactionManager.on('dragEnd', (data) => {
        this.emit('dragEnd', data);
      });
    }

    // Visual effects initialization
    if (this.components.visualEffectsManager) {
      const elements = {
        nodes: this.nodeGroup.selectAll('.node'),
        links: this.linkGroup.selectAll('.link'),
        labels: this.labelGroup.selectAll('.label')
      };
      this.components.visualEffectsManager.initialize(elements);
      this.components.visualEffectsManager.updateData(this.nodes, this.links);
    }

    // MiniMap initialization and events
    if (this.components.miniMapManager) {
      this.components.miniMapManager.initialize(this.container, this.components.coordinateTransform);
      this.components.miniMapManager.updateData(this.nodes, this.links);

      this.components.miniMapManager.on('navigate', (data) => {
        this.navigateToPosition(data.graphPosition);
      });
    }

    // UI Controls Manager initialization and events
    if (this.components.uiControlsManager) {
      const graphData = {
        layers: this.originalData.layers || [],
        timeline: this.originalData.timeline || {}
      };
      this.components.uiControlsManager.initialize(this.container, this, graphData);
    }

    // Label Layout Manager initialization
    if (this.components.labelLayoutManager) {
      // Will be initialized after rendering when label elements are available
    }
  }

  /**
   * Update text sizes based on zoom level with floor and ceiling constraints
   * @param {number} zoomScale - Current zoom scale factor
   */
  updateTextSizesForZoom(zoomScale) {
    if (!this.labelGroup) return;

    // Define base text size and constraints for screen appearance
    const baseTextSize = 14;    // Base font size in pixels at 1.0 zoom
    const minScreenSize = 10;   // Minimum visual size on screen (pixels)
    const maxScreenSize = 24;   // Maximum visual size on screen (pixels)

    // Calculate text size to maintain consistent screen appearance
    // Scale inversely with zoom so text appears constant size on screen
    const screenTargetSize = baseTextSize / zoomScale;

    // Apply floor and ceiling constraints
    const constrainedSize = Math.max(minScreenSize / zoomScale,
                                   Math.min(maxScreenSize / zoomScale, screenTargetSize));

    // Apply the text size to all labels
    this.labelGroup.selectAll('.label')
      .style('font-size', `${constrainedSize}px`);

    // Update label layout manager with new zoom scale
    if (this.components.labelLayoutManager) {
      this.components.labelLayoutManager.updateZoomScale(zoomScale);
    }
  }

  /**
   * Handle zoom events
   * @param {Object} event - D3 zoom event
   */
  handleZoom(event) {
    this.components.coordinateTransform.updateTransform(event.transform);
    this.mainGroup.attr('transform', event.transform);

    // Only update text sizes if we're not in a panning transition (prevents shaking)
    if (!this.state.isPanning) {
      this.updateTextSizesForZoom(event.transform.k);
    }

    if (this.components.miniMapManager) {
      this.components.miniMapManager.updateViewportIndicator();
    }

    this.emit('zoom', { transform: event.transform });
  }

  /**
   * Render all visual elements
   */
  render() {
    this.renderLinks();
    this.renderNodes();
    this.renderLabels();
    
    // Update component references
    this.updateComponentElements();
  }

  /**
   * Update component element references after rendering
   */
  updateComponentElements() {
    const elements = {
      nodes: this.nodeGroup.selectAll('.node'),
      links: this.linkGroup.selectAll('.link'),
      labels: this.labelGroup.selectAll('.label')
    };

    if (this.components.interactionManager) {
      this.components.interactionManager.nodeElements = elements.nodes;
      this.components.interactionManager.linkElements = elements.links;
      this.components.interactionManager.labelElements = elements.labels;
      this.components.interactionManager.setupNodeInteractions();
      this.components.interactionManager.setupLinkInteractions();
    }

    if (this.components.visualEffectsManager) {
      this.components.visualEffectsManager.nodeElements = elements.nodes;
      this.components.visualEffectsManager.linkElements = elements.links;
      this.components.visualEffectsManager.labelElements = elements.labels;
    }

    if (this.components.labelLayoutManager) {
      this.components.labelLayoutManager.initialize(this.nodes, elements.labels);
    }
  }

  /**
   * Render links
   */
  renderLinks() {
    const linkSelection = this.linkGroup
      .selectAll('.link')
      .data(this.links, d => d.id || `${d.source}-${d.target}`);

    linkSelection.exit().remove();

    linkSelection.enter()
      .append('line')
      .attr('class', 'link')
      .attr('stroke', this.config.theme.mutedColor)
      .attr('stroke-width', d => Math.sqrt(d.strength || 0.5) * 2)
      .style('opacity', 0) // Start with links hidden
      .style('pointer-events', 'none');
  }

  /**
   * Render nodes with experience-based styling
   */
  renderNodes() {
    const nodeSelection = this.nodeGroup
      .selectAll('.node')
      .data(this.nodes, d => d.id);
  
    nodeSelection.exit().remove();
  
    nodeSelection.enter()
      .append('circle')
      .attr('class', 'node')
      .attr('r', d => d.size || 10)
      .attr('fill', d => this.getNodeColor(d))
      .attr('stroke', d => this.getNodeStrokeColor(d))
      .attr('stroke-width', d => this.getNodeStrokeWidth(d))
      .style('cursor', 'pointer');
  }
  
  /**
   * Get node color based on configuration, with support for experience levels
   * @param {Object} node - Node object
   * @returns {string} - Color value
   */
  getNodeColor(node) {
    let baseColor;

    // Get base color from layer (primary), then type, then default
    if (node.layer && this.config.nodeColors[node.layer]) {
      baseColor = this.config.nodeColors[node.layer];
    } else if (node.type && this.config.nodeColors[node.type]) {
      baseColor = this.config.nodeColors[node.type];
    } else if (node.color) {
      baseColor = node.color;
    } else {
      baseColor = this.config.theme.primaryColor;
    }

    // Handle experience level - default to "experienced" if not specified
    const experienceLevel = node.experienceLevel || 'experienced';
    return this.adjustColorForExperience(baseColor, experienceLevel);
  }
  
  /**
   * Adjust color based on experience level
   * @param {string} baseColor - Base color (hex format)
   * @param {string} experienceLevel - 'experienced' or 'interested'
   * @returns {string} - Adjusted color
   */
  adjustColorForExperience(baseColor, experienceLevel) {
    if (experienceLevel === 'interested') {
      // Make color lighter/less saturated for interest-only
      return this.lightenColor(baseColor, 0.4); // 40% lighter
    }
    
    // For 'experienced' or any other value, return full saturation
    return baseColor;
  }
  
  /**
   * Lighten a hex color by a given factor
   * @param {string} color - Hex color (e.g., "#2780e3")
   * @param {number} factor - Lightening factor (0-1, where 1 is white)
   * @returns {string} - Lightened hex color
   */
  lightenColor(color, factor) {
    // Remove # if present
    const hex = color.replace('#', '');
    
    // Parse RGB values
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // Lighten each component
    const newR = Math.round(r + (255 - r) * factor);
    const newG = Math.round(g + (255 - g) * factor);
    const newB = Math.round(b + (255 - b) * factor);
    
    // Convert back to hex
    const toHex = (n) => {
      const hex = n.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    
    return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
  }

  /**
   * Get stroke color for nodes based on experience level
   * @param {Object} node - Node object
   * @returns {string} - Stroke color
   */
  getNodeStrokeColor(node) {
    // Handle experience level - default to "experienced" if not specified
    const experienceLevel = node.experienceLevel || 'experienced';

    if (experienceLevel === 'interested') {
      // Lighter stroke for interested nodes
      return this.lightenColor(this.config.theme.textPrimary, 0.5);
    }

    // Full stroke for experienced nodes
    return this.config.theme.textPrimary;
  }
  
  /**
   * Get stroke width for nodes based on experience level
   * @param {Object} node - Node object
   * @returns {number} - Stroke width
   */
  getNodeStrokeWidth(node) {
    // Handle experience level - default to "experienced" if not specified
    const experienceLevel = node.experienceLevel || 'experienced';

    if (experienceLevel === 'interested') {
      return 1; // Thinner stroke for interested
    }

    return 2; // Standard stroke for experienced
  }

  /**
   * Render labels
   */
  renderLabels() {
    const labelSelection = this.labelGroup
      .selectAll('.label')
      .data(this.nodes, d => d.id);

    labelSelection.exit().remove();

    labelSelection.enter()
      .append('text')
      .attr('class', 'label')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-family', this.config.theme.fontFamily)
      .style('font-size', '12px') // Will be updated by updateTextSizesForZoom
      .attr('fill', this.config.theme.textPrimary)
      .attr('pointer-events', 'none')
      .style('user-select', 'none')
      .text(d => d.label);
  }

  /**
   * Update positions during simulation tick
   */
  updatePositions() {
    this.linkGroup.selectAll('.link')
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    this.nodeGroup.selectAll('.node')
      .attr('cx', d => d.x)
      .attr('cy', d => d.y);

    // Update label positions using smart layout if enabled, otherwise use default positioning
    if (this.components.labelLayoutManager && this.config.features.smartLabelPositioning) {
      this.components.labelLayoutManager.updateData(this.nodes, this.labelGroup.selectAll('.label'));
    } else {
      // Default label positioning (below nodes)
      this.labelGroup.selectAll('.label')
        .attr('x', d => d.x)
        .attr('y', d => d.y + (d.size || 10) + 18);
    }

    if (this.components.miniMapManager) {
      this.components.miniMapManager.render();
    }
  }

  /**
   * Initialize node positions based on layer grid layout
   */
  initializeLayerBasedPositions() {
    // 3x3 grid layout
    const gridSize = 3;
    const cellWidth = this.config.width / gridSize;
    const cellHeight = this.config.height / gridSize;
    
    // Fill order: (1,2), (2,1), (2,3), (3,2), (2,2), (1,1), (3,3), (1,3), (3,1)
    // Convert to 0-based indexing: (0,1), (1,0), (1,2), (2,1), (1,1), (0,0), (2,2), (0,2), (2,0)
    const fillOrder = [
      [0, 1], [1, 0], [1, 2], [2, 1], [1, 1], [0, 0], [2, 2], [0, 2], [2, 0]
    ];
    
    // Get unique layers
    const uniqueLayers = [...new Set(this.nodes.map(node => node.layer))];
    
    // Assign each layer to a grid position
    const layerToGridPosition = new Map();
    uniqueLayers.forEach((layer, index) => {
      if (index < fillOrder.length) {
        layerToGridPosition.set(layer, fillOrder[index]);
      } else {
        // Fallback for extra layers - use modulo to wrap around
        layerToGridPosition.set(layer, fillOrder[index % fillOrder.length]);
      }
    });
    
    // Position nodes within their assigned grid cells
    this.nodes.forEach(node => {
      const gridPos = layerToGridPosition.get(node.layer);
      if (gridPos) {
        const [gridX, gridY] = gridPos;
        
        // Calculate cell boundaries
        const cellLeft = gridX * cellWidth;
        const cellTop = gridY * cellHeight;
        
        // Add padding within cells to avoid edges
        const padding = Math.min(cellWidth, cellHeight) * 0.1;
        
        // Random position within the cell (with padding)
        node.x = cellLeft + padding + Math.random() * (cellWidth - 2 * padding);
        node.y = cellTop + padding + Math.random() * (cellHeight - 2 * padding);
      } else {
        // Fallback to center if no layer assigned
        node.x = this.config.width / 2 + (Math.random() - 0.5) * 100;
        node.y = this.config.height / 2 + (Math.random() - 0.5) * 100;
      }
    });
  }

  /**
   * Calculate initial zoom to fit all nodes with padding
   */
  setInitialZoom() {
    if (!this.svg || !this.nodes.length) return;

    // Calculate bounding box of all nodes
    const padding = 50; // Padding around the content
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    this.nodes.forEach(node => {
      if (node.x !== undefined && node.y !== undefined) {
        minX = Math.min(minX, node.x);
        maxX = Math.max(maxX, node.x);
        minY = Math.min(minY, node.y);
        maxY = Math.max(maxY, node.y);
      }
    });

    // If we have valid bounds
    if (isFinite(minX) && isFinite(maxX) && isFinite(minY) && isFinite(maxY)) {
      const contentWidth = maxX - minX;
      const contentHeight = maxY - minY;
      const svgWidth = this.config.width;
      const svgHeight = this.config.height;

      // Calculate scale to fit content with padding
      const scaleX = (svgWidth - 2 * padding) / contentWidth;
      const scaleY = (svgHeight - 2 * padding) / contentHeight;
      const scale = Math.min(scaleX, scaleY, 0.8); // Cap at 0.8 to ensure zoom out

      // Calculate center of content
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      // Calculate translation to center the content
      const translateX = svgWidth / 2 - centerX * scale;
      const translateY = svgHeight / 2 - centerY * scale;

      // Apply the transform
      const initialTransform = d3.zoomIdentity
        .translate(translateX, translateY)
        .scale(scale);

      this.svg.call(this.zoom.transform, initialTransform);

      // Update text sizes for the initial zoom level
      this.updateTextSizesForZoom(scale);
    }
  }

  /**
   * Start the force simulation
   */
  startSimulation() {
    if (this.components.forceSimulation) {
      // Initialize positions before starting simulation
      this.initializeLayerBasedPositions();
      this.components.forceSimulation.updateData(this.nodes, this.links);

      // Set initial zoom after a brief delay to ensure nodes have positions
      setTimeout(() => {
        this.setInitialZoom();
      }, 100);
    }
  }

  /**
   * Navigate to a specific position
   * @param {Object} position - {x, y} position in graph coordinates
   */
  navigateToPosition(position) {
    const scale = 1.5;
    const centerX = this.config.width / 2;
    const centerY = this.config.height / 2;
    
    const newTransform = d3.zoomIdentity
      .translate(centerX - position.x * scale, centerY - position.y * scale)
      .scale(scale);
    
    this.svg.transition()
      .duration(750)
      .call(this.zoom.transform, newTransform);
  }

  // ====== PUBLIC API METHODS ======

  /**
   * Set audience filter
   * @param {string} audienceId - 'all', 'general', 'technical', or 'current'
   */
  setAudienceFilter(audienceId) {
    this.state.currentAudience = audienceId;

    // Clear selected node when switching audiences to prevent
    // related nodes from staying visible in wrong audience context
    if (this.state.selectedNode) {
      this.setSelectedNode(null);
    }

    if (this.components.visualEffectsManager) {
      this.components.visualEffectsManager.applyAudienceEffects(audienceId, this.nodes);
    }

    this.updateLabelsForAudience(audienceId);

    this.emit('audienceChange', { audience: audienceId });
  }

  /**
   * Calculate graph distances from a selected node to all other nodes
   * @param {Object} selectedNode - The selected node
   * @returns {Map} - Map of node ID to distance from selected node
   */
  calculateGraphDistances(selectedNode) {
    const distances = new Map();
    const visited = new Set();
    const queue = [{ node: selectedNode, distance: 0 }];

    distances.set(selectedNode.id, 0);
    visited.add(selectedNode.id);

    while (queue.length > 0) {
      const { node, distance } = queue.shift();

      // Find all connected nodes (both through links and parent/child relationships)
      const connectedNodeIds = new Set();

      // Check links
      this.links.forEach(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;

        if (sourceId === node.id && !visited.has(targetId)) {
          connectedNodeIds.add(targetId);
        } else if (targetId === node.id && !visited.has(sourceId)) {
          connectedNodeIds.add(sourceId);
        }
      });

      // Check parent/child relationships
      this.nodes.forEach(n => {
        if (n.parent_node === node.id && !visited.has(n.id)) {
          connectedNodeIds.add(n.id);
        }
        if (node.parent_node === n.id && !visited.has(n.id)) {
          connectedNodeIds.add(n.id);
        }
      });

      // Add connected nodes to queue
      connectedNodeIds.forEach(nodeId => {
        if (!visited.has(nodeId)) {
          const connectedNode = this.nodes.find(n => n.id === nodeId);
          if (connectedNode) {
            visited.add(nodeId);
            distances.set(nodeId, distance + 1);
            queue.push({ node: connectedNode, distance: distance + 1 });
          }
        }
      });
    }

    return distances;
  }

  /**
   * Find all nodes related to a given node
   * @param {Object} node - The node to find relations for
   * @returns {Set} - Set of related node IDs
   */
  findRelatedNodes(node) {
    const relatedIds = new Set();

    // Add the node itself
    relatedIds.add(node.id);

    // Find all links connected to this node (both as parent and child)
    const connectedLinks = this.links.filter(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      return sourceId === node.id || targetId === node.id;
    });

    // Add connected nodes from links
    connectedLinks.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      relatedIds.add(sourceId);
      relatedIds.add(targetId);
    });

    // Add direct parent/child relationships
    const children = this.nodes.filter(n => n.parent_node === node.id);
    children.forEach(child => relatedIds.add(child.id));

    if (node.parent_node) {
      relatedIds.add(node.parent_node);
    }

    return relatedIds;
  }

  /**
   * Update link visibility to only show links between nodes with visible labels
   */
  updateLinkVisibility() {
    if (!this.linkGroup) return;

    // During initial setup, don't show any links until properly initialized
    if (!this.state.isInitialized) {
      this.linkGroup.selectAll('.link').style('opacity', 0);
      return;
    }

    // Get all nodes with visible labels (opacity > 0)
    const nodesWithVisibleLabels = new Set();

    if (this.labelGroup) {
      this.labelGroup.selectAll('.label').each(function(d) {
        const opacity = parseFloat(d3.select(this).style('opacity')) || 0;
        if (opacity > 0) {
          nodesWithVisibleLabels.add(d.id);
        }
      });
    }

    // Update link visibility based on selection state
    this.linkGroup.selectAll('.link')
      .transition()
      .duration(300)
      .ease(d3.easeQuadOut)
      .style('opacity', d => {
        const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
        const targetId = typeof d.target === 'object' ? d.target.id : d.target;

        if (this.state.selectedNode) {
          // When a node is selected, only show links directly connected to that node
          const selectedNodeId = this.state.selectedNode.id;
          const isConnectedToSelected = (sourceId === selectedNodeId || targetId === selectedNodeId);

          // Show link if it's connected to selected node AND both endpoints have visible labels
          const sourceVisible = nodesWithVisibleLabels.has(sourceId);
          const targetVisible = nodesWithVisibleLabels.has(targetId);

          return (isConnectedToSelected && sourceVisible && targetVisible) ? 0.6 : 0;
        } else {
          // When no node is selected, show links between any nodes with visible labels
          const sourceVisible = nodesWithVisibleLabels.has(sourceId);
          const targetVisible = nodesWithVisibleLabels.has(targetId);

          return (sourceVisible && targetVisible) ? 0.6 : 0;
        }
      })
      .style('pointer-events', d => {
        const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
        const targetId = typeof d.target === 'object' ? d.target.id : d.target;

        if (this.state.selectedNode) {
          // When a node is selected, only show links directly connected to that node
          const selectedNodeId = this.state.selectedNode.id;
          const isConnectedToSelected = (sourceId === selectedNodeId || targetId === selectedNodeId);

          const sourceVisible = nodesWithVisibleLabels.has(sourceId);
          const targetVisible = nodesWithVisibleLabels.has(targetId);

          return (isConnectedToSelected && sourceVisible && targetVisible) ? 'auto' : 'none';
        } else {
          // When no node is selected, enable links between any nodes with visible labels
          const sourceVisible = nodesWithVisibleLabels.has(sourceId);
          const targetVisible = nodesWithVisibleLabels.has(targetId);

          return (sourceVisible && targetVisible) ? 'auto' : 'none';
        }
      });
  }

  /**
   * Update label visibility based on audience and layer
   * @param {string} audienceId - Current audience filter
   */
  updateLabelsForAudience(audienceId) {
    if (!this.labelGroup) return;

    // Use immediate updates during panning to prevent conflicts, smooth transitions otherwise
    const labelSelection = this.labelGroup.selectAll('.label');
    const updateMethod = this.state.isPanning ? labelSelection : labelSelection.transition().duration(200);

    updateMethod.style('opacity', d => {
        // Always show labels for related nodes when a node is selected
        if (this.state.selectedNode && this.state.selectedNodeRelated.has(d.id)) {
          return 1;
        }

        // Hide labels for subnodes when "All Layers" is active and no specific layer is selected
        if (this.state.currentLayer === null && d.subnode) {
          return 0;
        }

        // Handle audience as array or string
        let nodeAudience = d.audience || ['general'];
        if (typeof nodeAudience === 'string') {
          nodeAudience = [nodeAudience];
        }

        return nodeAudience.includes(audienceId) ? 1 : 0;
      });

    // Update link visibility immediately if not panning and initialized, otherwise delay until panning completes
    if (!this.state.isPanning && this.state.isInitialized) {
      this.updateLinkVisibility();
    }
  }

  /**
   * Apply Mac dock-style hover effects based on mouse proximity
   * @param {Object} mousePosition - Mouse position in graph coordinates
   */
  applyDockHoverEffects(mousePosition) {
    // Only apply dock effects when no node is selected (info panel not visible)
    if (this.state.selectedNode !== null || !this.nodeGroup) return;

    this.nodeGroup.selectAll('.node')
      .transition()
      .duration(200)
      .ease(d3.easeQuadOut)
      .attr('r', d => {
        const originalSize = d.size || 10;
        const distance = Math.sqrt(Math.pow(d.x - mousePosition.x, 2) + Math.pow(d.y - mousePosition.y, 2));

        // Define influence radius (adjust based on your graph scale)
        const maxInfluenceRadius = 100;

        if (distance <= 30) {
          // Very close - largest zoom (like Mac dock)
          return originalSize * 1.4;
        } else if (distance <= 50) {
          // Close - medium zoom
          return originalSize * 1.25;
        } else if (distance <= maxInfluenceRadius) {
          // Within influence radius - slight zoom with falloff
          const factor = 1 + (0.15 * (1 - distance / maxInfluenceRadius));
          return originalSize * factor;
        } else {
          // Outside influence - normal size
          return originalSize;
        }
      });
  }

  /**
   * Reset dock hover effects to normal node sizes
   */
  resetDockHoverEffects() {
    // Only reset if no node is selected
    if (this.state.selectedNode !== null || !this.nodeGroup) return;

    this.nodeGroup.selectAll('.node')
      .transition()
      .duration(300)
      .ease(d3.easeQuadOut)
      .attr('r', d => d.size || 10);
  }

  /**
   * Apply size scaling to nodes based on their distance from selected node
   * @param {Map} distances - Map of node ID to distance from selected node
   */
  applyNodeSizeScaling(distances) {
    if (!this.nodeGroup) return;

    this.nodeGroup.selectAll('.node')
      .transition()
      .duration(400)
      .ease(d3.easeQuadOut)
      .attr('r', d => {
        const originalSize = d.size || 10;
        const distance = distances.get(d.id);

        if (distance === undefined) {
          // Unconnected nodes - reduce significantly
          return originalSize * 0.6;
        } else if (distance === 0) {
          // Selected node - increase significantly
          return originalSize * 1.5;
        } else if (distance === 1) {
          // Directly connected - increase slightly
          return originalSize * 1.2;
        } else if (distance === 2) {
          // 2 nodes away - slight decrease
          return originalSize * 0.8;
        } else {
          // Further away - decrease more
          return originalSize * Math.max(0.5, 1 - (distance * 0.15));
        }
      });
  }

  /**
   * Reset all nodes to their original sizes
   */
  resetNodeSizes() {
    if (!this.nodeGroup) return;

    this.nodeGroup.selectAll('.node')
      .transition()
      .duration(400)
      .ease(d3.easeQuadOut)
      .attr('r', d => d.size || 10);
  }

  /**
   * Pan the view to center on a specific node
   * @param {Object} node - Node to center on
   */
  centerOnNode(node) {
    if (!node || !this.svg || !this.zoom) return;

    const svgRect = this.svg.node().getBoundingClientRect();
    const centerX = svgRect.width / 2;
    const centerY = svgRect.height / 2;

    // Calculate the transform to center the node
    const currentTransform = d3.zoomTransform(this.svg.node());
    const newTransform = d3.zoomIdentity
      .translate(centerX - node.x * currentTransform.k, centerY - node.y * currentTransform.k)
      .scale(currentTransform.k);

    // Set panning flag to prevent text size updates during transition
    this.state.isPanning = true;

    // Smoothly transition to the new position
    this.svg.transition()
      .duration(400)
      .ease(d3.easeQuadOut)
      .call(this.zoom.transform, newTransform)
      .on('end', () => {
        // Clear panning flag and update text size for final zoom level
        this.state.isPanning = false;
        this.updateTextSizesForZoom(newTransform.k);
        // Update link visibility after panning completes
        this.updateLinkVisibility();
      });
  }

  /**
   * Set selected node and update related node visibility
   * @param {Object|null} node - Selected node or null to clear selection
   */
  setSelectedNode(node) {
    if (node) {
      this.state.selectedNode = node;
      this.state.selectedNodeRelated = this.findRelatedNodes(node);
      this.state.selectedNodeDistances = this.calculateGraphDistances(node);

      // Update VisualEffectsManager with selected node information
      if (this.components.visualEffectsManager) {
        this.components.visualEffectsManager.setSelectedNode(node, this.state.selectedNodeRelated);
      }

      // Apply visual effects
      this.applyNodeSizeScaling(this.state.selectedNodeDistances);
      this.centerOnNode(node);

      // Re-apply audience effects to respect selected node state
      if (this.components.visualEffectsManager) {
        this.components.visualEffectsManager.applyAudienceEffects(this.state.currentAudience, this.nodes);
      }
    } else {
      this.state.selectedNode = null;
      this.state.selectedNodeRelated = new Set();
      this.state.selectedNodeDistances = new Map();

      // Clear VisualEffectsManager selected node information
      if (this.components.visualEffectsManager) {
        this.components.visualEffectsManager.setSelectedNode(null, new Set());
      }

      // Reset visual effects
      this.resetNodeSizes();

      // Re-apply audience effects to normal state
      if (this.components.visualEffectsManager) {
        this.components.visualEffectsManager.applyAudienceEffects(this.state.currentAudience, this.nodes);
      }
    }

    // Update label visibility to show related nodes
    this.updateLabelsForAudience(this.state.currentAudience);
  }

  /**
   * Set active layer
   * @param {string|null} layerId - Layer ID or null for all layers
   */
  setActiveLayer(layerId) {
    this.state.currentLayer = layerId;
    
    if (this.components.visualEffectsManager) {
      this.components.visualEffectsManager.applyLayerEffects(layerId);
    }
    
    if (this.components.interactionManager) {
      this.components.interactionManager.updateLayerMode(layerId !== null);
    }
    
    // Update labels based on subnode visibility and current audience
    this.updateLabelsForAudience(this.state.currentAudience);
    
    this.emit('layerChange', { layer: layerId });
  }

  /**
   * Show all layers
   */
  showAllLayers() {
    this.setActiveLayer(null);
  }

  /**
   * Update data and refresh the graph
   * @param {Object} newData - New data object
   */
  updateData(newData) {
    this.validateAndProcessData(newData);
    
    // Update all components with new data
    Object.values(this.components).forEach(component => {
      if (component && component.updateData) {
        component.updateData(this.nodes, this.links);
      }
    });
    
    this.render();
    this.startSimulation();
    
    this.emit('dataUpdate', { nodeCount: this.nodes.length, linkCount: this.links.length });
  }

  /**
   * Focus on a specific node
   * @param {string} nodeId - Node ID
   */
  focusOnNode(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (node && node.x !== undefined && node.y !== undefined) {
      this.navigateToPosition({ x: node.x, y: node.y });
      this.emit('nodeFocus', { node });
    }
  }

  /**
   * Restart the simulation
   */
  restartSimulation() {
    if (this.components.forceSimulation) {
      this.components.forceSimulation.restart();
    }
  }

  /**
   * Update configuration
   * @param {Object} newConfig - Configuration updates
   */
  updateConfig(newConfig) {
    this.config = this.deepMerge(this.config, newConfig);
    
    // Update components with new config
    Object.values(this.components).forEach(component => {
      if (component && component.updateConfig) {
        component.updateConfig(newConfig);
      }
    });
    
    this.emit('configUpdate', { config: this.config });
  }

  /**
   * Add event listener
   * @param {string} eventType - Event type
   * @param {Function} callback - Callback function
   */
  on(eventType, callback) {
    if (!this.eventHandlers[eventType]) {
      this.eventHandlers[eventType] = [];
    }
    this.eventHandlers[eventType].push(callback);
    return this;
  }

  /**
   * Remove event listener
   * @param {string} eventType - Event type
   * @param {Function} callback - Callback function
   */
  off(eventType, callback) {
    if (this.eventHandlers[eventType]) {
      this.eventHandlers[eventType] = this.eventHandlers[eventType].filter(cb => cb !== callback);
    }
    return this;
  }

  /**
   * Emit event
   * @param {string} eventType - Event type
   * @param {Object} data - Event data
   */
  emit(eventType, data = {}) {
    if (this.eventHandlers[eventType]) {
      this.eventHandlers[eventType].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event handler for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Get current state and statistics
   * @returns {Object} - Current state information
   */
  getState() {
    return {
      ...this.state,
      nodeCount: this.nodes.length,
      linkCount: this.links.length,
      config: this.config,
      components: Object.keys(this.components).reduce((acc, key) => {
        acc[key] = this.components[key] ? 'initialized' : 'not available';
        return acc;
      }, {})
    };
  }

  /**
   * Cleanup and destroy the graph
   */
  destroy() {
    // Destroy all components
    Object.values(this.components).forEach(component => {
      if (component && component.destroy) {
        component.destroy();
      }
    });
    
    // Clear container
    this.container.innerHTML = '';
    
    // Clear references
    this.eventHandlers = {};
    this.components = {};
    this.nodes = [];
    this.links = [];
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = KnowledgeGraphExplorer;
} else if (typeof window !== 'undefined') {
  window.KnowledgeGraphExplorer = KnowledgeGraphExplorer;
}// === src/utils/CoordinateTransform.js ===
/**
 * Coordinate Transformation Utilities for Knowledge Graph Explorer
 * Handles coordinate transformations between screen space and graph space
 * Provides clean abstraction for zoom/pan coordinate calculations
 */
class CoordinateTransform {
  constructor() {
    this.currentTransform = d3.zoomIdentity;
    this.viewportWidth = 800;
    this.viewportHeight = 600;
  }

  /**
   * Update the current transform (called during zoom events)
   * @param {Object} transform - D3 zoom transform object
   */
  updateTransform(transform) {
    this.currentTransform = transform;
  }

  /**
   * Update viewport dimensions
   * @param {number} width - Viewport width
   * @param {number} height - Viewport height
   */
  updateViewport(width, height) {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  /**
   * Convert screen coordinates to graph coordinates
   * @param {Array|Object} screenPosition - [x, y] array or {x, y} object in screen space
   * @param {Object} transform - Optional transform override
   * @returns {Object} - {x, y} in graph space
   */
  screenToGraph(screenPosition, transform = null) {
    const t = transform || this.currentTransform;
    
    // Handle both array and object input
    const screenX = Array.isArray(screenPosition) ? screenPosition[0] : screenPosition.x;
    const screenY = Array.isArray(screenPosition) ? screenPosition[1] : screenPosition.y;
    
    return {
      x: (screenX - t.x) / t.k,
      y: (screenY - t.y) / t.k
    };
  }

  /**
   * Convert graph coordinates to screen coordinates
   * @param {Object|Array} graphPosition - {x, y} object or [x, y] array in graph space
   * @param {Object} transform - Optional transform override
   * @returns {Array} - [x, y] in screen space
   */
  graphToScreen(graphPosition, transform = null) {
    const t = transform || this.currentTransform;
    
    // Handle both object and array input
    const graphX = Array.isArray(graphPosition) ? graphPosition[0] : graphPosition.x;
    const graphY = Array.isArray(graphPosition) ? graphPosition[1] : graphPosition.y;
    
    return [
      graphX * t.k + t.x,
      graphY * t.k + t.y
    ];
  }

  /**
   * Convert screen coordinates relative to SVG element to graph coordinates
   * Useful for mouse event handling
   * @param {Event} event - Mouse event
   * @param {Element} svgElement - SVG DOM element
   * @param {Object} transform - Optional transform override
   * @returns {Object} - {x, y} in graph space
   */
  eventToGraph(event, svgElement, transform = null) {
    const [svgX, svgY] = d3.pointer(event, svgElement);
    return this.screenToGraph([svgX, svgY], transform);
  }

  /**
   * Calculate Euclidean distance between two points
   * @param {Object} point1 - {x, y} coordinates
   * @param {Object} point2 - {x, y} coordinates
   * @returns {number} - Distance between points
   */
  calculateDistance(point1, point2) {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calculate distance between a point and multiple targets, return closest
   * @param {Object} point - {x, y} source point
   * @param {Array} targets - Array of {x, y} target points with id property
   * @param {number} maxDistance - Maximum distance to consider
   * @returns {Object|null} - Closest target with distance, or null if none within maxDistance
   */
  findClosestPoint(point, targets, maxDistance = Infinity) {
    let closest = null;
    let minDistance = maxDistance;

    targets.forEach(target => {
      const distance = this.calculateDistance(point, target);
      if (distance < minDistance) {
        minDistance = distance;
        closest = { target, distance };
      }
    });

    return closest;
  }

  /**
   * Get the current zoom scale
   * @returns {number} - Current zoom scale factor
   */
  getScale() {
    return this.currentTransform.k;
  }

  /**
   * Get the current translation
   * @returns {Object} - {x, y} translation offset
   */
  getTranslation() {
    return {
      x: this.currentTransform.x,
      y: this.currentTransform.y
    };
  }

  /**
   * Get complete transform information
   * @returns {Object} - Full transform state
   */
  getTransform() {
    return {
      x: this.currentTransform.x,
      y: this.currentTransform.y,
      k: this.currentTransform.k,
      scale: this.currentTransform.k,
      translation: this.getTranslation()
    };
  }

  /**
   * Check if a point in graph space is visible in the current viewport
   * @param {Object} graphPosition - {x, y} in graph space
   * @param {number} margin - Optional margin for visibility check (in screen pixels)
   * @returns {boolean} - True if visible in viewport
   */
  isVisible(graphPosition, margin = 0) {
    const [screenX, screenY] = this.graphToScreen(graphPosition);
    
    return screenX >= -margin && 
           screenX <= this.viewportWidth + margin && 
           screenY >= -margin && 
           screenY <= this.viewportHeight + margin;
  }

  /**
   * Get the visible bounds of the current viewport in graph coordinates
   * @param {number} margin - Optional margin to expand bounds (in screen pixels)
   * @returns {Object} - {minX, maxX, minY, maxY, width, height} in graph space
   */
  getVisibleBounds(margin = 0) {
    const topLeft = this.screenToGraph([-margin, -margin]);
    const bottomRight = this.screenToGraph([
      this.viewportWidth + margin, 
      this.viewportHeight + margin
    ]);

    return {
      minX: topLeft.x,
      maxX: bottomRight.x,
      minY: topLeft.y,
      maxY: bottomRight.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y
    };
  }

  /**
   * Apply zoom-aware scaling to a value
   * @param {number} value - Original value
   * @param {boolean} inverse - If true, scale inversely with zoom (useful for maintaining visual size)
   * @returns {number} - Scaled value
   */
  scaleValue(value, inverse = false) {
    return inverse ? value / this.currentTransform.k : value * this.currentTransform.k;
  }

  /**
   * Scale a radius or size value to maintain consistent visual appearance across zoom levels
   * @param {number} baseValue - Base size value
   * @param {number} minScale - Minimum scale factor (prevents elements from becoming too small)
   * @param {number} maxScale - Maximum scale factor (prevents elements from becoming too large)
   * @returns {number} - Zoom-adjusted value
   */
  scaleVisualSize(baseValue, minScale = 0.5, maxScale = 2.0) {
    const scale = Math.max(minScale, Math.min(maxScale, 1 / this.currentTransform.k));
    return baseValue * scale;
  }

  /**
   * Calculate appropriate font size for current zoom level
   * @param {number} baseFontSize - Base font size in pixels
   * @param {number} minSize - Minimum readable size
   * @param {number} maxSize - Maximum size to prevent overflow
   * @returns {number} - Zoom-appropriate font size
   */
  scaleFontSize(baseFontSize, minSize = 8, maxSize = 24) {
    const scale = 1 / this.currentTransform.k;
    const scaledSize = baseFontSize * scale;
    return Math.max(minSize, Math.min(maxSize, scaledSize));
  }

  /**
   * Check if a circular area is visible in the viewport
   * @param {Object} center - {x, y} center point in graph space
   * @param {number} radius - Radius in graph space
   * @returns {boolean} - True if any part of the circle is visible
   */
  isCircleVisible(center, radius) {
    const bounds = this.getVisibleBounds();
    
    // Check if circle overlaps with viewport rectangle
    const closestX = Math.max(bounds.minX, Math.min(center.x, bounds.maxX));
    const closestY = Math.max(bounds.minY, Math.min(center.y, bounds.maxY));
    
    const distance = this.calculateDistance(center, { x: closestX, y: closestY });
    return distance <= radius;
  }

  /**
   * Create a transform that centers a specific point in the viewport
   * @param {Object} graphPoint - {x, y} point to center in graph space
   * @param {number} scale - Desired zoom scale (optional, defaults to current scale)
   * @returns {Object} - D3 transform object that centers the point
   */
  createCenteringTransform(graphPoint, scale = null) {
    const targetScale = scale !== null ? scale : this.currentTransform.k;
    const centerX = this.viewportWidth / 2;
    const centerY = this.viewportHeight / 2;
    
    return d3.zoomIdentity
      .translate(centerX - graphPoint.x * targetScale, centerY - graphPoint.y * targetScale)
      .scale(targetScale);
  }

  /**
   * Create a transform that fits a bounding box within the viewport
   * @param {Object} bounds - {minX, maxX, minY, maxY} in graph space
   * @param {number} padding - Padding as percentage of viewport (0.0 to 1.0)
   * @returns {Object} - D3 transform object that fits the bounds
   */
  createFittingTransform(bounds, padding = 0.1) {
    const contentWidth = bounds.maxX - bounds.minX;
    const contentHeight = bounds.maxY - bounds.minY;
    
    const availableWidth = this.viewportWidth * (1 - padding);
    const availableHeight = this.viewportHeight * (1 - padding);
    
    const scaleX = availableWidth / contentWidth;
    const scaleY = availableHeight / contentHeight;
    const scale = Math.min(scaleX, scaleY);
    
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    
    return this.createCenteringTransform({ x: centerX, y: centerY }, scale);
  }

  /**
   * Reset transform to identity (no zoom, no pan)
   * @returns {Object} - Identity transform
   */
  resetTransform() {
    this.currentTransform = d3.zoomIdentity;
    return d3.zoomIdentity;
  }

  /**
   * Interpolate between two transforms for smooth animations
   * @param {Object} fromTransform - Starting transform
   * @param {Object} toTransform - Ending transform
   * @param {number} t - Interpolation factor (0.0 to 1.0)
   * @returns {Object} - Interpolated transform
   */
  interpolateTransform(fromTransform, toTransform, t) {
    return d3.zoomIdentity
      .translate(
        fromTransform.x + (toTransform.x - fromTransform.x) * t,
        fromTransform.y + (toTransform.y - fromTransform.y) * t
      )
      .scale(fromTransform.k + (toTransform.k - fromTransform.k) * t);
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CoordinateTransform;
} else if (typeof window !== 'undefined') {
  window.CoordinateTransform = CoordinateTransform;
}// === src/utils/sampleData.js ===
const sampleData = {
  nodes: [
    // Education Layer
    {
      id: 'stanford-cs',
      label: 'Stanford CS',
      type: 'education',
      layer: 'education',
      size: 15,
      timespan: { start: 2015, end: 2019 },
      description: 'Computer Science degree at Stanford University. Focused on AI and machine learning.'
    },
    {
      id: 'mit-phd',
      label: 'MIT PhD',
      type: 'education',
      layer: 'education',
      size: 18,
      timespan: { start: 2019, end: 2023 },
      description: 'PhD in Artificial Intelligence at MIT. Thesis on neural network optimization.'
    },
    
    // Research Layer
    {
      id: 'neural-nets',
      label: 'Neural Networks',
      type: 'research',
      layer: 'research',
      size: 16,
      timespan: { start: 2018, end: null },
      description: 'Research focus on neural network architectures and optimization techniques.'
    },
    {
      id: 'nlp-research',
      label: 'NLP Research',
      type: 'research',
      layer: 'research',
      size: 14,
      timespan: { start: 2020, end: null },
      description: 'Natural language processing research, focusing on transformer models.'
    },
    {
      id: 'computer-vision',
      label: 'Computer Vision',
      type: 'research',
      layer: 'research',
      size: 13,
      timespan: { start: 2017, end: 2021 },
      description: 'Computer vision research during PhD, published 8 papers in top venues.'
    },
    
    // Industry Layer
    {
      id: 'google-intern',
      label: 'Google Intern',
      type: 'industry',
      layer: 'industry',
      size: 12,
      timespan: { start: 2018, end: 2018 },
      description: 'Summer internship at Google Brain, worked on TensorFlow optimization.'
    },
    {
      id: 'openai-researcher',
      label: 'OpenAI Researcher',
      type: 'industry',
      layer: 'industry',
      size: 17,
      timespan: { start: 2023, end: null },
      description: 'Research scientist at OpenAI, working on large language models.'
    },
    
    // Current Interests Layer
    {
      id: 'ai-safety',
      label: 'AI Safety',
      type: 'current',
      layer: 'current',
      size: 15,
      timespan: { start: 2022, end: null },
      description: 'Current research focus on AI alignment and safety mechanisms.'
    },
    {
      id: 'llm-interpretability',
      label: 'LLM Interpretability',
      type: 'current',
      layer: 'current',
      size: 14,
      timespan: { start: 2023, end: null },
      description: 'Understanding how large language models work internally.'
    },
    
    // Geographic Layer
    {
      id: 'bay-area',
      label: 'Bay Area',
      type: 'geographic',
      layer: 'geographic',
      size: 16,
      timespan: { start: 2015, end: null },
      description: 'Living and working in the San Francisco Bay Area.'
    },
    {
      id: 'boston',
      label: 'Boston',
      type: 'geographic',
      layer: 'geographic',
      size: 13,
      timespan: { start: 2019, end: 2023 },
      description: 'Boston area during PhD at MIT.'
    }
  ],
  
  links: [
    // Education connections
    { source: 'stanford-cs', target: 'neural-nets', strength: 0.8, description: 'ML courses sparked interest in neural networks' },
    { source: 'stanford-cs', target: 'google-intern', strength: 0.6, description: 'Stanford connection helped land Google internship' },
    { source: 'mit-phd', target: 'nlp-research', strength: 0.9, description: 'PhD thesis focused on NLP applications' },
    { source: 'mit-phd', target: 'computer-vision', strength: 0.7, description: 'Side research during PhD' },
    
    // Research connections
    { source: 'neural-nets', target: 'nlp-research', strength: 0.8, description: 'Neural networks applied to NLP' },
    { source: 'neural-nets', target: 'computer-vision', strength: 0.7, description: 'CNNs for vision tasks' },
    { source: 'nlp-research', target: 'llm-interpretability', strength: 0.9, description: 'Current focus evolved from NLP research' },
    
    // Industry connections
    { source: 'google-intern', target: 'neural-nets', strength: 0.7, description: 'Applied neural network research at Google' },
    { source: 'openai-researcher', target: 'ai-safety', strength: 0.9, description: 'AI safety is core mission at OpenAI' },
    { source: 'openai-researcher', target: 'llm-interpretability', strength: 0.8, description: 'Daily work involves LLM research' },
    
    // Cross-layer connections
    { source: 'mit-phd', target: 'openai-researcher', strength: 0.6, description: 'PhD research led to OpenAI position' },
    { source: 'computer-vision', target: 'ai-safety', strength: 0.5, description: 'Vision research informed safety concerns' },
    
    // Geographic connections
    { source: 'stanford-cs', target: 'bay-area', strength: 0.9, description: 'Moved to Bay Area for Stanford' },
    { source: 'mit-phd', target: 'boston', strength: 0.9, description: 'Moved to Boston for MIT' },
    { source: 'google-intern', target: 'bay-area', strength: 0.7, description: 'Internship in Bay Area' },
    { source: 'openai-researcher', target: 'bay-area', strength: 0.8, description: 'OpenAI office in San Francisco' }
  ],
  
  config: {
    layers: [
      { id: 'education', name: 'Education', color: '#4a90e2' },
      { id: 'research', name: 'Research', color: '#7ed321' },
      { id: 'industry', name: 'Industry Experience', color: '#f5a623' },
      { id: 'current', name: 'Current Interests', color: '#d0021b' },
      { id: 'geographic', name: 'Geographic Journey', color: '#9013fe' }
    ]
  }
};

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = sampleData;
}
if (typeof window !== 'undefined') {
  window.sampleData = sampleData;
}// === src/utils/DataValidator.js ===
/**
 * Data Validation Utilities for Knowledge Graph Explorer
 * Validates node and link data structures, ensures data integrity
 */
class DataValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Validate complete graph data structure
   * @param {Object} data - Graph data with nodes and links
   * @returns {Object} - Validation result with isValid, errors, warnings
   */
  validateGraphData(data) {
    this.errors = [];
    this.warnings = [];

    if (!data) {
      this.errors.push('Graph data is null or undefined');
      return this.getValidationResult();
    }

    if (!data.nodes || !Array.isArray(data.nodes)) {
      this.errors.push('Graph data must contain a nodes array');
      return this.getValidationResult();
    }

    if (!data.links || !Array.isArray(data.links)) {
      this.errors.push('Graph data must contain a links array');
      return this.getValidationResult();
    }

    // Validate nodes
    const nodeIds = new Set();
    data.nodes.forEach((node, index) => {
      this.validateNode(node, index, nodeIds);
    });

    // Validate links
    data.links.forEach((link, index) => {
      this.validateLink(link, index, nodeIds);
    });

    // Validate parent_node references
    data.nodes.forEach((node, index) => {
      if (node.parent_node && node.parent_node !== null && !nodeIds.has(node.parent_node)) {
        this.errors.push(`Node ${index} (${node.id}): parent_node '${node.parent_node}' does not exist`);
      }
    });

    return this.getValidationResult();
  }

  /**
   * Validate individual node structure
   * @param {Object} node - Node data
   * @param {number} index - Node index in array
   * @param {Set} nodeIds - Set of existing node IDs
   */
  validateNode(node, index, nodeIds) {
    const nodeRef = `Node ${index}`;

    // Required fields
    if (!node.id) {
      this.errors.push(`${nodeRef}: Missing required field 'id'`);
      return;
    }

    if (typeof node.id !== 'string') {
      this.errors.push(`${nodeRef}: 'id' must be a string`);
    }

    if (nodeIds.has(node.id)) {
      this.errors.push(`${nodeRef}: Duplicate node ID '${node.id}'`);
    } else {
      nodeIds.add(node.id);
    }

    if (!node.label) {
      this.errors.push(`${nodeRef} (${node.id}): Missing required field 'label'`);
    }

    if (!node.type && !node.layer) {
      this.warnings.push(`${nodeRef} (${node.id}): Missing both 'type' and 'layer' fields, will use defaults`);
    }

    if (!node.layer) {
      this.warnings.push(`${nodeRef} (${node.id}): Missing 'layer' field, may affect layer functionality`);
    }

    // Optional field validation
    if (node.size !== undefined && (typeof node.size !== 'number' || node.size <= 0)) {
      this.errors.push(`${nodeRef} (${node.id}): 'size' must be a positive number`);
    }

    if (node.timespan) {
      this.validateTimespan(node.timespan, `${nodeRef} (${node.id})`);
    }

    if (node.links && !Array.isArray(node.links)) {
      this.errors.push(`${nodeRef} (${node.id}): 'links' must be an array`);
    }

    if (node.position && (!node.position.x || !node.position.y)) {
      this.warnings.push(`${nodeRef} (${node.id}): 'position' should have both x and y coordinates`);
    }

    // Validate experience level
    if (node.experienceLevel && !['experienced', 'interested'].includes(node.experienceLevel)) {
      this.warnings.push(`${nodeRef} (${node.id}): 'experienceLevel' should be 'experienced' or 'interested'`);
    }

    // Validate audience field
    if (node.audience) {
      const validAudiences = ['general', 'technical', 'current'];
      if (Array.isArray(node.audience)) {
        node.audience.forEach(aud => {
          if (!validAudiences.includes(aud)) {
            this.warnings.push(`${nodeRef} (${node.id}): Invalid audience '${aud}', should be one of: ${validAudiences.join(', ')}`);
          }
        });
      } else if (typeof node.audience === 'string') {
        if (!validAudiences.includes(node.audience)) {
          this.warnings.push(`${nodeRef} (${node.id}): Invalid audience '${node.audience}', should be one of: ${validAudiences.join(', ')}`);
        }
      } else {
        this.errors.push(`${nodeRef} (${node.id}): 'audience' must be a string or array of strings`);
      }
    }

    // Validate parent_node reference
    if (node.parent_node && typeof node.parent_node !== 'string') {
      this.errors.push(`${nodeRef} (${node.id}): 'parent_node' must be a string node ID`);
    }

    // Validate subnode field
    if (node.subnode && typeof node.subnode !== 'boolean') {
      this.errors.push(`${nodeRef} (${node.id}): 'subnode' must be a boolean value`);
    }
  }

  /**
   * Validate individual link structure
   * @param {Object} link - Link data
   * @param {number} index - Link index in array
   * @param {Set} nodeIds - Set of valid node IDs
   */
  validateLink(link, index, nodeIds) {
    const linkRef = `Link ${index}`;

    // Required fields
    if (!link.source) {
      this.errors.push(`${linkRef}: Missing required field 'source'`);
      return;
    }

    if (!link.target) {
      this.errors.push(`${linkRef}: Missing required field 'target'`);
      return;
    }

    // Check if source and target nodes exist
    if (!nodeIds.has(link.source)) {
      this.errors.push(`${linkRef}: Source node '${link.source}' does not exist`);
    }

    if (!nodeIds.has(link.target)) {
      this.errors.push(`${linkRef}: Target node '${link.target}' does not exist`);
    }

    // Self-loops warning
    if (link.source === link.target) {
      this.warnings.push(`${linkRef}: Self-loop detected (${link.source} -> ${link.target})`);
    }

    // Optional field validation
    if (link.strength !== undefined) {
      if (typeof link.strength !== 'number' || link.strength < 0 || link.strength > 1) {
        this.errors.push(`${linkRef}: 'strength' must be a number between 0 and 1`);
      }
    }
  }

  /**
   * Validate timespan structure
   * @param {Object} timespan - Timespan data
   * @param {string} context - Context for error messages
   */
  validateTimespan(timespan, context) {
    if (typeof timespan !== 'object') {
      this.errors.push(`${context}: 'timespan' must be an object`);
      return;
    }

    if (timespan.start !== undefined) {
      if (!Number.isInteger(timespan.start) || timespan.start < 1900 || timespan.start > 2100) {
        this.errors.push(`${context}: 'timespan.start' must be a valid year (1900-2100)`);
      }
    }

    if (timespan.end !== undefined && timespan.end !== null) {
      if (!Number.isInteger(timespan.end) || timespan.end < 1900 || timespan.end > 2100) {
        this.errors.push(`${context}: 'timespan.end' must be a valid year (1900-2100) or null`);
      }

      if (timespan.start && timespan.end && timespan.end < timespan.start) {
        this.errors.push(`${context}: 'timespan.end' cannot be before 'timespan.start'`);
      }
    }
  }

  /**
   * Validate configuration object
   * @param {Object} config - Configuration object
   * @returns {Object} - Validation result
   */
  validateConfig(config) {
    this.errors = [];
    this.warnings = [];

    if (!config) {
      this.errors.push('Configuration is null or undefined');
      return this.getValidationResult();
    }

    // Validate dimensions
    if (config.width !== undefined && (typeof config.width !== 'number' || config.width <= 0)) {
      this.errors.push('width must be a positive number');
    }

    if (config.height !== undefined && (typeof config.height !== 'number' || config.height <= 0)) {
      this.errors.push('height must be a positive number');
    }

    // Validate colors
    const colorFields = ['background', 'textColor', 'linkColor'];
    colorFields.forEach(field => {
      if (config[field] !== undefined && !this.isValidColor(config[field])) {
        this.warnings.push(`${field} may not be a valid CSS color`);
      }
    });

    // Validate layers
    if (config.layers) {
      if (!Array.isArray(config.layers)) {
        this.errors.push('layers must be an array');
      } else {
        config.layers.forEach((layer, index) => {
          this.validateLayer(layer, index);
        });
      }
    }

    // Validate timeline
    if (config.timeline) {
      this.validateTimelineConfig(config.timeline);
    }

    return this.getValidationResult();
  }

  /**
   * Validate layer configuration
   * @param {Object} layer - Layer configuration
   * @param {number} index - Layer index
   */
  validateLayer(layer, index) {
    const layerRef = `Layer ${index}`;

    if (!layer.id) {
      this.errors.push(`${layerRef}: Missing required field 'id'`);
    }

    if (!layer.name) {
      this.errors.push(`${layerRef}: Missing required field 'name'`);
    }

    if (!layer.color) {
      this.warnings.push(`${layerRef}: Missing 'color' field`);
    } else if (!this.isValidColor(layer.color)) {
      this.warnings.push(`${layerRef}: 'color' may not be a valid CSS color`);
    }
  }

  /**
   * Validate timeline configuration
   * @param {Object} timeline - Timeline configuration
   */
  validateTimelineConfig(timeline) {
    if (typeof timeline !== 'object') {
      this.errors.push('timeline must be an object');
      return;
    }

    if (timeline.start !== undefined) {
      if (!Number.isInteger(timeline.start)) {
        this.errors.push('timeline.start must be an integer year');
      }
    }

    if (timeline.end !== undefined) {
      if (!Number.isInteger(timeline.end)) {
        this.errors.push('timeline.end must be an integer year');
      }
    }

    if (timeline.start && timeline.end && timeline.end < timeline.start) {
      this.errors.push('timeline.end cannot be before timeline.start');
    }
  }

  /**
   * Basic CSS color validation
   * @param {string} color - Color string to validate
   * @returns {boolean} - Whether color appears valid
   */
  isValidColor(color) {
    if (typeof color !== 'string') return false;
    
    // Check for common CSS color formats
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    const rgbRegex = /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/;
    const rgbaRegex = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[01]?\.?\d*\s*\)$/;
    const namedColors = ['red', 'blue', 'green', 'black', 'white', 'yellow', 'purple', 'orange', 'pink', 'brown', 'gray', 'grey'];

    return hexRegex.test(color) || 
           rgbRegex.test(color) || 
           rgbaRegex.test(color) || 
           namedColors.includes(color.toLowerCase());
  }

  /**
   * Get validation result summary
   * @returns {Object} - Validation result with isValid, errors, warnings
   */
  getValidationResult() {
    return {
      isValid: this.errors.length === 0,
      errors: [...this.errors],
      warnings: [...this.warnings],
      hasWarnings: this.warnings.length > 0
    };
  }

  /**
   * Static method for quick validation
   * @param {Object} data - Data to validate
   * @returns {Object} - Validation result
   */
  static validate(data) {
    const validator = new DataValidator();
    return validator.validateGraphData(data);
  }

  /**
   * Static method for quick config validation
   * @param {Object} config - Config to validate
   * @returns {Object} - Validation result
   */
  static validateConfiguration(config) {
    const validator = new DataValidator();
    return validator.validateConfig(config);
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataValidator;
} else if (typeof window !== 'undefined') {
  window.DataValidator = DataValidator;
}