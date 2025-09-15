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
}