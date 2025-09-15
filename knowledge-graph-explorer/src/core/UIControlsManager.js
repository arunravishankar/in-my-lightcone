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
      max-width: 220px;
      max-height: 350px;
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
        color: white;
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

    // Clear and populate
    this.infoPanel.innerHTML = '';
    this.infoPanel.appendChild(closeBtn);
    this.infoPanel.appendChild(title);
    this.infoPanel.appendChild(description);
    this.infoPanel.appendChild(details);
    this.infoPanel.appendChild(relatedSection);
  
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
}