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
      miniMapManager: null
    };

    // State management
    this.state = {
      currentLayer: null,
      currentAudience: 'all',
      isTimelineActive: false,
      currentTimelinePosition: null,
      isInitialized: false
    };

    // Event handlers for external API
    this.eventHandlers = {};

    // Initialize the graph
    this.init();
  }

  /**
   * Validate and process input data
   * @param {Object} data - Input data with nodes and links
   */
  validateAndProcessData(data) {
    // Use DataValidator if available, otherwise basic validation
    if (typeof DataValidator !== 'undefined') {
      // Create a copy of data with string IDs for validation
      const dataForValidation = {
        nodes: [...data.nodes],
        links: data.links.map(link => ({
          ...link,
          source: typeof link.source === 'object' ? link.source.id : link.source,
          target: typeof link.target === 'object' ? link.target.id : link.target
        }))
      };
      const validation = DataValidator.validate(dataForValidation);      if (!validation.isValid) {
        console.warn('Data validation warnings:', validation.errors);
        if (validation.errors.length > 0) {
          throw new Error(`Data validation failed: ${validation.errors[0]}`);
        }
      }
    } else {
      // Basic validation fallback
      if (!data || !data.nodes || !data.links) {
        throw new Error('Data must contain nodes and links arrays');
      }
    }

    this.originalData = data;
    this.allNodes = [...data.nodes];
    this.allLinks = [...data.links];
    this.nodes = [...data.nodes];
    this.links = [...data.links];
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
        clickToNavigate: true
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
        this.emit('nodeClick', data);
      });

      this.components.interactionManager.on('linkClick', (data) => {
        this.emit('linkClick', data);
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
  }

  /**
   * Handle zoom events
   * @param {Object} event - D3 zoom event
   */
  handleZoom(event) {
    this.components.coordinateTransform.updateTransform(event.transform);
    this.mainGroup.attr('transform', event.transform);
    
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
  }

  /**
   * Render links
   */
  renderLinks() {
    const linkSelection = this.linkGroup
      .selectAll('.link')
      .data(this.links, d => `${this.getLinkSourceId(d)}-${this.getLinkTargetId(d)}`);

    linkSelection.exit().remove();

    linkSelection.enter()
      .append('line')
      .attr('class', 'link')
      .attr('stroke', this.config.theme.mutedColor)
      .attr('stroke-width', d => Math.sqrt(d.strength || 0.5) * 2)
      .attr('stroke-opacity', 0.6);
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
    
    // Get base color from type, layer, or default
    if (node.type && this.config.nodeColors[node.type]) {
      baseColor = this.config.nodeColors[node.type];
    } else if (node.layer && this.config.nodeColors[node.layer]) {
      baseColor = this.config.nodeColors[node.layer];
    } else if (node.color) {
      baseColor = node.color;
    } else {
      baseColor = this.config.theme.primaryColor;
    }
    
    // Default to "experienced" if no experienceLevel specified
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
    // Default to "experienced" if no experienceLevel specified
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
    // Default to "experienced" if no experienceLevel specified
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
      .attr('font-size', this.config.theme.fontSizeSmall + 'px')
      .attr('fill', this.config.theme.textPrimary)
      .attr('pointer-events', 'none')
      .style('user-select', 'none')
      .text(d => d.label);
  }

  /**
   * Helper to get link source ID
   */
  getLinkSourceId(link) {
    return typeof link.source === 'object' ? link.source.id : link.source;
  }

  /**
   * Helper to get link target ID
   */
  getLinkTargetId(link) {
    return typeof link.target === 'object' ? link.target.id : link.target;
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

    this.labelGroup.selectAll('.label')
      .attr('x', d => d.x)
      .attr('y', d => d.y + (d.size || 10) + 18);

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
   * Start the force simulation
   */
  startSimulation() {
    if (this.components.forceSimulation) {
      // Initialize positions before starting simulation
      this.initializeLayerBasedPositions();
      this.components.forceSimulation.updateData(this.nodes, this.links);
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
   * @param {string} audienceId - 'all', 'general', 'technical', or 'current_focus'
   */
  setAudienceFilter(audienceId) {
    this.state.currentAudience = audienceId;
    
    if (this.components.visualEffectsManager) {
      this.components.visualEffectsManager.applyAudienceEffects(audienceId, this.nodes);
    }
    
    this.updateLabelsForAudience(audienceId);
    
    this.emit('audienceChange', { audience: audienceId });
  }

  /**
   * Update label visibility based on audience and layer
   * @param {string} audienceId - Current audience filter
   */
  updateLabelsForAudience(audienceId) {
    if (!this.labelGroup) return;
    
    this.labelGroup.selectAll('.label')
      .style('opacity', d => {
        // Hide labels for subnodes when "All Layers" is active and no specific layer is selected
        if (this.state.currentLayer === null && d.subnode) {
          return 0;
        }
        
        // Show/hide based on audience filter
        if (audienceId === 'all') {
          return 1;
        }
        
        const nodeAudience = d.audience || ['general'];
        return nodeAudience.includes(audienceId) ? 1 : 0;
      });
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
}