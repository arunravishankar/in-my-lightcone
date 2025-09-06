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
    this.updateContinuousHoverEffects(mousePos);
  }

  /**
   * Handle mouse leaving the SVG area
   * @param {Event} event - Mouse event
   */
  handleMouseLeave(event) {
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
}