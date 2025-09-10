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
    this.currentAudience = 'all';
    this.hoveredNode = null;

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
   * Apply audience-based visual effects (blur non-relevant nodes)
   * @param {string} audienceId - Current audience filter
   * @param {Array} nodes - Array of node objects
   */
  applyAudienceEffects(audienceId, nodes) {
    this.currentAudience = audienceId;
    this.isInAudienceMode = audienceId !== 'all';
    
    if (!this.nodeElements) return;
    
    if (audienceId === 'all') {
      // Remove all audience filtering
      this.nodeElements
        .transition()
        .duration(this.config.audienceTransitionDuration)
        .style('filter', 'none')
        .style('opacity', this.config.theme.defaultOpacity);
      
      // Reset links as well
      if (this.linkElements) {
        this.linkElements
          .transition()
          .duration(this.config.audienceTransitionDuration)
          .style('filter', 'none')
          .style('opacity', this.config.theme.dimmedOpacity);
      }
      
      this.isInAudienceMode = false;
      return;
    }
    
    // Apply blur and opacity effects based on audience relevance
    this.nodeElements
      .transition()
      .duration(this.config.audienceTransitionDuration)
      .style('filter', d => {
        const nodeAudience = d.audience || ['general'];
        return nodeAudience.includes(audienceId) ? 'none' : `blur(${this.config.audienceBlurAmount}px)`;
      })
      .style('opacity', d => {
        const nodeAudience = d.audience || ['general'];
        return nodeAudience.includes(audienceId) ? this.config.theme.defaultOpacity : this.config.audienceOpacityReduced;
      });
    
    // Also apply effects to links based on their connected nodes
    if (this.linkElements) {
      this.linkElements
        .transition()
        .duration(this.config.audienceTransitionDuration)
        .style('filter', d => {
          const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
          const targetId = typeof d.target === 'object' ? d.target.id : d.target;
          
          const sourceNode = nodes.find(n => n.id === sourceId);
          const targetNode = nodes.find(n => n.id === targetId);
          
          const sourceAudience = sourceNode?.audience || ['general'];
          const targetAudience = targetNode?.audience || ['general'];
          
          const sourceRelevant = sourceAudience.includes(audienceId);
          const targetRelevant = targetAudience.includes(audienceId);
          
          // Blur if both nodes are not relevant to current audience
          return (sourceRelevant || targetRelevant) ? 'none' : `blur(${this.config.audienceBlurAmount}px)`;
        })
        .style('opacity', d => {
          const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
          const targetId = typeof d.target === 'object' ? d.target.id : d.target;
          
          const sourceNode = nodes.find(n => n.id === sourceId);
          const targetNode = nodes.find(n => n.id === targetId);
          
          const sourceAudience = sourceNode?.audience || ['general'];
          const targetAudience = targetNode?.audience || ['general'];
          
          const sourceRelevant = sourceAudience.includes(audienceId);
          const targetRelevant = targetAudience.includes(audienceId);
          
          if (sourceRelevant && targetRelevant) {
            return this.config.theme.dimmedOpacity;
          } else if (sourceRelevant || targetRelevant) {
            return this.config.theme.dimmedOpacity * 0.7;
          } else {
            return this.config.audienceOpacityReduced * 0.5;
          }
        });
    }
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
    this.currentAudience = 'all';
    this.isInLayerMode = false;
    this.isInAudienceMode = false;
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VisualEffectsManager;
} else if (typeof window !== 'undefined') {
  window.VisualEffectsManager = VisualEffectsManager;
}