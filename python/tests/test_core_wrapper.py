"""
Pytest tests for the KnowledgeGraphPython wrapper
Run with: pytest python/tests/test_core_wrapper.py -v
"""

import pytest
import sys
import os
from pathlib import Path

# Add the python directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent))

from knowledge_graph.core import KnowledgeGraphPython


@pytest.fixture
def sample_data():
    """Sample test data for graph creation"""
    return {
        "nodes": [
            {
                "id": "node1",
                "label": "Test Node 1",
                "type": "test",
                "layer": "layer1",
                "size": 15,
                "timespan": {"start": 2020, "end": 2022},
                "parent_node": None
            },
            {
                "id": "node2",
                "label": "Test Node 2",
                "type": "test",
                "layer": "layer1",
                "size": 12,
                "timespan": {"start": 2021, "end": 2023},
                "parent_node": "node1"
            }
        ],
        "layers": [
            {
                "id": "layer1",
                "name": "Test Layer",
                "color": "#2780e3"
            }
        ]
    }


@pytest.fixture
def sample_data_multiple_parents():
    """Sample test data with multiple parent nodes"""
    return {
        "nodes": [
            {
                "id": "node1",
                "label": "Test Node 1",
                "type": "test",
                "layer": "layer1",
                "size": 15,
                "timespan": {"start": 2020, "end": 2022}
            },
            {
                "id": "node2",
                "label": "Test Node 2",
                "type": "test",
                "layer": "layer1",
                "size": 12,
                "timespan": {"start": 2021, "end": 2023}
            },
            {
                "id": "node3",
                "label": "Test Node 3",
                "type": "test",
                "layer": "layer1",
                "size": 10,
                "timespan": {"start": 2021, "end": 2023},
                "parent_nodes": ["node1", "node2"]  # Multiple parents
            },
            {
                "id": "node4",
                "label": "Test Node 4",
                "type": "test",
                "layer": "layer1",
                "size": 8,
                "timespan": {"start": 2022, "end": 2023},
                "parent_node": "node3"  # Single parent (backward compatibility)
            }
        ],
        "layers": [
            {
                "id": "layer1",
                "name": "Test Layer",
                "color": "#2780e3"
            }
        ]
    }


@pytest.fixture
def custom_config():
    """Custom configuration for testing"""
    return {
        "width": 1200,
        "theme": {
            "primaryColor": "#ff0000"
        },
        "features": {
            "showMiniMap": False
        }
    }


class TestKnowledgeGraphPython:
    """Test cases for KnowledgeGraphPython wrapper"""
    
    def test_import_success(self):
        """Test that the module imports successfully"""
        assert KnowledgeGraphPython is not None
    
    def test_basic_initialization(self):
        """Test basic initialization without config"""
        graph = KnowledgeGraphPython()
        assert graph.config is not None
        assert graph.data == {"nodes": [], "links": []}
        assert not graph.is_loaded
        assert graph.graph_id.startswith("kg_")
    
    def test_initialization_with_config(self, custom_config):
        """Test initialization with custom configuration"""
        graph = KnowledgeGraphPython(custom_config)
        
        assert graph.config["width"] == 1200
        assert graph.config["theme"]["primaryColor"] == "#ff0000"
        assert graph.config["features"]["showMiniMap"] == False
        assert graph.config["height"] == 600  # Should keep default
    
    def test_from_dict_creation(self, sample_data):
        """Test creating graph from dictionary"""
        graph = KnowledgeGraphPython.from_dict(sample_data)
        
        assert graph.is_loaded
        assert len(graph.data["nodes"]) == 2
        assert len(graph.data["links"]) == 1
        assert len(graph.config["layers"]) == 1
    
    def test_timeline_auto_calculation(self, sample_data):
        """Test automatic timeline calculation from node data"""
        graph = KnowledgeGraphPython.from_dict(sample_data)
        
        assert graph.config["timeline"]["start"] == 2020
        assert graph.config["timeline"]["end"] == 2023
    
    def test_node_colors_from_layers(self, sample_data):
        """Test that node colors are automatically generated from layers"""
        graph = KnowledgeGraphPython.from_dict(sample_data)
        
        assert "layer1" in graph.config["nodeColors"]
        assert graph.config["nodeColors"]["layer1"] == "#2780e3"
    
    def test_get_stats(self, sample_data):
        """Test getting graph statistics"""
        graph = KnowledgeGraphPython.from_dict(sample_data)
        stats = graph.get_stats()
        
        assert stats["loaded"] == True
        assert stats["node_count"] == 2
        assert stats["link_count"] == 1
        assert stats["layer_count"] == 1
        assert stats["timeline_range"] == (2020, 2023)
        assert "graph_id" in stats
    
    def test_get_stats_not_loaded(self):
        """Test getting stats when no data is loaded"""
        graph = KnowledgeGraphPython()
        stats = graph.get_stats()
        
        assert stats["loaded"] == False
    
    def test_configuration_merging(self, custom_config):
        """Test deep merging of configuration"""
        graph = KnowledgeGraphPython(custom_config)
        
        # Custom values should be applied
        assert graph.config["width"] == 1200
        assert graph.config["theme"]["primaryColor"] == "#ff0000"
        
        # Default values should be preserved
        assert graph.config["theme"]["fontSizeBase"] == 14
        assert graph.config["simulation"]["linkDistance"] == 120
    
    def test_update_config(self, sample_data):
        """Test dynamic configuration updates"""
        graph = KnowledgeGraphPython.from_dict(sample_data)
        
        graph.update_config({"height": 800, "theme": {"primaryColor": "#00ff00"}})
        
        assert graph.config["height"] == 800
        assert graph.config["theme"]["primaryColor"] == "#00ff00"
        # Other theme values should be preserved
        assert graph.config["theme"]["fontSizeBase"] == 14
    
    def test_add_layer(self, sample_data):
        """Test dynamic layer addition"""
        graph = KnowledgeGraphPython.from_dict(sample_data)
        
        graph.add_layer("test_layer", {"name": "Test Layer", "color": "#00ff00"})
        
        # Check that layer was added
        layer_ids = [layer["id"] for layer in graph.config["layers"]]
        assert "test_layer" in layer_ids
        
        # Check that color was added to nodeColors
        assert graph.config["nodeColors"]["test_layer"] == "#00ff00"
    
    def test_set_timeline_range(self, sample_data):
        """Test setting timeline range"""
        graph = KnowledgeGraphPython.from_dict(sample_data)
        
        graph.set_timeline_range(2015, 2025)
        
        assert graph.config["timeline"]["start"] == 2015
        assert graph.config["timeline"]["end"] == 2025
    
    def test_multiple_parent_nodes(self, sample_data_multiple_parents):
        """Test nodes with multiple parent nodes"""
        graph = KnowledgeGraphPython.from_dict(sample_data_multiple_parents)

        assert graph.is_loaded
        assert len(graph.data["nodes"]) == 4
        # Should have 3 links total:
        # - 2 links from node1 and node2 to node3
        # - 1 link from node3 to node4
        assert len(graph.data["links"]) == 3

        # Check that links were created correctly
        links_to_node3 = [link for link in graph.data["links"] if link["target"] == "node3"]
        assert len(links_to_node3) == 2

        source_ids = {link["source"] for link in links_to_node3}
        assert source_ids == {"node1", "node2"}

    def test_backward_compatibility_single_parent(self, sample_data):
        """Test that single parent_node still works (backward compatibility)"""
        graph = KnowledgeGraphPython.from_dict(sample_data)

        assert len(graph.data["links"]) == 1
        assert graph.data["links"][0]["source"] == "node1"
        assert graph.data["links"][0]["target"] == "node2"

    def test_mixed_parent_formats(self, sample_data_multiple_parents):
        """Test graph with both parent_node and parent_nodes formats"""
        graph = KnowledgeGraphPython.from_dict(sample_data_multiple_parents)

        # node3 has parent_nodes: ["node1", "node2"]
        # node4 has parent_node: "node3"

        links_to_node4 = [link for link in graph.data["links"] if link["target"] == "node4"]
        assert len(links_to_node4) == 1
        assert links_to_node4[0]["source"] == "node3"

    def test_invalid_parent_reference(self):
        """Test validation catches references to non-existent parent nodes"""
        invalid_data = {
            "nodes": [
                {"id": "node1", "label": "Node 1"},
                {"id": "node2", "label": "Node 2", "parent_nodes": ["node1", "nonexistent"]}
            ]
        }

        with pytest.raises(ValueError, match="references unknown parent: nonexistent"):
            KnowledgeGraphPython.from_dict(invalid_data)

    def test_yaml_file_not_found(self):
        """Test handling of missing YAML files"""
        with pytest.raises(FileNotFoundError, match="YAML file not found"):
            KnowledgeGraphPython.from_yaml("nonexistent.yml")
    
    def test_data_validation_missing_node_id(self):
        """Test validation catches missing node IDs"""
        invalid_data = {
            "nodes": [{"label": "Node without ID"}],
            "links": []
        }
        
        with pytest.raises(ValueError, match="missing required 'id' field"):
            KnowledgeGraphPython.from_dict(invalid_data)
    
    def test_data_validation_missing_node_label(self):
        """Test validation catches missing node labels"""
        invalid_data = {
            "nodes": [{"id": "node1"}],  # Missing label
            "links": []
        }
        
        with pytest.raises(ValueError, match="missing required 'label' field"):
            KnowledgeGraphPython.from_dict(invalid_data)
    
    def test_data_validation_invalid_parent_node(self):
        """Test validation catches invalid parent_node references"""
        invalid_data = {
            "nodes": [
                {"id": "node1", "label": "Node 1", "parent_node": "nonexistent"}
            ]
        }

        with pytest.raises(ValueError, match="references unknown parent"):
            KnowledgeGraphPython.from_dict(invalid_data)

    def test_data_validation_circular_parent_reference(self):
        """Test validation handles circular parent references"""
        invalid_data = {
            "nodes": [
                {"id": "node1", "label": "Node 1", "parent_node": "node1"}
            ]
        }

        # This should not crash - it's a valid self-reference technically
        graph = KnowledgeGraphPython.from_dict(invalid_data)
        # Should not generate a self-link
        assert len(graph.data["links"]) == 1  # Self-link is allowed
    
    def test_html_generation_no_data_loaded(self):
        """Test HTML generation fails when no data is loaded"""
        graph = KnowledgeGraphPython()
        
        with pytest.raises(ValueError, match="No data loaded"):
            graph.generate_html()
    
    def test_html_generation_success(self, sample_data):
        """Test HTML generation works with existing JS files"""
        graph = KnowledgeGraphPython.from_dict(sample_data)
        
        # This should work since JS files exist
        html = graph.generate_html(standalone=False)
        
        assert len(html) > 1000  # Should be substantial HTML
        assert graph.graph_id in html  # Should contain the graph ID
        assert "KnowledgeGraphExplorer" in html  # Should reference main class
        assert "d3.v7.min.js" in html  # Should include D3 CDN
        # Data is base64 encoded, so check for the decoding functions
        assert "atob(" in html  # Should contain base64 decoding
        assert "JSON.parse" in html  # Should parse decoded data
    
    def test_generate_for_quarto_no_data(self):
        """Test Quarto generation fails when no data is loaded"""
        graph = KnowledgeGraphPython()
        
        with pytest.raises(ValueError, match="No data loaded"):
            graph.generate_for_quarto()


class TestDataProcessing:
    """Test data processing functionality"""
    
    def test_metadata_processing(self):
        """Test processing of metadata section"""
        data_with_metadata = {
            "metadata": {
                "title": "Test Graph",
                "timeline": {
                    "start": 2015,
                    "end": 2025
                }
            },
            "nodes": [{"id": "node1", "label": "Node 1"}],
            "links": []
        }
        
        graph = KnowledgeGraphPython.from_dict(data_with_metadata)
        
        assert graph.config["timeline"]["start"] == 2015
        assert graph.config["timeline"]["end"] == 2025
    
    def test_empty_timeline_calculation(self):
        """Test timeline calculation with nodes that have no timespan"""
        data_no_timeline = {
            "nodes": [{"id": "node1", "label": "Node 1"}],
            "links": []
        }
        
        graph = KnowledgeGraphPython.from_dict(data_no_timeline)
        
        # Should remain None when no timeline data available
        assert graph.config["timeline"]["start"] is None
        assert graph.config["timeline"]["end"] is None


if __name__ == "__main__":
    # Allow running as script for debugging
    pytest.main([__file__, "-v"])