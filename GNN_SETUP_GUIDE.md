# GNN Pattern Detection Setup Guide

This guide will help you set up the Graph Neural Network (GNN) based behavioral pattern detection system for Twin-Me.

## Overview

The GNN pattern detection system uses:
- **Neo4j** for heterogeneous graph database storage
- **PyTorch Geometric** for graph neural network modeling
- **Node.js** services to bridge Neo4j and Python ML models
- **Supabase** for storing detected patterns

## Prerequisites

- Node.js 18+ installed
- Python 3.9+ installed
- Neo4j 5.x installed (or Docker)
- At least 8GB RAM recommended

## Step 1: Install Neo4j

### Option A: Docker (Recommended)

```bash
docker run \
    --name neo4j-twinme \
    -p 7474:7474 -p 7687:7687 \
    -d \
    -e NEO4J_AUTH=neo4j/your-password \
    neo4j:latest
```

Access Neo4j Browser at: http://localhost:7474

### Option B: Native Installation

Download from: https://neo4j.com/download/

## Step 2: Configure Environment Variables

Add these to your `.env` file:

```env
# Neo4j Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password

# Python Path (optional, if not in system PATH)
PYTHON_PATH=python3  # or python on Windows
```

## Step 3: Install Python Dependencies

```bash
# Navigate to project root
cd /path/to/twin-ai-learn

# Install Python packages
pip install -r ml/requirements.txt

# Or use a virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r ml/requirements.txt
```

### Python Dependencies Include:

- **torch**: PyTorch deep learning framework
- **torch-geometric**: Graph neural network library
- **neo4j**: Python driver for Neo4j
- **numpy, pandas**: Scientific computing

## Step 4: Verify Installation

### Check Neo4j Connection

```bash
# Test Neo4j connectivity
curl http://localhost:7474

# Should return Neo4j web interface HTML
```

### Check Python Environment

```bash
python3 ml/gnn_model.py check '{}'

# Expected output:
# {
#   "pythonVersion": "3.x.x",
#   "dependencies": {
#     "torch": "2.x.x",
#     "torch_geometric": "installed"
#   }
# }
```

### Check API Health

Start the backend server:

```bash
npm run server:dev
```

Test the health endpoint:

```bash
curl http://localhost:3001/api/gnn-patterns/health

# Expected output:
# {
#   "status": "healthy",
#   "python": { "available": true, ... },
#   "neo4j": { "healthy": true, ... },
#   "modelExists": false
# }
```

## Step 5: Usage Flow

### 1. Build User Behavior Graph

```bash
# Authenticate first, then:
curl -X POST http://localhost:3001/api/gnn-patterns/build-graph \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lookbackDays": 90,
    "platforms": ["calendar", "spotify", "youtube"]
  }'
```

This creates:
- User nodes
- Calendar event nodes with importance scores
- Music activity nodes with audio features
- PRECEDES edges (music → calendar event temporal relationships)

### 2. Train GNN Model

```bash
curl -X POST http://localhost:3001/api/gnn-patterns/train \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "epochs": 100,
    "learningRate": 0.001,
    "hiddenChannels": 128,
    "numLayers": 4
  }'
```

Training takes ~5-10 minutes depending on graph size.

### 3. Detect Patterns

```bash
curl -X POST http://localhost:3001/api/gnn-patterns/detect \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "minConfidence": 0.75,
    "topK": 10
  }'
```

Returns patterns like:
```json
{
  "patterns": [
    {
      "pattern_type": "temporal_music_before_event",
      "trigger": {
        "type": "calendar_event",
        "event_type": "presentation"
      },
      "response": {
        "type": "music_activity",
        "genre": "lo-fi",
        "avg_energy": 0.3,
        "avg_valence": 0.5
      },
      "time_offset_minutes": 20,
      "occurrence_count": 5,
      "confidence_score": 85
    }
  ]
}
```

### 4. Alternative: Cypher-Based Pattern Detection (Faster)

```bash
curl http://localhost:3001/api/gnn-patterns/temporal-patterns/USER_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Uses Neo4j Cypher queries instead of GNN model - faster but less sophisticated.

## Step 6: Frontend Integration

The GNN patterns are automatically saved to `behavioral_patterns` table and can be viewed in:

- `/behavioral-patterns` - Behavioral Patterns Dashboard
- `/soul-signature` - Soul Signature Dashboard (enhanced with GNN patterns)

## Architecture

### Node.js Services

1. **neo4jGraphService.js** (`api/services/neo4jGraphService.js`)
   - Manages Neo4j connections
   - Creates nodes (User, CalendarEvent, MusicActivity)
   - Creates temporal edges (PRECEDES, TRIGGERS)
   - Exports graph data for ML

2. **gnnPatternDetector.js** (`api/services/gnnPatternDetector.js`)
   - Bridges Node.js ↔ Python
   - Spawns Python processes for training/inference
   - Calculates pattern correlations

### Python ML Model

**gnn_model.py** (`ml/gnn_model.py`)
- Heterogeneous Graph Transformer (HGT) implementation
- Contrastive learning for node embeddings
- Pattern detection via correlation prediction
- Embedding generation for clustering

### API Routes

**gnn-patterns.js** (`api/routes/gnn-patterns.js`)
- POST `/api/gnn-patterns/build-graph` - Build graph from platform data
- POST `/api/gnn-patterns/train` - Train GNN model
- POST `/api/gnn-patterns/detect` - Detect patterns
- GET  `/api/gnn-patterns/embeddings/:userId` - Get pattern embeddings
- GET  `/api/gnn-patterns/correlation/:userId/:patternId1/:patternId2` - Calculate correlation
- GET  `/api/gnn-patterns/health` - System health check

## Troubleshooting

### Neo4j Connection Failed

```
❌ Neo4j connection failed: getaddrinfo ENOTFOUND localhost
```

**Solution**: Ensure Neo4j is running:
```bash
# Docker
docker ps | grep neo4j

# Native
sudo systemctl status neo4j
```

### Python Environment Not Available

```
Python environment not available
```

**Solution**: Install Python dependencies:
```bash
pip install -r ml/requirements.txt
```

### PyTorch Geometric Installation Issues

If `torch-geometric` fails to install:

```bash
# Try with specific PyTorch version
pip install torch==2.0.0
pip install torch-geometric torch-scatter torch-sparse -f https://data.pyg.org/whl/torch-2.0.0+cpu.html
```

### Insufficient Graph Data

```
Insufficient graph data for training. Need at least 10 nodes.
```

**Solution**: Connect more platforms and sync data:
1. Go to `/platform-hub` and connect Spotify, Google Calendar
2. Wait for data extraction to complete
3. Retry building graph

## Performance Considerations

### Graph Size vs Training Time

| Graph Nodes | Training Time | Memory Required |
|------------|---------------|-----------------|
| 10-100     | 1-2 min       | 2GB RAM         |
| 100-1000   | 5-10 min      | 4GB RAM         |
| 1000+      | 15-30 min     | 8GB RAM         |

### Optimization Tips

1. **Use Cypher queries first** for simple temporal patterns (faster than GNN)
2. **Train models incrementally** - start with 30 days, then expand to 90 days
3. **Limit graph depth** - focus on recent activities (last 90 days)
4. **Use GPU** if available (10x faster training)

## Next Steps

After completing GNN setup, continue with:

1. **Phase 2**: Multi-Agent AI Orchestration
   - Master Orchestrator Agent
   - Specialized agents (Recommendation, Insight, Personality, Pattern)

2. **Phase 3**: 16 Personalities Integration
   - Personality assessment questionnaire
   - Pattern validation based on MBTI type

3. **Phase 4**: Advanced Features
   - Real-time pattern streaming
   - Causality inference engine
   - Mobile metrics extraction

## Resources

- [Neo4j Documentation](https://neo4j.com/docs/)
- [PyTorch Geometric Docs](https://pytorch-geometric.readthedocs.io/)
- [Heterogeneous Graph Transformer Paper](https://arxiv.org/abs/2003.01332)
- [GNN Tutorial](https://distill.pub/2021/gnn-intro/)

## Support

For issues or questions:
1. Check logs: `npm run server:dev` (look for 🧠, 📊, 🔍 emojis)
2. Test health: `curl http://localhost:3001/api/gnn-patterns/health`
3. Review Neo4j browser: http://localhost:7474
