/**
 * Coordinate Transformation Utilities for Knowledge Graph Explorer
 * Handles coordinate transformations between screen space and graph space
 * Provides clean abstraction for zoom/pan coordinate calculations
 */
class CoordinateTransform {
  constructor() {
    this.currentTransform = d3.zoomIdentity;
    this.viewportWidth = 800;
    this.viewportHeight = 600;
  }

  /**
   * Update the current transform (called during zoom events)
   * @param {Object} transform - D3 zoom transform object
   */
  updateTransform(transform) {
    this.currentTransform = transform;
  }

  /**
   * Update viewport dimensions
   * @param {number} width - Viewport width
   * @param {number} height - Viewport height
   */
  updateViewport(width, height) {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  /**
   * Convert screen coordinates to graph coordinates
   * @param {Array|Object} screenPosition - [x, y] array or {x, y} object in screen space
   * @param {Object} transform - Optional transform override
   * @returns {Object} - {x, y} in graph space
   */
  screenToGraph(screenPosition, transform = null) {
    const t = transform || this.currentTransform;
    
    // Handle both array and object input
    const screenX = Array.isArray(screenPosition) ? screenPosition[0] : screenPosition.x;
    const screenY = Array.isArray(screenPosition) ? screenPosition[1] : screenPosition.y;
    
    return {
      x: (screenX - t.x) / t.k,
      y: (screenY - t.y) / t.k
    };
  }

  /**
   * Convert graph coordinates to screen coordinates
   * @param {Object|Array} graphPosition - {x, y} object or [x, y] array in graph space
   * @param {Object} transform - Optional transform override
   * @returns {Array} - [x, y] in screen space
   */
  graphToScreen(graphPosition, transform = null) {
    const t = transform || this.currentTransform;
    
    // Handle both object and array input
    const graphX = Array.isArray(graphPosition) ? graphPosition[0] : graphPosition.x;
    const graphY = Array.isArray(graphPosition) ? graphPosition[1] : graphPosition.y;
    
    return [
      graphX * t.k + t.x,
      graphY * t.k + t.y
    ];
  }

  /**
   * Convert screen coordinates relative to SVG element to graph coordinates
   * Useful for mouse event handling
   * @param {Event} event - Mouse event
   * @param {Element} svgElement - SVG DOM element
   * @param {Object} transform - Optional transform override
   * @returns {Object} - {x, y} in graph space
   */
  eventToGraph(event, svgElement, transform = null) {
    const [svgX, svgY] = d3.pointer(event, svgElement);
    return this.screenToGraph([svgX, svgY], transform);
  }

  /**
   * Calculate Euclidean distance between two points
   * @param {Object} point1 - {x, y} coordinates
   * @param {Object} point2 - {x, y} coordinates
   * @returns {number} - Distance between points
   */
  calculateDistance(point1, point2) {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calculate distance between a point and multiple targets, return closest
   * @param {Object} point - {x, y} source point
   * @param {Array} targets - Array of {x, y} target points with id property
   * @param {number} maxDistance - Maximum distance to consider
   * @returns {Object|null} - Closest target with distance, or null if none within maxDistance
   */
  findClosestPoint(point, targets, maxDistance = Infinity) {
    let closest = null;
    let minDistance = maxDistance;

    targets.forEach(target => {
      const distance = this.calculateDistance(point, target);
      if (distance < minDistance) {
        minDistance = distance;
        closest = { target, distance };
      }
    });

    return closest;
  }

  /**
   * Get the current zoom scale
   * @returns {number} - Current zoom scale factor
   */
  getScale() {
    return this.currentTransform.k;
  }

  /**
   * Get the current translation
   * @returns {Object} - {x, y} translation offset
   */
  getTranslation() {
    return {
      x: this.currentTransform.x,
      y: this.currentTransform.y
    };
  }

  /**
   * Get complete transform information
   * @returns {Object} - Full transform state
   */
  getTransform() {
    return {
      x: this.currentTransform.x,
      y: this.currentTransform.y,
      k: this.currentTransform.k,
      scale: this.currentTransform.k,
      translation: this.getTranslation()
    };
  }

  /**
   * Check if a point in graph space is visible in the current viewport
   * @param {Object} graphPosition - {x, y} in graph space
   * @param {number} margin - Optional margin for visibility check (in screen pixels)
   * @returns {boolean} - True if visible in viewport
   */
  isVisible(graphPosition, margin = 0) {
    const [screenX, screenY] = this.graphToScreen(graphPosition);
    
    return screenX >= -margin && 
           screenX <= this.viewportWidth + margin && 
           screenY >= -margin && 
           screenY <= this.viewportHeight + margin;
  }

  /**
   * Get the visible bounds of the current viewport in graph coordinates
   * @param {number} margin - Optional margin to expand bounds (in screen pixels)
   * @returns {Object} - {minX, maxX, minY, maxY, width, height} in graph space
   */
  getVisibleBounds(margin = 0) {
    const topLeft = this.screenToGraph([-margin, -margin]);
    const bottomRight = this.screenToGraph([
      this.viewportWidth + margin, 
      this.viewportHeight + margin
    ]);

    return {
      minX: topLeft.x,
      maxX: bottomRight.x,
      minY: topLeft.y,
      maxY: bottomRight.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y
    };
  }

  /**
   * Apply zoom-aware scaling to a value
   * @param {number} value - Original value
   * @param {boolean} inverse - If true, scale inversely with zoom (useful for maintaining visual size)
   * @returns {number} - Scaled value
   */
  scaleValue(value, inverse = false) {
    return inverse ? value / this.currentTransform.k : value * this.currentTransform.k;
  }

  /**
   * Scale a radius or size value to maintain consistent visual appearance across zoom levels
   * @param {number} baseValue - Base size value
   * @param {number} minScale - Minimum scale factor (prevents elements from becoming too small)
   * @param {number} maxScale - Maximum scale factor (prevents elements from becoming too large)
   * @returns {number} - Zoom-adjusted value
   */
  scaleVisualSize(baseValue, minScale = 0.5, maxScale = 2.0) {
    const scale = Math.max(minScale, Math.min(maxScale, 1 / this.currentTransform.k));
    return baseValue * scale;
  }

  /**
   * Calculate appropriate font size for current zoom level
   * @param {number} baseFontSize - Base font size in pixels
   * @param {number} minSize - Minimum readable size
   * @param {number} maxSize - Maximum size to prevent overflow
   * @returns {number} - Zoom-appropriate font size
   */
  scaleFontSize(baseFontSize, minSize = 8, maxSize = 24) {
    const scale = 1 / this.currentTransform.k;
    const scaledSize = baseFontSize * scale;
    return Math.max(minSize, Math.min(maxSize, scaledSize));
  }

  /**
   * Check if a circular area is visible in the viewport
   * @param {Object} center - {x, y} center point in graph space
   * @param {number} radius - Radius in graph space
   * @returns {boolean} - True if any part of the circle is visible
   */
  isCircleVisible(center, radius) {
    const bounds = this.getVisibleBounds();
    
    // Check if circle overlaps with viewport rectangle
    const closestX = Math.max(bounds.minX, Math.min(center.x, bounds.maxX));
    const closestY = Math.max(bounds.minY, Math.min(center.y, bounds.maxY));
    
    const distance = this.calculateDistance(center, { x: closestX, y: closestY });
    return distance <= radius;
  }

  /**
   * Create a transform that centers a specific point in the viewport
   * @param {Object} graphPoint - {x, y} point to center in graph space
   * @param {number} scale - Desired zoom scale (optional, defaults to current scale)
   * @returns {Object} - D3 transform object that centers the point
   */
  createCenteringTransform(graphPoint, scale = null) {
    const targetScale = scale !== null ? scale : this.currentTransform.k;
    const centerX = this.viewportWidth / 2;
    const centerY = this.viewportHeight / 2;
    
    return d3.zoomIdentity
      .translate(centerX - graphPoint.x * targetScale, centerY - graphPoint.y * targetScale)
      .scale(targetScale);
  }

  /**
   * Create a transform that fits a bounding box within the viewport
   * @param {Object} bounds - {minX, maxX, minY, maxY} in graph space
   * @param {number} padding - Padding as percentage of viewport (0.0 to 1.0)
   * @returns {Object} - D3 transform object that fits the bounds
   */
  createFittingTransform(bounds, padding = 0.1) {
    const contentWidth = bounds.maxX - bounds.minX;
    const contentHeight = bounds.maxY - bounds.minY;
    
    const availableWidth = this.viewportWidth * (1 - padding);
    const availableHeight = this.viewportHeight * (1 - padding);
    
    const scaleX = availableWidth / contentWidth;
    const scaleY = availableHeight / contentHeight;
    const scale = Math.min(scaleX, scaleY);
    
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    
    return this.createCenteringTransform({ x: centerX, y: centerY }, scale);
  }

  /**
   * Reset transform to identity (no zoom, no pan)
   * @returns {Object} - Identity transform
   */
  resetTransform() {
    this.currentTransform = d3.zoomIdentity;
    return d3.zoomIdentity;
  }

  /**
   * Interpolate between two transforms for smooth animations
   * @param {Object} fromTransform - Starting transform
   * @param {Object} toTransform - Ending transform
   * @param {number} t - Interpolation factor (0.0 to 1.0)
   * @returns {Object} - Interpolated transform
   */
  interpolateTransform(fromTransform, toTransform, t) {
    return d3.zoomIdentity
      .translate(
        fromTransform.x + (toTransform.x - fromTransform.x) * t,
        fromTransform.y + (toTransform.y - fromTransform.y) * t
      )
      .scale(fromTransform.k + (toTransform.k - fromTransform.k) * t);
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CoordinateTransform;
} else if (typeof window !== 'undefined') {
  window.CoordinateTransform = CoordinateTransform;
}