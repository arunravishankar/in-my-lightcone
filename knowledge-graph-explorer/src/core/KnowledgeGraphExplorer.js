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
   * Generate links from parent_node/parent_nodes relationships
   * @returns {Array} - Array of link objects
   */
  generateLinksFromParents() {
    const links = [];

    this.nodes.forEach(node => {
      // Support both parent_node (single) and parent_nodes (array) for backward compatibility
      let parents = [];

      // Check for single parent (backward compatibility)
      if (node.parent_node && node.parent_node !== null) {
        // parent_node can be either a string or an array
        parents = Array.isArray(node.parent_node) ? node.parent_node : [node.parent_node];
      }
      // Check for multiple parents (new format)
      else if (node.parent_nodes && node.parent_nodes !== null) {
        if (Array.isArray(node.parent_nodes)) {
          parents = node.parent_nodes;
        } else {
          // If parent_nodes is not an array, treat it as a single parent
          parents = [node.parent_nodes];
        }
      }

      // Create links for all parents
      parents.forEach(parentId => {
        // Find the parent node
        const parentNode = this.nodes.find(n => n.id === parentId);
        if (parentNode) {
          links.push({
            source: parentId,
            target: node.id,
            strength: 0.5, // Default strength
            id: `${parentId}-${node.id}`
          });
        }
      });
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
        // Support both parent_node and parent_nodes
        let parents = [];
        if (node.parent_node && node.parent_node !== null) {
          // parent_node can be either a string or an array
          parents = Array.isArray(node.parent_node) ? node.parent_node : [node.parent_node];
        } else if (node.parent_nodes && node.parent_nodes !== null) {
          parents = Array.isArray(node.parent_nodes) ? node.parent_nodes : [node.parent_nodes];
        }

        parents.forEach(parentId => {
          tempLinks.push({
            source: parentId,
            target: node.id
          });
        });
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
      
      // Force simulation settings - must be provided by Python config from YAML
      simulation: {},
      
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

    // Apply initial audience filter after initialization to show current focus view by default
    this.setAudienceFilter('current_focus');

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
      .style('opacity', 0) // Start invisible
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

    // Update label positions - use smart layout only when a node is selected, otherwise use default positioning
    if (this.components.labelLayoutManager && this.config.features.smartLabelPositioning && this.state.selectedNode) {
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

    // Trigger smart label positioning if a node is selected
    if (node && this.components.labelLayoutManager && this.config.features.smartLabelPositioning) {
      // Give a small delay to let the label visibility updates complete
      setTimeout(() => {
        this.components.labelLayoutManager.updateData(this.nodes, this.labelGroup.selectAll('.label'));
      }, 50);
    }
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