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
        linkDistance: 120,
        linkStrength: 0.3,
        chargeStrength: -400,
        chargeDistanceMax: 500,
        collisionRadius: 25
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
   * Render nodes
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
      .attr('stroke', this.config.theme.textPrimary)
      .attr('stroke-width', 2)
      .style('cursor', 'pointer');
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
   * Get node color based on configuration
   * @param {Object} node - Node object
   * @returns {string} - Color value
   */
  getNodeColor(node) {
    // Check for node colors by type first, then layer, then default
    if (node.type && this.config.nodeColors[node.type]) {
      return this.config.nodeColors[node.type];
    }
    if (node.layer && this.config.nodeColors[node.layer]) {
      return this.config.nodeColors[node.layer];
    }
    if (node.color) {
      return node.color;
    }
    return this.config.theme.primaryColor;
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
   * Start the force simulation
   */
  startSimulation() {
    if (this.components.forceSimulation) {
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