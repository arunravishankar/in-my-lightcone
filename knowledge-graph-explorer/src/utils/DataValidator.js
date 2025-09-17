/**
 * Data Validation Utilities for Knowledge Graph Explorer
 * Validates node and link data structures, ensures data integrity
 */
class DataValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Validate complete graph data structure
   * @param {Object} data - Graph data with nodes and links
   * @returns {Object} - Validation result with isValid, errors, warnings
   */
  validateGraphData(data) {
    this.errors = [];
    this.warnings = [];

    if (!data) {
      this.errors.push('Graph data is null or undefined');
      return this.getValidationResult();
    }

    if (!data.nodes || !Array.isArray(data.nodes)) {
      this.errors.push('Graph data must contain a nodes array');
      return this.getValidationResult();
    }

    if (!data.links || !Array.isArray(data.links)) {
      this.errors.push('Graph data must contain a links array');
      return this.getValidationResult();
    }

    // Validate nodes
    const nodeIds = new Set();
    data.nodes.forEach((node, index) => {
      this.validateNode(node, index, nodeIds);
    });

    // Validate links
    data.links.forEach((link, index) => {
      this.validateLink(link, index, nodeIds);
    });

    // Validate parent_node references
    data.nodes.forEach((node, index) => {
      if (node.parent_node && node.parent_node !== null) {
        // Handle both string and array formats
        const parents = Array.isArray(node.parent_node) ? node.parent_node : [node.parent_node];
        parents.forEach(parentId => {
          if (!nodeIds.has(parentId)) {
            this.errors.push(`Node ${index} (${node.id}): parent_node '${parentId}' does not exist`);
          }
        });
      }
    });

    return this.getValidationResult();
  }

  /**
   * Validate individual node structure
   * @param {Object} node - Node data
   * @param {number} index - Node index in array
   * @param {Set} nodeIds - Set of existing node IDs
   */
  validateNode(node, index, nodeIds) {
    const nodeRef = `Node ${index}`;

    // Required fields
    if (!node.id) {
      this.errors.push(`${nodeRef}: Missing required field 'id'`);
      return;
    }

    if (typeof node.id !== 'string') {
      this.errors.push(`${nodeRef}: 'id' must be a string`);
    }

    if (nodeIds.has(node.id)) {
      this.errors.push(`${nodeRef}: Duplicate node ID '${node.id}'`);
    } else {
      nodeIds.add(node.id);
    }

    if (!node.label) {
      this.errors.push(`${nodeRef} (${node.id}): Missing required field 'label'`);
    }

    if (!node.type && !node.layer) {
      this.warnings.push(`${nodeRef} (${node.id}): Missing both 'type' and 'layer' fields, will use defaults`);
    }

    if (!node.layer) {
      this.warnings.push(`${nodeRef} (${node.id}): Missing 'layer' field, may affect layer functionality`);
    }

    // Optional field validation
    if (node.size !== undefined && (typeof node.size !== 'number' || node.size <= 0)) {
      this.errors.push(`${nodeRef} (${node.id}): 'size' must be a positive number`);
    }

    if (node.timespan) {
      this.validateTimespan(node.timespan, `${nodeRef} (${node.id})`);
    }

    if (node.links && !Array.isArray(node.links)) {
      this.errors.push(`${nodeRef} (${node.id}): 'links' must be an array`);
    }

    if (node.position && (!node.position.x || !node.position.y)) {
      this.warnings.push(`${nodeRef} (${node.id}): 'position' should have both x and y coordinates`);
    }

    // Validate experience level
    if (node.experienceLevel && !['experienced', 'interested'].includes(node.experienceLevel)) {
      this.warnings.push(`${nodeRef} (${node.id}): 'experienceLevel' should be 'experienced' or 'interested'`);
    }

    // Validate audience field
    if (node.audience) {
      const validAudiences = ['general', 'technical', 'current'];
      if (Array.isArray(node.audience)) {
        node.audience.forEach(aud => {
          if (!validAudiences.includes(aud)) {
            this.warnings.push(`${nodeRef} (${node.id}): Invalid audience '${aud}', should be one of: ${validAudiences.join(', ')}`);
          }
        });
      } else if (typeof node.audience === 'string') {
        if (!validAudiences.includes(node.audience)) {
          this.warnings.push(`${nodeRef} (${node.id}): Invalid audience '${node.audience}', should be one of: ${validAudiences.join(', ')}`);
        }
      } else {
        this.errors.push(`${nodeRef} (${node.id}): 'audience' must be a string or array of strings`);
      }
    }

    // Validate parent_node reference - can be string or array of strings
    if (node.parent_node) {
      if (typeof node.parent_node === 'string') {
        // Single parent - will be validated later
      } else if (Array.isArray(node.parent_node)) {
        // Multiple parents - validate each is a string
        node.parent_node.forEach((parent, idx) => {
          if (typeof parent !== 'string') {
            this.errors.push(`${nodeRef} (${node.id}): parent_node[${idx}] must be a string node ID`);
          }
        });
      } else {
        this.errors.push(`${nodeRef} (${node.id}): 'parent_node' must be a string or array of strings`);
      }
    }

    // Validate subnode field
    if (node.subnode && typeof node.subnode !== 'boolean') {
      this.errors.push(`${nodeRef} (${node.id}): 'subnode' must be a boolean value`);
    }
  }

  /**
   * Validate individual link structure
   * @param {Object} link - Link data
   * @param {number} index - Link index in array
   * @param {Set} nodeIds - Set of valid node IDs
   */
  validateLink(link, index, nodeIds) {
    const linkRef = `Link ${index}`;

    // Required fields
    if (!link.source) {
      this.errors.push(`${linkRef}: Missing required field 'source'`);
      return;
    }

    if (!link.target) {
      this.errors.push(`${linkRef}: Missing required field 'target'`);
      return;
    }

    // Check if source and target nodes exist
    if (!nodeIds.has(link.source)) {
      this.errors.push(`${linkRef}: Source node '${link.source}' does not exist`);
    }

    if (!nodeIds.has(link.target)) {
      this.errors.push(`${linkRef}: Target node '${link.target}' does not exist`);
    }

    // Self-loops warning
    if (link.source === link.target) {
      this.warnings.push(`${linkRef}: Self-loop detected (${link.source} -> ${link.target})`);
    }

    // Optional field validation
    if (link.strength !== undefined) {
      if (typeof link.strength !== 'number' || link.strength < 0 || link.strength > 1) {
        this.errors.push(`${linkRef}: 'strength' must be a number between 0 and 1`);
      }
    }
  }

  /**
   * Validate timespan structure
   * @param {Object} timespan - Timespan data
   * @param {string} context - Context for error messages
   */
  validateTimespan(timespan, context) {
    if (typeof timespan !== 'object') {
      this.errors.push(`${context}: 'timespan' must be an object`);
      return;
    }

    if (timespan.start !== undefined) {
      if (!Number.isInteger(timespan.start) || timespan.start < 1900 || timespan.start > 2100) {
        this.errors.push(`${context}: 'timespan.start' must be a valid year (1900-2100)`);
      }
    }

    if (timespan.end !== undefined && timespan.end !== null) {
      if (!Number.isInteger(timespan.end) || timespan.end < 1900 || timespan.end > 2100) {
        this.errors.push(`${context}: 'timespan.end' must be a valid year (1900-2100) or null`);
      }

      if (timespan.start && timespan.end && timespan.end < timespan.start) {
        this.errors.push(`${context}: 'timespan.end' cannot be before 'timespan.start'`);
      }
    }
  }

  /**
   * Validate configuration object
   * @param {Object} config - Configuration object
   * @returns {Object} - Validation result
   */
  validateConfig(config) {
    this.errors = [];
    this.warnings = [];

    if (!config) {
      this.errors.push('Configuration is null or undefined');
      return this.getValidationResult();
    }

    // Validate dimensions
    if (config.width !== undefined && (typeof config.width !== 'number' || config.width <= 0)) {
      this.errors.push('width must be a positive number');
    }

    if (config.height !== undefined && (typeof config.height !== 'number' || config.height <= 0)) {
      this.errors.push('height must be a positive number');
    }

    // Validate colors
    const colorFields = ['background', 'textColor', 'linkColor'];
    colorFields.forEach(field => {
      if (config[field] !== undefined && !this.isValidColor(config[field])) {
        this.warnings.push(`${field} may not be a valid CSS color`);
      }
    });

    // Validate layers
    if (config.layers) {
      if (!Array.isArray(config.layers)) {
        this.errors.push('layers must be an array');
      } else {
        config.layers.forEach((layer, index) => {
          this.validateLayer(layer, index);
        });
      }
    }

    // Validate timeline
    if (config.timeline) {
      this.validateTimelineConfig(config.timeline);
    }

    return this.getValidationResult();
  }

  /**
   * Validate layer configuration
   * @param {Object} layer - Layer configuration
   * @param {number} index - Layer index
   */
  validateLayer(layer, index) {
    const layerRef = `Layer ${index}`;

    if (!layer.id) {
      this.errors.push(`${layerRef}: Missing required field 'id'`);
    }

    if (!layer.name) {
      this.errors.push(`${layerRef}: Missing required field 'name'`);
    }

    if (!layer.color) {
      this.warnings.push(`${layerRef}: Missing 'color' field`);
    } else if (!this.isValidColor(layer.color)) {
      this.warnings.push(`${layerRef}: 'color' may not be a valid CSS color`);
    }
  }

  /**
   * Validate timeline configuration
   * @param {Object} timeline - Timeline configuration
   */
  validateTimelineConfig(timeline) {
    if (typeof timeline !== 'object') {
      this.errors.push('timeline must be an object');
      return;
    }

    if (timeline.start !== undefined) {
      if (!Number.isInteger(timeline.start)) {
        this.errors.push('timeline.start must be an integer year');
      }
    }

    if (timeline.end !== undefined) {
      if (!Number.isInteger(timeline.end)) {
        this.errors.push('timeline.end must be an integer year');
      }
    }

    if (timeline.start && timeline.end && timeline.end < timeline.start) {
      this.errors.push('timeline.end cannot be before timeline.start');
    }
  }

  /**
   * Basic CSS color validation
   * @param {string} color - Color string to validate
   * @returns {boolean} - Whether color appears valid
   */
  isValidColor(color) {
    if (typeof color !== 'string') return false;
    
    // Check for common CSS color formats
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    const rgbRegex = /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/;
    const rgbaRegex = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[01]?\.?\d*\s*\)$/;
    const namedColors = ['red', 'blue', 'green', 'black', 'white', 'yellow', 'purple', 'orange', 'pink', 'brown', 'gray', 'grey'];

    return hexRegex.test(color) || 
           rgbRegex.test(color) || 
           rgbaRegex.test(color) || 
           namedColors.includes(color.toLowerCase());
  }

  /**
   * Get validation result summary
   * @returns {Object} - Validation result with isValid, errors, warnings
   */
  getValidationResult() {
    return {
      isValid: this.errors.length === 0,
      errors: [...this.errors],
      warnings: [...this.warnings],
      hasWarnings: this.warnings.length > 0
    };
  }

  /**
   * Static method for quick validation
   * @param {Object} data - Data to validate
   * @returns {Object} - Validation result
   */
  static validate(data) {
    const validator = new DataValidator();
    return validator.validateGraphData(data);
  }

  /**
   * Static method for quick config validation
   * @param {Object} config - Config to validate
   * @returns {Object} - Validation result
   */
  static validateConfiguration(config) {
    const validator = new DataValidator();
    return validator.validateConfig(config);
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataValidator;
} else if (typeof window !== 'undefined') {
  window.DataValidator = DataValidator;
}