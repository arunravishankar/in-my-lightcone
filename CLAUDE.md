# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a personal blog/website built with **Quarto** that combines:
- Academic writing and research documentation
- Interactive knowledge graph visualization
- Python-based data processing tools
- Static site generation for GitHub Pages deployment

The site explores ideas across physics, data science, and AI, featuring an integrated knowledge graph that visualizes the author's academic and professional journey.

## Core Commands

### Quarto (Primary Build System)
```bash
# Development server with live reload
quarto preview

# Build entire site (outputs to docs/ for GitHub Pages)
quarto render

# Clean build artifacts
quarto clean

# Render specific file
quarto render about.qmd

# Check Quarto installation
quarto check
```

### Python Development
```bash
# Run Python tests
pytest python/tests/ -v
pytest python/tests/test_core_wrapper.py -v

# Run specific test for debugging
python python/tests/test_core_wrapper.py
```

### Knowledge Graph Explorer (JavaScript)
```bash
# Development server for JS components
cd knowledge-graph-explorer && npm run dev

# The JS library has no build step currently - uses direct file includes
```

## Architecture

### High-Level Structure
The project combines three main components:

1. **Quarto Website** (`/` root) - Static site generator for blog/academic content
2. **Knowledge Graph Explorer** (`knowledge-graph-explorer/`) - JavaScript library for interactive graph visualization
3. **Python Knowledge Graph Wrapper** (`python/`) - Python interface for generating knowledge graphs from YAML data

### Key Integration Points

**Data Flow:**
```
YAML data (data/about-graph.yml)
    ↓
Python wrapper (python/knowledge_graph/core.py)
    ↓
JavaScript visualization (knowledge-graph-explorer/src/)
    ↓
Embedded in Quarto pages (about.qmd)
```

**File Relationships:**
- `data/about-graph.yml` contains structured graph data with metadata, layers, nodes
- `python/knowledge_graph/core.py` processes YAML → HTML with embedded JavaScript
- `knowledge-graph-explorer/src/core/KnowledgeGraphExplorer.js` is the main visualization engine
- Integration happens through generated HTML that includes the full JavaScript library

### Directory Structure
```
├── _quarto.yml                 # Main site configuration
├── docs/                       # Generated site (GitHub Pages output)
├── posts/                      # Blog posts in date-folder structure
├── python/
│   ├── knowledge_graph/        # Python wrapper for graph generation
│   └── tests/                  # Python tests
├── knowledge-graph-explorer/
│   ├── src/
│   │   ├── core/              # Main visualization classes
│   │   ├── utils/             # Helper utilities
│   │   └── themes/            # Visual themes
│   └── package.json           # Minimal Node.js config
├── data/
│   └── about-graph.yml        # Graph data source
└── *.qmd                      # Quarto pages (index, about, blog, etc.)
```

## Development Patterns

### Content Creation
- **Blog posts**: Create in `posts/YYYY-MM-DD-title/index.qmd` format
- **Standalone pages**: Create as `page-name.qmd` in root
- **Python notebooks**: Use `.ipynb` format, add YAML metadata as raw cell
- **Knowledge graph data**: Edit `data/about-graph.yml` following existing node/link structure

### Python Knowledge Graph Workflow
The Python wrapper (`KnowledgeGraphPython`) bridges YAML data and JavaScript visualization:

1. **Data Loading**: `KnowledgeGraphPython.from_yaml("data/about-graph.yml")`
2. **Configuration**: Merges default settings with YAML metadata section
3. **HTML Generation**: `generate_html()` embeds full JavaScript library + data
4. **Quarto Integration**: Use `generate_for_quarto()` for embedding in `.qmd` files

### JavaScript Architecture
The knowledge graph explorer uses a modular class-based structure:
- `KnowledgeGraphExplorer` - Main coordinator class
- `ForceSimulation` - D3.js physics simulation management
- `InteractionManager` - User input handling (drag, zoom, hover)
- `VisualEffectsManager` - Animations and visual feedback
- `MiniMapManager` - Minimap/overview functionality
- `UIControlsManager` - Timeline, layers, and control panels

## Testing

### Python Tests
- Location: `python/tests/test_core_wrapper.py`
- Coverage: Data validation, HTML generation, configuration merging
- Run with: `pytest python/tests/ -v`

### Integration Testing
Test the full workflow:
```python
# Test YAML → Python → HTML → JavaScript integration
graph = KnowledgeGraphPython.from_yaml("data/about-graph.yml")
html = graph.generate_html("test-output.html")
# Open test-output.html in browser to verify rendering
```

## Configuration Files

### `_quarto.yml` - Main Site Configuration
- Defines navigation, theme, output directory (`docs/`)
- Sets site URL and metadata
- Configures HTML format and CSS

### `data/about-graph.yml` - Graph Data Structure
```yaml
metadata:          # Timeline and graph-level settings
layers:            # Visual layers with colors
nodes:             # Graph nodes with properties (id, label, layer, timespan, etc.)
```

### `python/knowledge_graph/core.py` - Default Configuration
Contains comprehensive defaults for graph appearance, simulation physics, and UI features that merge with YAML metadata.

## Deployment

The site deploys to GitHub Pages automatically:
1. `quarto render` builds to `docs/` directory
2. Commit and push to `main` branch
3. GitHub Pages serves from `docs/` folder
4. Site available at configured URL in `_quarto.yml`

## Key Dependencies

- **Quarto** - Static site generation and academic publishing
- **D3.js** (CDN) - Data visualization and force simulation
- **Python** - YAML processing, data validation, HTML generation
- **pytest** - Python testing framework
- **GitHub Pages** - Static site hosting

## Notes for Development

- The knowledge graph JavaScript library is included directly (no build step)
- Python wrapper handles all data processing and validation
- YAML structure in `data/about-graph.yml` should follow existing node/layer patterns
- Test Python changes with `pytest python/tests/ -v` before rendering
- Use `quarto preview` for live development of content
- JavaScript changes require browser refresh (no hot reload)
