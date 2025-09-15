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
}