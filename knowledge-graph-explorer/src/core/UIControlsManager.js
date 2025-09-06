/**
 * UI Controls Manager for Knowledge Graph Explorer
 * Handles timeline controls, layer buttons, info panels, and other UI elements
 */
class UIControlsManager {
  constructor(config = {}) {
    this.config = {
      showTimeline: true,
      showLayerControls: true,
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
    this.selectedNode = null;

    // DOM elements
    this.uiContainer = null;
    this.timelineContainer = null;
    this.layerContainer = null;
    this.infoPanel = null;
    this.timelineSlider = null;

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

    console.log('createUIStructure called');
    console.log('showLayerControls:', this.config.showLayerControls);
    console.log('layers.length:', this.layers.length);
    console.log('layers:', this.layers);

    // Create control panels as overlays
    if (this.config.showLayerControls && this.layers.length > 0) {
      this.createLayerControls();
    }

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
    console.log('Creating layer controls with layers:', this.layers);
    console.log('Config showLayerControls:', this.config.showLayerControls);
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
   * Create timeline controls
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
      padding: 12px 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      z-index: 100;
      min-width: 300px;
    `;

    // Title and current year display
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-size: 12px;
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
      margin: 5px 0;
    `;

    // Timeline labels
    const labels = document.createElement('div');
    labels.style.cssText = `
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #666;
      margin-top: 4px;
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
      margin-top: 8px;
      padding: 4px 8px;
      border: 1px solid #ddd;
      background: white;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
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
   * Create info panel for displaying node/link details
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
      max-width: 250px;
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
    console.log('showNodeInfo called with:', node);
  
    if (!this.infoPanel) {
      console.error('Info panel not found!');
      return;
    }

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
      timespan.textContent = `${node.timespan.start} - ${node.timespan.end || 'present'}`;
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
    console.log('Info panel should now be visible');
  }

  /**
   * Create the "Related To" section showing connected nodes
   */
  createRelatedNodesSection(node) {
    // Find all links connected to this node
    const connectedLinks = this.graph.links.filter(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      return sourceId === node.id || targetId === node.id;
    });

    if (connectedLinks.length === 0) {
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

    // Create clickable links for each connected node
    connectedLinks.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    
      // Get the connected node (not the current node)
      const connectedNodeId = sourceId === node.id ? targetId : sourceId;
      const connectedNode = this.graph.nodes.find(n => n.id === connectedNodeId);
    
      if (connectedNode) {
        const nodeLink = document.createElement('div');
        nodeLink.style.cssText = `
          display: inline-block;
          margin: 2px 4px 2px 0;
          padding: 3px 8px;
          background: #f0f0f0;
          border: 1px solid #ddd;
          border-radius: 12px;
          font-size: 10px;
          cursor: pointer;
          transition: background-color 0.2s ease;
        `;
        nodeLink.textContent = connectedNode.label;
      
        // Hover effects
        nodeLink.addEventListener('mouseenter', () => {
          nodeLink.style.backgroundColor = '#e0e0e0';
        });
      
        nodeLink.addEventListener('mouseleave', () => {
          nodeLink.style.backgroundColor = '#f0f0f0';
        });
      
        // Click to navigate to the connected node
        nodeLink.addEventListener('click', () => {
          this.panToNode(connectedNode);
          this.hideInfo(); // Hide current info panel
          // Show info for the new node after a short delay
          setTimeout(() => {
            this.showNodeInfo(connectedNode);
          }, 300);
        });
      
        section.appendChild(nodeLink);
      }
    });

    return section;
  }

  /**
   * Pan the graph to focus on a specific node
   */
  panToNode(node) {
    if (!this.graph || !node.x || !node.y) return;
  
    // Use the graph's focusOnNode method if available
    if (typeof this.graph.focusOnNode === 'function') {
      this.graph.focusOnNode(node.id);
    } else {
      // Fallback: trigger a navigation event
      console.log('Panning to node:', node.label);
      // You could implement custom panning logic here if needed
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