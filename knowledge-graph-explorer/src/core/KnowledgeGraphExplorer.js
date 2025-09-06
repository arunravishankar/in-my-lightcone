class KnowledgeGraphExplorer {
  constructor(container, data, config = {}) {
    this.container = typeof container === 'string' 
      ? document.querySelector(container) 
      : container;
    
    if (!this.container) {
      throw new Error('Container element not found');
    }

    // Default configuration with theme support
    this.config = {
        width: 900,
        height: 600,
        background: '#ffffff',
        textColor: '#212529',
        linkColor: '#868e96',
        nodeColors: config.nodeColors || {},
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
            shadowColor: 'rgba(0, 0, 0, 0.15)',
            ...config.theme
        },
        layers: config.layers || [],
        timeline: config.timeline || { start: 2000, end: 2024 },
        showLegend: true,
        showTooltip: true,
        showMiniMap: true,
        showTimeline: true,
        hoverRadius: 50,
        maxHoverScale: 1.3,
        ...config
    };

    // Data storage
    this.originalData = data;
    this.allNodes = [...data.nodes];
    this.allLinks = [...data.links];
    this.nodes = [...data.nodes];
    this.links = [...data.links];
    
    // State management
    this.currentLayer = null;
    this.currentTimelinePosition = null;
    this.isTimelineActive = false;
    this.transform = d3.zoomIdentity;
    this.hoveredNode = null;
    this.nodeDistances = new Map();
    this.isInLayerMode = false;
    
    // Timeline state
    this.timelineRange = this.calculateTimelineRange();
    
    // Event handlers
    this.eventHandlers = {};
    
    // Initialize the visualization
    this.init();
  }

  init() {
    this.setupContainer();
    this.setupSVG();
    this.setupMiniMap();
    this.setupForceSimulation();
    this.setupZoomBehavior();
    this.setupMouseTracking();
    this.render();
    this.startSimulation();
  }

  setupContainer() {
    this.container.innerHTML = '';
    
    this.container.style.position = 'relative';
    this.container.style.width = this.config.width + 'px';
    this.container.style.height = this.config.height + 'px';
    this.container.style.backgroundColor = this.config.theme.backgroundColor;
    this.container.style.overflow = 'hidden';
    this.container.style.borderRadius = this.config.theme.borderRadius + 'px';
    this.container.style.fontFamily = this.config.theme.fontFamily;

    const restartBtn = document.createElement('button');
    restartBtn.className = 'restart-btn';
    restartBtn.innerHTML = '↻';
    restartBtn.onclick = () => this.restartSimulation();
    restartBtn.title = 'Restart Simulation';
    this.container.appendChild(restartBtn);
  }

  setupSVG() {
    // Create main SVG
    this.svg = d3.select(this.container)
      .append('svg')
      .attr('width', this.config.width)
      .attr('height', this.config.height);

    // Create main group for zoom/pan
    this.mainGroup = this.svg.append('g')
      .attr('class', 'main-group');

    // Create groups for different elements (order matters for z-index)
    this.linkGroup = this.mainGroup.append('g').attr('class', 'links');
    this.nodeGroup = this.mainGroup.append('g').attr('class', 'nodes');
    this.labelGroup = this.mainGroup.append('g').attr('class', 'labels');
  }

  setupMiniMap() {
    if (!this.config.showMiniMap) return;

    // Create mini-map container
    const miniMapContainer = d3.select(this.container)
      .append('div')
      .attr('class', 'mini-map')
      .style('position', 'absolute')
      .style('bottom', '10px')
      .style('left', '10px')
      .style('width', '150px')
      .style('height', '120px')
      .style('background-color', this.config.theme.surfaceColor + 'E6') // 90% opacity
      .style('border', `1px solid ${this.config.theme.primaryColor}`)
      .style('border-radius', this.config.theme.borderRadius + 'px')
      .style('overflow', 'hidden')
      .style('cursor', 'pointer')
      .style('backdrop-filter', 'blur(5px)');

    // Create mini-map SVG
    this.miniMapSvg = miniMapContainer
      .append('svg')
      .attr('width', 150)
      .attr('height', 120);

    // Create mini-map groups
    this.miniMapMain = this.miniMapSvg.append('g');
    this.miniMapLinks = this.miniMapMain.append('g').attr('class', 'mini-links');
    this.miniMapNodes = this.miniMapMain.append('g').attr('class', 'mini-nodes');
    
    // Create viewport indicator
    this.viewportIndicator = this.miniMapSvg.append('rect')
      .attr('class', 'viewport-indicator')
      .attr('fill', 'none')
      .attr('stroke', this.config.theme.primaryColor)
      .attr('stroke-width', 2)
      .attr('opacity', 0.7);

    // Add click handler for mini-map navigation
    this.miniMapSvg.on('click', (event) => {
      const [x, y] = d3.pointer(event);
      this.navigateToMiniMapPosition(x, y);
    });
  }

  setupMouseTracking() {
    this.svg.on('mousemove', (event) => {
      // Get mouse position relative to the SVG
      const [svgX, svgY] = d3.pointer(event, this.svg.node());
    
      // Transform to graph coordinates manually
      const graphX = (svgX - this.transform.x) / this.transform.k;
      const graphY = (svgY - this.transform.y) / this.transform.k;
    
      this.updateContinuousHoverEffects({ x: graphX, y: graphY });
    });

    this.svg.on('mouseleave', () => {
      this.resetNodeEffects();
    });
  }

  updateContinuousHoverEffects(mousePosition) {
    if (this.isInLayerMode) return;

    // Find the closest node within hover radius
    let closestNode = null;
    let closestDistance = Infinity;

    this.nodes.forEach(node => {
      const dx = node.x - mousePosition.x;
      const dy = node.y - mousePosition.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
    
      // Prioritize nodes that the mouse is directly over
      const nodeRadius = (node.size || 10);
      const isDirectlyOver = distance <= nodeRadius;
    
      if (isDirectlyOver && distance < closestDistance) {
        closestNode = node;
        closestDistance = distance;
      } else if (!closestNode && distance <= this.config.hoverRadius) {
        closestNode = node;
        closestDistance = distance;
      }
    });

    if (!closestNode) {
      this.resetNodeEffects();
      return;
    }

    this.applyContinuousHoverEffects(closestNode, closestDistance, mousePosition);
  }

  applyContinuousHoverEffects(centerNode, centerDistance, mousePosition) {
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
      
        let baseScale;
        if (graphDistance === 1) baseScale = 0.9;
        else if (graphDistance === 2) baseScale = 0.7;
        else if (graphDistance === 3) baseScale = 0.5;
        else baseScale = 0.3;
      
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
  
    this.applyNodeTransitions(nodeEffects, 100);
  }

  setupForceSimulation() {
    const centerX = this.config.width / 2;
    const centerY = this.config.height / 2;

    this.simulation = d3.forceSimulation(this.nodes)
      .force('link', d3.forceLink(this.links)
        .id(d => d.id)
        .distance(d => 120)
        .strength(d => d.strength || 0.3))
      .force('charge', d3.forceManyBody()
        .strength(-400)
        .distanceMax(500))
      .force('center', d3.forceCenter(centerX, centerY))
      .force('collision', d3.forceCollide()
        .radius(d => (d.size || 10) + 25))
      .on('tick', () => this.updatePositions());
  }

  setupZoomBehavior() {
    this.zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        this.transform = event.transform;
        this.mainGroup.attr('transform', this.transform);
        this.updateMiniMapViewport();
        this.emit('zoom', { transform: this.transform });
      });

    this.svg.call(this.zoom);
    
  }

  render() {
    this.renderLinks();
    this.renderNodes();
    this.renderLabels();
    this.renderMiniMap();
  }

  renderLinks() {
    const linkSelection = this.linkGroup
      .selectAll('line')
      .data(this.links, d => `${d.source.id || d.source}-${d.target.id || d.target}`);

    linkSelection.exit().remove();

    const linkEnter = linkSelection.enter()
      .append('line')
      .attr('stroke', this.config.linkColor)
      .attr('stroke-width', d => Math.sqrt(d.strength || 0.5) * 2)
      .attr('stroke-opacity', 0.6)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        this.emit('linkClick', { link: d, event });
      });

    linkEnter.merge(linkSelection);
    this.linkElements = this.linkGroup.selectAll('line');
  }

  renderNodes() {
    const nodeSelection = this.nodeGroup
      .selectAll('circle')
      .data(this.nodes, d => d.id);

    nodeSelection.exit().remove();

    const nodeEnter = nodeSelection.enter()
      .append('circle')
      .attr('r', d => d.size || 10)
      .attr('fill', d => this.getNodeColor(d))
      .attr('stroke', this.config.theme.textPrimary)
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .call(this.setupNodeInteractions.bind(this));

    nodeEnter.merge(nodeSelection);
    this.nodeElements = this.nodeGroup.selectAll('circle');
  }

  getNodeColor(node) {
    // Use configurable node colors instead of hardcoded ones
    return this.config.nodeColors[node.type] || this.config.theme.mutedColor;
  }

  renderLabels() {
    const labelSelection = this.labelGroup
      .selectAll('text')
      .data(this.nodes, d => d.id);

    labelSelection.exit().remove();

    const labelEnter = labelSelection.enter()
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-family', this.config.theme.fontFamily)
      .attr('font-size', this.config.theme.fontSizeSmall + 'px')
      .attr('fill', this.config.theme.textPrimary)
      .attr('pointer-events', 'none')
      .style('user-select', 'none')
      .text(d => d.label);

    labelEnter.merge(labelSelection);
    this.labelElements = this.labelGroup.selectAll('text');
  }

  renderMiniMap() {
    if (!this.config.showMiniMap || !this.miniMapSvg) return;

    const bounds = this.getBounds();
    if (!bounds) return;

    const miniMapWidth = 150;
    const miniMapHeight = 120;
    const padding = 10;

    const scaleX = (miniMapWidth - 2 * padding) / bounds.width;
    const scaleY = (miniMapHeight - 2 * padding) / bounds.height;
    const scale = Math.min(scaleX, scaleY, 0.3);

    const offsetX = (miniMapWidth - bounds.width * scale) / 2 - bounds.minX * scale;
    const offsetY = (miniMapHeight - bounds.height * scale) / 2 - bounds.minY * scale;

    // Render mini-map links
    const miniLinkSelection = this.miniMapLinks
      .selectAll('line')
      .data(this.links, d => `${d.source.id || d.source}-${d.target.id || d.target}`);

    miniLinkSelection.exit().remove();

    miniLinkSelection.enter()
      .append('line')
      .attr('stroke', this.config.linkColor)
      .attr('stroke-width', 0.5)
      .attr('stroke-opacity', 0.4)
      .merge(miniLinkSelection)
      .attr('x1', d => offsetX + d.source.x * scale)
      .attr('y1', d => offsetY + d.source.y * scale)
      .attr('x2', d => offsetX + d.target.x * scale)
      .attr('y2', d => offsetY + d.target.y * scale);

    // Render mini-map nodes
    const miniNodeSelection = this.miniMapNodes
      .selectAll('circle')
      .data(this.nodes, d => d.id);

    miniNodeSelection.exit().remove();

    miniNodeSelection.enter()
      .append('circle')
      .attr('r', 2)
      .attr('fill', d => this.getNodeColor(d))
      .attr('stroke', 'none')
      .merge(miniNodeSelection)
      .attr('cx', d => offsetX + d.x * scale)
      .attr('cy', d => offsetY + d.y * scale);

    this.miniMapScale = scale;
    this.miniMapOffsetX = offsetX;
    this.miniMapOffsetY = offsetY;

    this.updateMiniMapViewport();
  }

  updateMiniMapViewport() {
    if (!this.config.showMiniMap || !this.viewportIndicator || !this.miniMapScale) return;

    const miniMapWidth = 150;
    const miniMapHeight = 120;

    const viewportWidth = this.config.width / this.transform.k / this.miniMapScale;
    const viewportHeight = this.config.height / this.transform.k / this.miniMapScale;

    const viewportX = this.miniMapOffsetX - this.transform.x / this.transform.k * this.miniMapScale;
    const viewportY = this.miniMapOffsetY - this.transform.y / this.transform.k * this.miniMapScale;

    this.viewportIndicator
      .attr('x', Math.max(0, Math.min(miniMapWidth - viewportWidth, viewportX)))
      .attr('y', Math.max(0, Math.min(miniMapHeight - viewportHeight, viewportY)))
      .attr('width', Math.min(viewportWidth, miniMapWidth))
      .attr('height', Math.min(viewportHeight, miniMapHeight));
  }

  navigateToMiniMapPosition(miniX, miniY) {
    if (!this.miniMapScale) return;

    const graphX = (miniX - this.miniMapOffsetX) / this.miniMapScale;
    const graphY = (miniY - this.miniMapOffsetY) / this.miniMapScale;

    const newTransform = d3.zoomIdentity
      .translate(this.config.width / 2 - graphX * this.transform.k,
                 this.config.height / 2 - graphY * this.transform.k)
      .scale(this.transform.k);

    this.svg.transition()
      .duration(500)
      .call(this.zoom.transform, newTransform);
  }

  getBounds() {
    if (this.nodes.length === 0) return null;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    this.nodes.forEach(node => {
      if (node.x < minX) minX = node.x;
      if (node.x > maxX) maxX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.y > maxY) maxY = node.y;
    });

    return {
      minX, maxX, minY, maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  setupNodeInteractions(selection) {
    selection
      .on('click', (event, d) => {
        event.stopPropagation();
        this.emit('nodeClick', { node: d, event });
      });
  }

  updatePositions() {
    if (this.linkElements) {
      this.linkElements
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
    }

    if (this.nodeElements) {
      this.nodeElements
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);
    }

    if (this.labelElements) {
      this.labelElements
        .attr('x', d => d.x)
        .attr('y', d => d.y + (d.size || 10) + 18);
    }

    if (this.config.showMiniMap) {
      this.renderMiniMap();
    }
  }

  focusOnNode(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    // Calculate transform to center the node
    const scale = 1.5; // Zoom level
    const centerX = this.config.width / 2;
    const centerY = this.config.height / 2;
    
    const newTransform = d3.zoomIdentity
      .translate(centerX - node.x * scale, centerY - node.y * scale)
      .scale(scale);
    
    // Animate to the node
    this.svg.transition()
      .duration(750)
      .call(this.zoom.transform, newTransform);
    
    // Update info panel
    showNodeInfo(node); // Call the existing function in your HTML
  }

  // ====== TIMELINE SYSTEM ======
  
  calculateTimelineRange() {
    if (this.allNodes.length === 0) return { min: 2000, max: 2024 };
    
    let minYear = Infinity;
    let maxYear = -Infinity;
    
    this.allNodes.forEach(node => {
      if (node.timespan) {
        if (node.timespan.start) {
          minYear = Math.min(minYear, node.timespan.start);
        }
        if (node.timespan.end) {
          maxYear = Math.max(maxYear, node.timespan.end);
        } else {
          maxYear = Math.max(maxYear, new Date().getFullYear());
        }
      }
    });
    
    return {
      min: minYear === Infinity ? 2000 : minYear,
      max: maxYear === -Infinity ? 2024 : maxYear
    };
  }
  
  setTimelinePosition(year) {
    this.currentTimelinePosition = year;
    this.isTimelineActive = year !== null;
    
    this.applyTimelineFilter();
    this.emit('timelineChange', { 
      year: year, 
      isActive: this.isTimelineActive 
    });
  }
  
  enableAllTimes() {
    this.setTimelinePosition(null);
  }
  
  isNodeActiveAtTime(node, year) {
    if (!node.timespan || year === null) return true;
    
    const start = node.timespan.start;
    const end = node.timespan.end;
    
    if (start && year < start) return false;
    if (end && year > end) return false;
    
    return true;
  }
  
  applyTimelineFilter() {
    if (!this.isTimelineActive) {
      this.nodes = [...this.allNodes];
      this.links = [...this.allLinks];
    } else {
      this.nodes = this.allNodes.filter(node => 
        this.isNodeActiveAtTime(node, this.currentTimelinePosition)
      );
      
      const activeNodeIds = new Set(this.nodes.map(n => n.id));
      this.links = this.allLinks.filter(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        return activeNodeIds.has(sourceId) && activeNodeIds.has(targetId);
      });
    }
    
    this.nodeDistances.clear();
    this.render();
    this.startSimulation();
    
    if (this.isInLayerMode) {
      this.applyLayerEffects();
    }
  }

  // ====== 3D VISUAL EFFECTS ======
  
  calculateGraphDistance(sourceId, targetId) {
    if (sourceId === targetId) return 0;
    
    const cacheKey = `${sourceId}-${targetId}`;
    if (this.nodeDistances.has(cacheKey)) {
      return this.nodeDistances.get(cacheKey);
    }
    
    const adjacencyList = new Map();
    this.nodes.forEach(node => adjacencyList.set(node.id, []));
    
    this.links.forEach(link => {
      const sourceNodeId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetNodeId = typeof link.target === 'object' ? link.target.id : link.target;
      
      adjacencyList.get(sourceNodeId).push(targetNodeId);
      adjacencyList.get(targetNodeId).push(sourceNodeId);
    });
    
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
    
    const maxDistance = 999;
    this.nodeDistances.set(cacheKey, maxDistance);
    this.nodeDistances.set(`${targetId}-${sourceId}`, maxDistance);
    return maxDistance;
  }
  
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
          return effect ? effect.opacityFactor : 1;
        });
    }
    
    if (this.labelElements) {
      this.labelElements
        .transition()
        .duration(duration)
        .ease(d3.easeQuadOut)
        .style('font-size', d => {
          const effect = effectsMap.get(d.id);
          const baseFontSize = this.config.theme.fontSizeSmall;
          return `${baseFontSize * (effect ? effect.scaleFactor : 1)}px`;
        })
        .attr('opacity', d => {
          const effect = effectsMap.get(d.id);
          return effect ? effect.opacityFactor : 1;
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
          
          const sourceOpacity = sourceEffect ? sourceEffect.opacityFactor : 1;
          const targetOpacity = targetEffect ? targetEffect.opacityFactor : 1;
          
          return Math.min(sourceOpacity, targetOpacity) * 0.6;
        });
    }
  }
  
  resetNodeEffects() {
    if (this.nodeElements) {
      this.nodeElements
        .transition()
        .duration(200)
        .ease(d3.easeQuadOut)
        .attr('r', d => d.size || 10)
        .attr('opacity', 1);
    }
    
    if (this.labelElements) {
      this.labelElements
        .transition()
        .duration(200)
        .ease(d3.easeQuadOut)
        .style('font-size', this.config.theme.fontSizeSmall + 'px')
        .attr('opacity', 1);
    }
    
    if (this.linkElements) {
      this.linkElements
        .transition()
        .duration(200)
        .ease(d3.easeQuadOut)
        .attr('opacity', 0.6);
    }
  }

  // ====== LAYER SYSTEM ======
  
  setActiveLayer(layerId) {
    if (layerId === this.currentLayer) return;
    
    this.currentLayer = layerId;
    this.isInLayerMode = layerId !== null;
    
    this.applyLayerEffects();
    this.emit('layerChange', { 
      layer: layerId, 
      isInLayerMode: this.isInLayerMode 
    });
  }
  
  showAllLayers() {
    this.setActiveLayer(null);
  }
  
  applyLayerEffects() {
    if (!this.isInLayerMode) {
      this.resetLayerEffects();
      return;
    }
    
    const activeLayer = this.currentLayer;
    
    const nodeLayerEffects = this.nodes.map(node => {
      const isActiveLayer = node.layer === activeLayer;
      const hasActiveConnection = this.hasConnectionToActiveLayer(node, activeLayer);
      
      let scaleFactor, opacityFactor;
      
      if (isActiveLayer) {
        scaleFactor = 1.0;
        opacityFactor = 1.0;
      } else if (hasActiveConnection) {
        const distance = this.getMinDistanceToActiveLayer(node, activeLayer);
        if (distance === 1) {
          scaleFactor = 0.7;
          opacityFactor = 0.7;
        } else if (distance === 2) {
          scaleFactor = 0.5;
          opacityFactor = 0.5;
        } else {
          scaleFactor = 0.3;
          opacityFactor = 0.3;
        }
      } else {
        scaleFactor = 0.2;
        opacityFactor = 0.2;
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
  
  getMinDistanceToActiveLayer(node, activeLayer) {
    const activeLayerNodes = this.nodes.filter(n => n.layer === activeLayer);
    let minDistance = 999;
    
    for (const activeNode of activeLayerNodes) {
      const distance = this.calculateGraphDistance(node.id, activeNode.id);
      minDistance = Math.min(minDistance, distance);
    }
    
    return minDistance;
  }
  
  applyLayerTransitions(nodeLayerEffects) {
    const effectsMap = new Map();
    nodeLayerEffects.forEach(effect => {
      effectsMap.set(effect.nodeId, effect);
    });
    
    if (this.nodeElements) {
      this.nodeElements
        .transition()
        .duration(400)
        .ease(d3.easeQuadInOut)
        .attr('r', d => {
          const effect = effectsMap.get(d.id);
          return (d.size || 10) * (effect ? effect.scaleFactor : 1);
        })
        .attr('opacity', d => {
          const effect = effectsMap.get(d.id);
          return effect ? effect.opacityFactor : 1;
        });
    }
    
    if (this.labelElements) {
      this.labelElements
        .transition()
        .duration(400)
        .ease(d3.easeQuadInOut)
        .style('font-size', d => {
          const effect = effectsMap.get(d.id);
          const baseFontSize = this.config.theme.fontSizeSmall;
          return `${baseFontSize * (effect ? effect.scaleFactor : 1)}px`;
        })
        .attr('opacity', d => {
          const effect = effectsMap.get(d.id);
          return effect ? effect.opacityFactor : 1;
        });
    }
    
    if (this.linkElements) {
      this.linkElements
        .transition()
        .duration(400)
        .ease(d3.easeQuadInOut)
        .attr('opacity', d => {
          const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
          const targetId = typeof d.target === 'object' ? d.target.id : d.target;
          
          const sourceEffect = effectsMap.get(sourceId);
          const targetEffect = effectsMap.get(targetId);
          
          const sourceOpacity = sourceEffect ? sourceEffect.opacityFactor : 1;
          const targetOpacity = targetEffect ? targetEffect.opacityFactor : 1;
          
          return Math.min(sourceOpacity, targetOpacity) * 0.6;
        })
        .attr('stroke-width', d => {
          const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
          const targetId = typeof d.target === 'object' ? d.target.id : d.target;
          
          const sourceEffect = effectsMap.get(sourceId);
          const targetEffect = effectsMap.get(targetId);
          
          const baseWidth = Math.sqrt(d.strength || 0.5) * 2;
          const sourceScale = sourceEffect ? sourceEffect.scaleFactor : 1;
          const targetScale = targetEffect ? targetEffect.scaleFactor : 1;
          
          return baseWidth * Math.max(sourceScale, targetScale);
        });
    }
  }
  
  resetLayerEffects() {
    if (this.nodeElements) {
      this.nodeElements
        .transition()
        .duration(400)
        .ease(d3.easeQuadInOut)
        .attr('r', d => d.size || 10)
        .attr('opacity', 1);
    }
    
    if (this.labelElements) {
      this.labelElements
        .transition()
        .duration(400)
        .ease(d3.easeQuadInOut)
        .style('font-size', this.config.theme.fontSizeSmall + 'px')
        .attr('opacity', 1);
    }
    
    if (this.linkElements) {
      this.linkElements
        .transition()
        .duration(400)
        .ease(d3.easeQuadInOut)
        .attr('opacity', 0.6)
        .attr('stroke-width', d => Math.sqrt(d.strength || 0.5) * 2);
    }
  }

  startSimulation() {
    this.simulation.nodes(this.nodes);
    this.simulation.force('link').links(this.links);
    this.simulation.alpha(1).restart();
  }

  // Event system
  on(eventType, callback) {
    if (!this.eventHandlers[eventType]) {
      this.eventHandlers[eventType] = [];
    }
    this.eventHandlers[eventType].push(callback);
    return this;
  }

  emit(eventType, data) {
    if (this.eventHandlers[eventType]) {
      this.eventHandlers[eventType].forEach(callback => callback(data));
    }
  }

  // Data management
  updateData(newData) {
    this.originalData = newData;
    this.allNodes = [...newData.nodes];
    this.allLinks = [...newData.links];
    this.nodes = [...newData.nodes];
    this.links = [...newData.links];
    this.nodeDistances.clear();
    this.timelineRange = this.calculateTimelineRange();
    this.render();
    this.startSimulation();
  }

  // Public API methods
  restartSimulation() {
    this.startSimulation();
  }

  // Cleanup
  destroy() {
    if (this.simulation) {
      this.simulation.stop();
    }
    this.container.innerHTML = '';
  }
}

// ====== COORDINATE TRANSFORMATION UTILITY ======

/**
 * Handles coordinate transformations between screen space and graph space
 * Provides a clean abstraction for zoom/pan coordinate calculations
 */
class CoordinateTransform {
  constructor() {
    this.currentTransform = d3.zoomIdentity;
  }

  /**
   * Update the current transform (called during zoom events)
   */
  updateTransform(transform) {
    this.currentTransform = transform;
  }

  /**
   * Convert screen coordinates to graph coordinates
   * @param {Array} screenPosition - [x, y] in screen space
   * @param {Object} transform - Optional transform override
   * @returns {Object} - {x, y} in graph space
   */
  screenToGraph(screenPosition, transform = null) {
    const t = transform || this.currentTransform;
    const [screenX, screenY] = screenPosition;
    
    return {
      x: (screenX - t.x) / t.k,
      y: (screenY - t.y) / t.k
    };
  }

  /**
   * Convert graph coordinates to screen coordinates
   * @param {Object} graphPosition - {x, y} in graph space
   * @param {Object} transform - Optional transform override
   * @returns {Array} - [x, y] in screen space
   */
  graphToScreen(graphPosition, transform = null) {
    const t = transform || this.currentTransform;
    
    return [
      graphPosition.x * t.k + t.x,
      graphPosition.y * t.k + t.y
    ];
  }

  /**
   * Calculate Euclidean distance between two points
   * @param {Object} point1 - {x, y}
   * @param {Object} point2 - {x, y}
   * @returns {number} - Distance
   */
  calculateDistance(point1, point2) {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Get the current zoom scale
   * @returns {number} - Current zoom scale
   */
  getScale() {
    return this.currentTransform.k;
  }

  /**
   * Get the current translation
   * @returns {Object} - {x, y} translation
   */
  getTranslation() {
    return {
      x: this.currentTransform.x,
      y: this.currentTransform.y
    };
  }

  /**
   * Check if a point in graph space is visible in the current viewport
   * @param {Object} graphPosition - {x, y} in graph space
   * @param {number} viewportWidth - Width of the viewport
   * @param {number} viewportHeight - Height of the viewport
   * @param {number} margin - Optional margin for visibility check
   * @returns {boolean} - True if visible
   */
  isVisible(graphPosition, viewportWidth, viewportHeight, margin = 0) {
    const [screenX, screenY] = this.graphToScreen(graphPosition);
    
    return screenX >= -margin && 
           screenX <= viewportWidth + margin && 
           screenY >= -margin && 
           screenY <= viewportHeight + margin;
  }

  /**
   * Apply zoom-aware scaling to a value
   * @param {number} value - Original value
   * @param {boolean} inverse - If true, scale inversely with zoom
   * @returns {number} - Scaled value
   */
  scaleValue(value, inverse = false) {
    return inverse ? value / this.currentTransform.k : value * this.currentTransform.k;
  }
}