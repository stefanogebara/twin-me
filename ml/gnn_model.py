#!/usr/bin/env python3
"""
GNN-Based Behavioral Pattern Detection Model

Uses PyTorch Geometric's Heterogeneous Graph Transformer (HGT) to detect
cross-platform behavioral patterns like:
- "User listens to lo-fi music 20 minutes before important presentations"
- "User watches specific Netflix genre before bedtime"

Architecture:
1. Heterogeneous Graph Transformer (HGTConv) layers
2. Message passing across different node and edge types
3. Pattern correlation prediction head
4. Embedding generation for pattern clustering
"""

import sys
import json
import os
from typing import Dict, List, Tuple, Optional

import torch
import torch.nn as nn
import torch.nn.functional as F

try:
    from torch_geometric.nn import HGTConv
    from torch_geometric.data import HeteroData
    import numpy as np
except ImportError:
    print(json.dumps({
        "error": "PyTorch Geometric not installed. Run: pip install torch-geometric torch-scatter torch-sparse"
    }))
    sys.exit(1)


class UserBehaviorGNN(nn.Module):
    """
    Heterogeneous Graph Transformer for cross-platform pattern detection

    Learns to identify that "presentation events trigger focus music 20min before"
    """

    def __init__(
        self,
        hidden_channels: int = 128,
        num_layers: int = 4,
        num_heads: int = 8,
        dropout: float = 0.1
    ):
        super().__init__()

        self.hidden_channels = hidden_channels
        self.num_layers = num_layers

        # Node type embeddings (will be set dynamically based on metadata)
        self.node_embeddings = nn.ModuleDict()

        # Heterogeneous Graph Transformer layers
        self.hgt_layers = nn.ModuleList()
        for _ in range(num_layers):
            self.hgt_layers.append(
                HGTConv(
                    in_channels=hidden_channels,
                    out_channels=hidden_channels,
                    metadata=None,  # Will be set during forward pass
                    heads=num_heads,
                    dropout=dropout
                )
            )

        # Pattern classifier (predicts correlation strength between nodes)
        self.correlation_predictor = nn.Sequential(
            nn.Linear(hidden_channels * 2, 256),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(128, 1),
            nn.Sigmoid()  # Output 0-1 correlation score
        )

    def initialize_embeddings(self, node_types: List[str], feature_dims: Dict[str, int]):
        """Initialize node type-specific embeddings"""
        for node_type in node_types:
            input_dim = feature_dims.get(node_type, 3)  # Default 3 features
            self.node_embeddings[node_type] = nn.Sequential(
                nn.Linear(input_dim, self.hidden_channels),
                nn.ReLU(),
                nn.Dropout(0.1)
            )

    def forward(
        self,
        x_dict: Dict[str, torch.Tensor],
        edge_index_dict: Dict[Tuple[str, str, str], torch.Tensor],
        metadata: Tuple[List[str], List[Tuple[str, str, str]]]
    ):
        """
        Forward pass through HGT layers

        Args:
            x_dict: Node features for each node type
            edge_index_dict: Edge indices for each edge type
            metadata: (node_types, edge_types)
        """
        # Embed node features
        x_dict = {
            node_type: self.node_embeddings[node_type](x)
            for node_type, x in x_dict.items()
            if node_type in self.node_embeddings
        }

        # Apply HGT layers
        for hgt_layer in self.hgt_layers:
            # Update metadata for this layer
            hgt_layer.metadata = metadata
            x_dict = hgt_layer(x_dict, edge_index_dict)
            x_dict = {key: F.relu(x) for key, x in x_dict.items()}

        return x_dict

    def predict_correlation(
        self,
        node_embed_1: torch.Tensor,
        node_embed_2: torch.Tensor
    ) -> torch.Tensor:
        """
        Predict correlation strength between two nodes

        Used to determine if music activity correlates with calendar event
        """
        combined = torch.cat([node_embed_1, node_embed_2], dim=-1)
        return self.correlation_predictor(combined)


class GNNPatternDetector:
    """Wrapper class for training and inference"""

    def __init__(
        self,
        model_path: str = 'models/gnn_pattern_detector.pth',
        device: str = 'cuda' if torch.cuda.is_available() else 'cpu'
    ):
        self.model_path = model_path
        self.device = device
        self.model = None

    def prepare_graph_data(self, graph_json: Dict) -> HeteroData:
        """
        Convert JSON graph data to PyTorch Geometric HeteroData

        Expected format:
        {
            "nodes": [
                {"id": "...", "type": "CalendarEvent", "features": [...]},
                {"id": "...", "type": "MusicActivity", "features": [...]}
            ],
            "edges": [
                {"source": "...", "target": "...", "type": "PRECEDES", "timeOffset": 20}
            ]
        }
        """
        data = HeteroData()

        # Group nodes by type
        nodes_by_type = {}
        node_id_to_idx = {}

        for i, node in enumerate(graph_json['nodes']):
            node_type = node['type']
            if node_type not in nodes_by_type:
                nodes_by_type[node_type] = []

            local_idx = len(nodes_by_type[node_type])
            nodes_by_type[node_type].append(node['features'])
            node_id_to_idx[node['id']] = (node_type, local_idx)

        # Create node feature tensors
        for node_type, features in nodes_by_type.items():
            data[node_type].x = torch.tensor(features, dtype=torch.float)

        # Group edges by type
        edges_by_type = {}
        for edge in graph_json['edges']:
            source_type, source_idx = node_id_to_idx[edge['source']]
            target_type, target_idx = node_id_to_idx[edge['target']]
            edge_type = (source_type, edge['type'], target_type)

            if edge_type not in edges_by_type:
                edges_by_type[edge_type] = []

            edges_by_type[edge_type].append([source_idx, target_idx])

        # Create edge index tensors
        for edge_type, edge_list in edges_by_type.items():
            data[edge_type].edge_index = torch.tensor(
                edge_list,
                dtype=torch.long
            ).t().contiguous()

        return data

    def train(
        self,
        graph_json: Dict,
        epochs: int = 100,
        learning_rate: float = 0.001,
        hidden_channels: int = 128,
        num_layers: int = 4
    ) -> Dict:
        """Train GNN model on user behavior graph"""

        # Prepare data
        data = self.prepare_graph_data(graph_json)
        data = data.to(self.device)

        # Initialize model
        node_types = list(data.node_types)
        edge_types = list(data.edge_types)
        metadata = (node_types, edge_types)

        self.model = UserBehaviorGNN(
            hidden_channels=hidden_channels,
            num_layers=num_layers
        ).to(self.device)

        # Initialize embeddings
        feature_dims = {
            node_type: data[node_type].x.size(1)
            for node_type in node_types
        }
        self.model.initialize_embeddings(node_types, feature_dims)

        # Optimizer
        optimizer = torch.optim.Adam(self.model.parameters(), lr=learning_rate)

        # Training loop
        metrics = {'losses': [], 'accuracies': []}

        self.model.train()
        for epoch in range(epochs):
            optimizer.zero_grad()

            # Forward pass
            x_dict = {key: data[key].x for key in node_types}
            edge_index_dict = {key: data[key].edge_index for key in edge_types}

            embeddings = self.model(x_dict, edge_index_dict, metadata)

            # Create positive and negative pairs for training
            # Positive: nodes connected by PRECEDES edge
            # Negative: random node pairs
            loss = self.compute_contrastive_loss(embeddings, edge_index_dict)

            loss.backward()
            optimizer.step()

            metrics['losses'].append(float(loss))

            if epoch % 10 == 0:
                print(f'Epoch {epoch}/{epochs}, Loss: {loss.item():.4f}', file=sys.stderr)

        # Save model
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
        torch.save({
            'model_state_dict': self.model.state_dict(),
            'metadata': metadata,
            'feature_dims': feature_dims,
            'hidden_channels': hidden_channels,
            'num_layers': num_layers
        }, self.model_path)

        return {'metrics': metrics, 'epochs': epochs}

    def compute_contrastive_loss(
        self,
        embeddings: Dict[str, torch.Tensor],
        edge_index_dict: Dict
    ) -> torch.Tensor:
        """
        Contrastive loss: pull together connected nodes, push apart unconnected
        """
        loss = torch.tensor(0.0, device=self.device)

        # Find PRECEDES edges (music → calendar event)
        precedes_key = None
        for key in edge_index_dict.keys():
            if 'PRECEDES' in key[1]:
                precedes_key = key
                break

        if precedes_key is None:
            return loss

        source_type, _, target_type = precedes_key
        edge_index = edge_index_dict[precedes_key]

        if edge_index.size(1) == 0:
            return loss

        # Positive pairs (connected)
        source_embeds = embeddings[source_type][edge_index[0]]
        target_embeds = embeddings[target_type][edge_index[1]]

        # Cosine similarity for positive pairs
        pos_similarity = F.cosine_similarity(source_embeds, target_embeds)

        # Negative pairs (random)
        num_negative = edge_index.size(1)
        neg_target_indices = torch.randint(
            0,
            embeddings[target_type].size(0),
            (num_negative,),
            device=self.device
        )
        neg_target_embeds = embeddings[target_type][neg_target_indices]
        neg_similarity = F.cosine_similarity(source_embeds, neg_target_embeds)

        # Contrastive loss: maximize pos, minimize neg
        loss = -torch.mean(pos_similarity) + torch.mean(torch.relu(neg_similarity))

        return loss

    def infer(
        self,
        graph_json: Dict,
        min_confidence: float = 0.75,
        top_k: int = 10
    ) -> Dict:
        """Run inference to detect patterns"""

        # Load model
        checkpoint = torch.load(self.model_path, map_location=self.device)

        node_types, edge_types = checkpoint['metadata']
        self.model = UserBehaviorGNN(
            hidden_channels=checkpoint['hidden_channels'],
            num_layers=checkpoint['num_layers']
        ).to(self.device)

        self.model.initialize_embeddings(node_types, checkpoint['feature_dims'])
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.model.eval()

        # Prepare data
        data = self.prepare_graph_data(graph_json)
        data = data.to(self.device)

        # Forward pass
        with torch.no_grad():
            x_dict = {key: data[key].x for key in node_types}
            edge_index_dict = {key: data[key].edge_index for key in edge_types}
            metadata = (node_types, edge_types)

            embeddings = self.model(x_dict, edge_index_dict, metadata)

        # Detect patterns by finding high-correlation node pairs
        patterns = []

        # Check all possible music → event pairs
        if 'MusicActivity' in embeddings and 'CalendarEvent' in embeddings:
            music_embeds = embeddings['MusicActivity']
            event_embeds = embeddings['CalendarEvent']

            for i in range(music_embeds.size(0)):
                for j in range(event_embeds.size(0)):
                    correlation = self.model.predict_correlation(
                        music_embeds[i:i+1],
                        event_embeds[j:j+1]
                    ).item()

                    if correlation >= min_confidence:
                        patterns.append({
                            'pattern_type': 'temporal_music_before_event',
                            'music_activity_idx': i,
                            'calendar_event_idx': j,
                            'confidence_score': round(correlation * 100, 2),
                            'correlation': correlation
                        })

        # Sort by confidence and take top K
        patterns = sorted(patterns, key=lambda x: x['confidence_score'], reverse=True)[:top_k]

        return {'patterns': patterns}

    def generate_embeddings(self, graph_json: Dict) -> Dict:
        """Generate node embeddings for clustering"""

        # Load model
        checkpoint = torch.load(self.model_path, map_location=self.device)

        node_types, edge_types = checkpoint['metadata']
        self.model = UserBehaviorGNN(
            hidden_channels=checkpoint['hidden_channels'],
            num_layers=checkpoint['num_layers']
        ).to(self.device)

        self.model.initialize_embeddings(node_types, checkpoint['feature_dims'])
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.model.eval()

        # Prepare data
        data = self.prepare_graph_data(graph_json)
        data = data.to(self.device)

        # Forward pass
        with torch.no_grad():
            x_dict = {key: data[key].x for key in node_types}
            edge_index_dict = {key: data[key].edge_index for key in edge_types}
            metadata = (node_types, edge_types)

            embeddings = self.model(x_dict, edge_index_dict, metadata)

        # Convert to numpy
        embeddings_list = []
        node_ids = []

        for node_type in node_types:
            if node_type in embeddings:
                embeds = embeddings[node_type].cpu().numpy().tolist()
                embeddings_list.extend(embeds)

                # Reconstruct node IDs (simplified)
                for i in range(len(embeds)):
                    node_ids.append(f"{node_type}_{i}")

        return {
            'embeddings': embeddings_list,
            'nodeIds': node_ids
        }


def main():
    """CLI entry point"""
    if len(sys.argv) < 3:
        print(json.dumps({
            'error': 'Usage: python gnn_model.py <command> <json_data>'
        }))
        sys.exit(1)

    command = sys.argv[1]
    data = json.loads(sys.argv[2])

    detector = GNNPatternDetector(
        model_path=data.get('modelPath', 'models/gnn_pattern_detector.pth')
    )

    try:
        if command == 'train':
            result = detector.train(
                graph_json=data['graphData'],
                epochs=data.get('epochs', 100),
                learning_rate=data.get('learningRate', 0.001),
                hidden_channels=data.get('hiddenChannels', 128),
                num_layers=data.get('numLayers', 4)
            )

        elif command == 'infer':
            result = detector.infer(
                graph_json=data['graphData'],
                min_confidence=data.get('minConfidence', 0.75),
                top_k=data.get('topK', 10)
            )

        elif command == 'embed':
            result = detector.generate_embeddings(
                graph_json=data['graphData']
            )

        elif command == 'check':
            result = {
                'pythonVersion': sys.version,
                'dependencies': {
                    'torch': torch.__version__,
                    'torch_geometric': 'installed'
                }
            }

        else:
            result = {'error': f'Unknown command: {command}'}

        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({'error': str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
