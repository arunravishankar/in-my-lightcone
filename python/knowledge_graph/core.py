"""
Knowledge Graph Python Wrapper
Main class for generating interactive knowledge graphs from YAML/JSON data
"""

import json
import yaml
import os
from pathlib import Path
from typing import Dict, Any, Optional, Union
import uuid


class KnowledgeGraphPython:
    """
    Python wrapper for the Knowledge Graph Explorer JavaScript library.
    Handles data processing, configuration, and HTML generation.
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize the Knowledge Graph wrapper.
        
        Args:
            config: Optional configuration dictionary
        """
        self.config = self._merge_default_config(config or {})
        self.data = {"nodes": [], "links": []}
        self.is_loaded = False
        
        # Generate unique ID for this graph instance
        self.graph_id = f"kg_{uuid.uuid4().hex[:8]}"
        
        # Path configuration - handle both root and python subdirectory
        if os.path.exists("knowledge-graph-explorer/src/"):
            self.js_lib_path = "knowledge-graph-explorer/src/"
        elif os.path.exists("../knowledge-graph-explorer/src/"):
            self.js_lib_path = "../knowledge-graph-explorer/src/"
        else:
            # Try absolute path relative to this file
            current_dir = Path(__file__).parent.parent.parent
            self.js_lib_path = str(current_dir / "knowledge-graph-explorer" / "src")
        
    def _merge_default_config(self, user_config: Dict[str, Any]) -> Dict[str, Any]:
        """Merge user configuration with sensible defaults."""
        default_config = {
            "width": 900,
            "height": 600,
            "hero_mode": False,
            "title_overlay": None,
            "theme": {
                "primaryColor": "#2780e3",
                "secondaryColor": "#3fb618", 
                "accentColor": "#ffdd3c",
                "dangerColor": "#ff0039",
                "mutedColor": "#868e96",
                "backgroundColor": "#ffffff",
                "surfaceColor": "#f8f9fa",
                "textPrimary": "#212529",
                "textSecondary": "#495057",
                "fontFamily": "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
                "fontSizeBase": 14
            },
            "nodeColors": {},
            "layers": [],
            "timeline": {
                "enabled": True,
                "start": None,
                "end": None
            },
            "features": {
                "showMiniMap": True,
                "showTimeline": True,
                "showLegend": True,
                "enableHover": True,
                "enableDrag": True
            },
            "simulation": {
                "linkDistance": 120,
                "linkStrength": 0.3,
                "chargeStrength": -400
            }
        }
        
        return self._deep_merge(default_config, user_config)
    
    def _deep_merge(self, target: Dict, source: Dict) -> Dict:
        """Deep merge two dictionaries."""
        result = target.copy()
        for key, value in source.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self._deep_merge(result[key], value)
            else:
                result[key] = value
        return result
    
    @classmethod
    def from_yaml(cls, yaml_path: Union[str, Path], config_overrides: Optional[Dict] = None):
        """
        Create graph from YAML file.
        
        Args:
            yaml_path: Path to YAML data file
            config_overrides: Optional configuration overrides
            
        Returns:
            KnowledgeGraphPython instance
        """
        instance = cls(config_overrides)
        instance.load_yaml(yaml_path)
        return instance
    
    @classmethod 
    def from_dict(cls, data_dict: Dict[str, Any], config_overrides: Optional[Dict] = None):
        """
        Create graph from dictionary.
        
        Args:
            data_dict: Dictionary containing nodes and links
            config_overrides: Optional configuration overrides
            
        Returns:
            KnowledgeGraphPython instance
        """
        instance = cls(config_overrides)
        instance.load_dict(data_dict)
        return instance
    
    def load_yaml(self, yaml_path: Union[str, Path]) -> None:
        """Load graph data from YAML file."""
        yaml_path = Path(yaml_path)
        
        if not yaml_path.exists():
            raise FileNotFoundError(f"YAML file not found: {yaml_path}")
        
        with open(yaml_path, 'r', encoding='utf-8') as file:
            raw_data = yaml.safe_load(file)
        
        self._process_raw_data(raw_data)
        
    def load_dict(self, data_dict: Dict[str, Any]) -> None:
        """Load graph data from dictionary."""
        self._process_raw_data(data_dict)
        
    def _process_raw_data(self, raw_data: Dict[str, Any]) -> None:
        """Process and validate raw data."""
        # Extract metadata and merge with config
        if 'metadata' in raw_data:
            metadata = raw_data['metadata']
            if 'timeline' in metadata:
                self.config['timeline'].update(metadata['timeline'])
        
        # Extract layers configuration
        if 'layers' in raw_data:
            self.config['layers'] = raw_data['layers']
            
            # Auto-generate node colors from layers
            for layer in self.config['layers']:
                if 'color' in layer:
                    self.config['nodeColors'][layer['id']] = layer['color']
        
        # Extract nodes and links
        self.data = {
            "nodes": raw_data.get('nodes', []),
            "links": [] # Will be generated from parent relationships
        }

        # Generate links from parent_node relationships
        self._generate_links_from_parents()
        
        # Auto-calculate timeline if not specified
        if self.config['timeline']['start'] is None or self.config['timeline']['end'] is None:
            self._auto_calculate_timeline()
        
        # Validate data structure
        self._validate_data()
        
        self.is_loaded = True

    def _generate_links_from_parents(self) -> None:
        """Generate links from parent_node/parent_nodes relationships in nodes."""
        for node in self.data['nodes']:
            # Support both parent_node (single) and parent_nodes (array) for backward compatibility
            parents = []

            # Check for single parent (backward compatibility)
            if node.get('parent_node') and node['parent_node'] is not None:
                # parent_node can be either a string or a list
                if isinstance(node['parent_node'], list):
                    parents = node['parent_node']
                else:
                    parents = [node['parent_node']]

            # Check for multiple parents (new format)
            elif node.get('parent_nodes') and node['parent_nodes'] is not None:
                if isinstance(node['parent_nodes'], list):
                    parents = node['parent_nodes']
                else:
                    # If parent_nodes is not a list, treat it as a single parent
                    parents = [node['parent_nodes']]

            # Create links for all parents
            for parent_id in parents:
                # Check if parent node exists
                parent_exists = any(n['id'] == parent_id for n in self.data['nodes'])
                if parent_exists:
                    link = {
                        "source": parent_id,
                        "target": node['id'],
                        "strength": 0.5,  # Default strength
                        "id": f"{parent_id}-{node['id']}"
                    }
                    self.data['links'].append(link)

    def _auto_calculate_timeline(self) -> None:
        """Auto-calculate timeline range from node data."""
        years = []
        
        for node in self.data['nodes']:
            if 'timespan' in node:
                timespan = node['timespan']
                if 'start' in timespan and timespan['start']:
                    years.append(timespan['start'])
                if 'end' in timespan and timespan['end']:
                    years.append(timespan['end'])
        
        if years:
            if self.config['timeline']['start'] is None:
                self.config['timeline']['start'] = min(years)
            if self.config['timeline']['end'] is None:
                self.config['timeline']['end'] = max(years)
    
    def _validate_data(self) -> None:
        """Basic data validation."""
        if not isinstance(self.data['nodes'], list):
            raise ValueError("'nodes' must be a list")
        
        if not isinstance(self.data['links'], list):
            raise ValueError("'links' must be a list")
        
        # Check that all nodes have required fields
        node_ids = set()
        for i, node in enumerate(self.data['nodes']):
            if 'id' not in node:
                raise ValueError(f"Node {i} is missing required 'id' field")
            if 'label' not in node:
                raise ValueError(f"Node {node['id']} is missing required 'label' field")
            node_ids.add(node['id'])
        
        # Check that all links reference valid nodes
        for i, link in enumerate(self.data['links']):
            if 'source' not in link:
                raise ValueError(f"Link {i} is missing required 'source' field")
            if 'target' not in link:
                raise ValueError(f"Link {i} is missing required 'target' field")

            if link['source'] not in node_ids:
                raise ValueError(f"Link {i} references unknown source node: {link['source']}")
            if link['target'] not in node_ids:
                raise ValueError(f"Link {i} references unknown target node: {link['target']}")

        # Check that all parent_node/parent_nodes references are valid
        for i, node in enumerate(self.data['nodes']):
            parents = []

            # Check for single parent (backward compatibility)
            if node.get('parent_node') and node['parent_node'] is not None:
                # parent_node can be either a string or a list
                if isinstance(node['parent_node'], list):
                    parents = node['parent_node']
                else:
                    parents = [node['parent_node']]

            # Check for multiple parents (new format)
            elif node.get('parent_nodes') and node['parent_nodes'] is not None:
                if isinstance(node['parent_nodes'], list):
                    parents = node['parent_nodes']
                else:
                    parents = [node['parent_nodes']]

            # Validate all parent references
            for parent_id in parents:
                if parent_id not in node_ids:
                    raise ValueError(f"Node {i} ('{node['id']}') references unknown parent: {parent_id}")
    
    def generate_html(self, output_path: Optional[Union[str, Path]] = None, 
                     standalone: bool = True) -> str:
        """
        Generate complete HTML file with embedded JavaScript.
        
        Args:
            output_path: Optional path to save HTML file
            standalone: Whether to generate standalone HTML or snippet
            
        Returns:
            HTML string
        """
        if not self.is_loaded:
            raise ValueError("No data loaded. Use load_yaml() or load_dict() first.")
        
        # Read JavaScript library files
        js_content = self._read_js_library()
        
        # Generate HTML
        html_content = self._generate_html_template(js_content, standalone)
        
        # Save to file if path provided
        if output_path:
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, 'w', encoding='utf-8') as file:
                file.write(html_content)
        
        return html_content
    
    def generate_for_quarto(self) -> str:
        """Generate HTML snippet optimized for Quarto integration."""
        return self.generate_html(standalone=False)
    
    def _read_js_library(self) -> str:
        """Read and combine all JavaScript library files."""
        js_files = [
            "utils/CoordinateTransform.js",
            "utils/DataValidator.js",
            "core/ForceSimulation.js",
            "core/InteractionManager.js",
            "core/VisualEffectsManager.js",
            "core/MiniMapManager.js",
            "core/LabelLayoutManager.js",
            "core/UIControlsManager.js",
            "core/KnowledgeGraphExplorer.js"
        ]
        
        js_content = []
        base_path = Path(self.js_lib_path)
        
        for js_file in js_files:
            js_path = base_path / js_file
            if not js_path.exists():
                raise FileNotFoundError(f"JavaScript file not found: {js_path}")
            
            with open(js_path, 'r', encoding='utf-8') as file:
                content = file.read()
                js_content.append(f"// {js_file}\n{content}\n")
        
        return "\n".join(js_content)
    
    def _generate_html_template(self, js_content: str, standalone: bool = True) -> str:
        """Generate HTML template with JavaScript and data."""
        # Convert data to base64 to avoid all escaping issues
        import base64
        
        data_json = json.dumps(self.data)
        config_json = json.dumps(self.config)
        
        # Encode as base64 to completely avoid JavaScript escaping issues
        data_b64 = base64.b64encode(data_json.encode('utf-8')).decode('ascii')
        config_b64 = base64.b64encode(config_json.encode('utf-8')).decode('ascii')
        
        # Configure wrapper styles based on hero mode
        if self.config.get('hero_mode', False):
            # Handle viewport height or pixel height
            height = self.config['height']
            if isinstance(height, str) and ('vh' in height or 'vw' in height or '%' in height):
                height_style = height
            else:
                height_style = f"{height}px"

            wrapper_style = f"position: relative; width: 100%; height: {height_style}; margin: 0;"
            container_style = "width: 100%; height: 100%; border: none; background-color: #f9f9f9;"
            wrapper_class = "kg-hero-wrapper"
        else:
            wrapper_style = "position: relative; width: {}px; height: {}px; margin: 0 auto;".format(
                self.config['width'], self.config['height'])
            container_style = "width: 100%; height: 100%; border: 1px solid #ccc; background-color: #f9f9f9;"
            wrapper_class = "kg-wrapper"

        # Add title overlay if specified
        title_overlay_html = ""
        if self.config.get('title_overlay'):
            import html
            escaped_title = html.escape(self.config['title_overlay'])
            title_overlay_html = f'''
            <div class="kg-title-overlay" id="{self.graph_id}_title_overlay">
                <h1>{escaped_title}</h1>
            </div>'''

        html_body = f"""
        <div id="{self.graph_id}_wrapper" class="{wrapper_class}" style="{wrapper_style}">
            <div id="{self.graph_id}" style="{container_style}">
                <div style="padding: 20px; text-align: center; color: #666;">Loading graph...</div>
            </div>
            {title_overlay_html}
        </div>

        <script src="https://d3js.org/d3.v7.min.js"></script>
        <script>
        {js_content}

        // Initialize when ready
        function initGraph() {{
            try {{
                console.log('Starting graph initialization...');
                
                // Decode base64 data
                const dataStr = atob('{data_b64}');
                const configStr = atob('{config_b64}');
                const data = JSON.parse(dataStr);
                const config = JSON.parse(configStr);

                // Apply Quarto dark mode theme if active
                function applyQuartoTheme() {{
                    const isDarkMode = document.documentElement.classList.contains('quarto-dark');

                    if (isDarkMode) {{
                        // Dark mode theme
                        config.theme = {{
                            ...config.theme,
                            backgroundColor: '#1f1f1f',
                            surfaceColor: '#262626',
                            textPrimary: '#e9ecef',
                            textSecondary: '#adb5bd',
                            textMuted: '#6c757d',
                            borderColor: '#404040',
                            mutedColor: '#6c757d'
                        }};

                        // Update hero section background if in hero mode
                        if (config.hero_mode) {{
                            const heroSection = document.querySelector('.hero-section');
                            if (heroSection) {{
                                heroSection.style.background = '#1f1f1f';
                            }}
                        }}
                    }} else {{
                        // Light mode theme (default)
                        config.theme = {{
                            ...config.theme,
                            backgroundColor: '#ffffff',
                            surfaceColor: '#f8f9fa',
                            textPrimary: '#212529',
                            textSecondary: '#495057',
                            textMuted: '#868e96',
                            borderColor: '#dee2e6',
                            mutedColor: '#868e96'
                        }};

                        // Update hero section background if in hero mode
                        if (config.hero_mode) {{
                            const heroSection = document.querySelector('.hero-section');
                            if (heroSection) {{
                                heroSection.style.background = '#f9f9f9';
                            }}
                        }}
                    }}
                }}

                applyQuartoTheme();

                const container = document.getElementById('{self.graph_id}');
                const wrapper = document.getElementById('{self.graph_id}_wrapper');
                container.innerHTML = ''; // Clear loading message

                // Fix dimensions for hero mode - convert viewport units to pixels
                if (config.hero_mode) {{
                    const rect = wrapper.getBoundingClientRect();
                    config.width = rect.width;
                    config.height = rect.height;
                    console.log(`Hero mode dimensions: ${{config.width}} x ${{config.height}}`);
                }}
                
                console.log('Creating KnowledgeGraphExplorer...');
                const graph = new KnowledgeGraphExplorer(container, data, config);
                window.{self.graph_id} = graph;
                
                console.log('Graph created, adding UI controls to wrapper...');

                // Add UI controls to the wrapper, not the graph container
                setTimeout(() => {{
                    try {{
                        const uiControls = new UIControlsManager(config);
                        // Merge data and config for UI controls
                        const dataWithConfig = Object.assign({{}}, data, {{
                            layers: config.layers,
                            timeline: config.timeline
                        }});
                        uiControls.initialize(wrapper, graph, dataWithConfig);
                        window['{self.graph_id}_ui'] = uiControls;
                        console.log('UI controls added to wrapper successfully');
                    }} catch (uiError) {{
                        console.error('UI Controls failed:', uiError);
                    }}
                }}, 500);

                // Listen for Quarto theme changes and update graph accordingly
                const observer = new MutationObserver((mutations) => {{
                    mutations.forEach((mutation) => {{
                        if (mutation.attributeName === 'class' && mutation.target === document.documentElement) {{
                            applyQuartoTheme();
                            if (graph && graph.updateConfig) {{
                                graph.updateConfig({{ theme: config.theme }});
                            }}
                        }}
                    }});
                }});
                observer.observe(document.documentElement, {{
                    attributes: true,
                    attributeFilter: ['class']
                }});

                // Setup title overlay interaction detection if present
                const titleOverlay = document.getElementById('{self.graph_id}_title_overlay');
                if (titleOverlay) {{
                    let titleHidden = false;

                    function hideTitleOverlay() {{
                        if (!titleHidden) {{
                            titleHidden = true;
                            titleOverlay.style.transition = 'opacity 0.8s ease-out';
                            titleOverlay.style.opacity = '0';
                            setTimeout(() => {{
                                titleOverlay.style.display = 'none';
                            }}, 800);
                        }}
                    }}

                    // Only hide title on meaningful graph interactions
                    container.addEventListener('click', hideTitleOverlay);
                    container.addEventListener('touchstart', hideTitleOverlay);
                    container.addEventListener('wheel', hideTitleOverlay); // For zoom

                    // Hide on graph interaction events (not passive events like mousemove)
                    graph.on('zoom', hideTitleOverlay);
                    graph.on('nodeClick', hideTitleOverlay);
                    graph.on('audienceChange', hideTitleOverlay);

                    // Hide on drag start (meaningful interaction)
                    let isDragging = false;
                    container.addEventListener('mousedown', () => {{
                        isDragging = false;
                    }});
                    container.addEventListener('mousemove', (e) => {{
                        if (e.buttons > 0) {{ // Mouse button is pressed during move
                            if (!isDragging) {{
                                isDragging = true;
                                hideTitleOverlay();
                            }}
                        }}
                    }});
                }}
                
                console.log('Graph initialized successfully');
            }} catch (error) {{
                console.error('Graph initialization failed:', error);
                document.getElementById('{self.graph_id}').innerHTML = 
                    '<div style="padding: 20px; color: red;">Graph failed to load: ' + error.message + '</div>';
            }}
        }}

        // Wait for D3 and DOM
        if (typeof d3 !== 'undefined' && document.readyState === 'complete') {{
            initGraph();
        }} else {{
            window.addEventListener('load', function() {{
                setTimeout(initGraph, 200);
            }});
        }}
        </script>
        """        
        if standalone:
            return f"""<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Knowledge Graph</title>
    </head>
    <body>
        {html_body}
    </body>
    </html>"""
        else:
            return html_body
    
    def add_layer(self, layer_id: str, layer_config: Dict[str, Any]) -> None:
        """Dynamically add a layer to the configuration."""
        layer_config['id'] = layer_id
        self.config['layers'].append(layer_config)
        
        if 'color' in layer_config:
            self.config['nodeColors'][layer_id] = layer_config['color']
    
    def set_timeline_range(self, start_year: int, end_year: int) -> None:
        """Set the timeline range."""
        self.config['timeline']['start'] = start_year
        self.config['timeline']['end'] = end_year
    
    def update_config(self, config_updates: Dict[str, Any]) -> None:
        """Update configuration with new values."""
        self.config = self._deep_merge(self.config, config_updates)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get statistics about the loaded graph."""
        if not self.is_loaded:
            return {"loaded": False}
        
        return {
            "loaded": True,
            "node_count": len(self.data['nodes']),
            "link_count": len(self.data['links']),
            "layer_count": len(self.config['layers']),
            "timeline_range": (
                self.config['timeline']['start'],
                self.config['timeline']['end']
            ),
            "graph_id": self.graph_id
        }
    
    def display_in_quarto(self) -> None:
        """Display the graph in a Quarto notebook (for Jupyter-like usage)."""
        try:
            from IPython.display import HTML, display
            html_content = self.generate_for_quarto()
            display(HTML(html_content))
        except ImportError:
            # Fallback for non-Jupyter environments
            print("IPython not available. Use generate_html() to save to file.")
            return self.generate_for_quarto()