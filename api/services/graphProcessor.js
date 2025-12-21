/**
 * Invisible Graph Processor
 * Runs graph calculations in the background
 * Users never see this - only the insights it generates
 */

class GraphProcessor {
  constructor() {
    // Simple in-memory graph using adjacency lists
    // We can upgrade to Neo4j later if needed
    this.userGraphs = new Map(); // userId -> graph data
    this.userMetrics = new Map(); // userId -> computed metrics
  }

  /**
   * Build user graph from platform data
   * This runs silently in the background
   */
  async buildUserGraph(userId, platformData) {
    console.log(`[GraphProcessor] Building graph for user ${userId}`);

    // Initialize graph structure
    const graph = {
      nodes: new Map(),
      edges: [],
      metadata: {
        userId,
        createdAt: new Date(),
        platforms: Object.keys(platformData)
      }
    };

    // Add user as central node
    graph.nodes.set(userId, {
      id: userId,
      type: 'user',
      weight: 1.0,
      attributes: {}
    });

    // Process each platform's data into graph
    if (platformData.spotify) {
      this.addSpotifyToGraph(graph, platformData.spotify);
    }

    if (platformData.youtube) {
      this.addYouTubeToGraph(graph, platformData.youtube);
    }

    if (platformData.github) {
      this.addGitHubToGraph(graph, platformData.github);
    }

    // Store the graph
    this.userGraphs.set(userId, graph);

    // Calculate metrics
    const metrics = await this.calculateMetrics(userId, graph);
    this.userMetrics.set(userId, metrics);

    console.log(`[GraphProcessor] Graph built with ${graph.nodes.size} nodes and ${graph.edges.length} edges`);

    return metrics;
  }

  /**
   * Add Spotify data to graph
   */
  addSpotifyToGraph(graph, spotifyData) {
    const userId = graph.metadata.userId;

    // Add artists as nodes
    spotifyData.topArtists?.forEach((artist, index) => {
      const artistId = `spotify:artist:${artist.id}`;
      graph.nodes.set(artistId, {
        id: artistId,
        type: 'artist',
        name: artist.name,
        weight: 1.0 - (index * 0.1), // Weight decreases by position
        genres: artist.genres,
        platform: 'spotify'
      });

      // Add edge from user to artist
      graph.edges.push({
        source: userId,
        target: artistId,
        type: 'listens_to',
        weight: 1.0 - (index * 0.1),
        platform: 'spotify'
      });
    });

    // Add tracks as nodes (limited to avoid huge graph)
    spotifyData.topTracks?.slice(0, 20).forEach((track, index) => {
      const trackId = `spotify:track:${track.id}`;
      graph.nodes.set(trackId, {
        id: trackId,
        type: 'track',
        name: track.name,
        weight: 0.8 - (index * 0.02),
        features: track.audioFeatures,
        platform: 'spotify'
      });

      // Add edge from user to track
      graph.edges.push({
        source: userId,
        target: trackId,
        type: 'plays',
        weight: 0.8 - (index * 0.02),
        platform: 'spotify'
      });

      // Connect track to its artist
      if (track.artists?.[0]) {
        const artistId = `spotify:artist:${track.artists[0].id}`;
        if (graph.nodes.has(artistId)) {
          graph.edges.push({
            source: trackId,
            target: artistId,
            type: 'by_artist',
            weight: 0.5,
            platform: 'spotify'
          });
        }
      }
    });

    // Add genre nodes (abstract concepts)
    const genres = new Set();
    spotifyData.topArtists?.forEach(artist => {
      artist.genres?.forEach(genre => genres.add(genre));
    });

    genres.forEach(genre => {
      const genreId = `concept:genre:${genre}`;
      graph.nodes.set(genreId, {
        id: genreId,
        type: 'concept',
        subtype: 'genre',
        name: genre,
        weight: 0.5,
        platform: 'spotify'
      });

      // Connect user to genre based on artist connections
      graph.edges.push({
        source: userId,
        target: genreId,
        type: 'interested_in',
        weight: 0.5,
        platform: 'spotify'
      });
    });
  }

  /**
   * Add YouTube data to graph
   */
  addYouTubeToGraph(graph, youtubeData) {
    const userId = graph.metadata.userId;

    // Add video categories as concept nodes
    const categories = new Map();
    youtubeData.watchHistory?.forEach(video => {
      if (!categories.has(video.category)) {
        categories.set(video.category, 0);
      }
      categories.set(video.category, categories.get(video.category) + 1);
    });

    categories.forEach((count, category) => {
      const categoryId = `concept:youtube:${category}`;
      graph.nodes.set(categoryId, {
        id: categoryId,
        type: 'concept',
        subtype: 'learning_topic',
        name: category,
        weight: Math.min(count / 10, 1.0), // Normalize weight
        platform: 'youtube'
      });

      graph.edges.push({
        source: userId,
        target: categoryId,
        type: 'learns_about',
        weight: Math.min(count / 10, 1.0),
        platform: 'youtube'
      });
    });

    // Add channel nodes (limited to top channels)
    const channels = new Map();
    youtubeData.watchHistory?.forEach(video => {
      if (!channels.has(video.channelTitle)) {
        channels.set(video.channelTitle, 0);
      }
      channels.set(video.channelTitle, channels.get(video.channelTitle) + 1);
    });

    // Only add top 10 channels
    Array.from(channels.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([channel, count]) => {
        const channelId = `youtube:channel:${channel}`;
        graph.nodes.set(channelId, {
          id: channelId,
          type: 'channel',
          name: channel,
          weight: Math.min(count / 10, 1.0),
          platform: 'youtube'
        });

        graph.edges.push({
          source: userId,
          target: channelId,
          type: 'subscribes_to',
          weight: Math.min(count / 10, 1.0),
          platform: 'youtube'
        });
      });
  }

  /**
   * Add GitHub data to graph
   */
  addGitHubToGraph(graph, githubData) {
    const userId = graph.metadata.userId;

    // Add programming languages as concept nodes
    const languages = githubData.languages || {};
    Object.entries(languages).forEach(([language, bytes]) => {
      const langId = `concept:language:${language}`;
      graph.nodes.set(langId, {
        id: langId,
        type: 'concept',
        subtype: 'programming_language',
        name: language,
        weight: Math.min(bytes / 100000, 1.0), // Normalize
        platform: 'github'
      });

      graph.edges.push({
        source: userId,
        target: langId,
        type: 'codes_in',
        weight: Math.min(bytes / 100000, 1.0),
        platform: 'github'
      });
    });

    // Add repository nodes
    githubData.repositories?.slice(0, 10).forEach(repo => {
      const repoId = `github:repo:${repo.name}`;
      graph.nodes.set(repoId, {
        id: repoId,
        type: 'repository',
        name: repo.name,
        weight: 0.7,
        stars: repo.stargazers_count,
        platform: 'github'
      });

      graph.edges.push({
        source: userId,
        target: repoId,
        type: 'contributes_to',
        weight: 0.7,
        platform: 'github'
      });
    });
  }

  /**
   * Calculate graph metrics (invisible to user)
   * These get converted to insights by InsightGenerator
   */
  async calculateMetrics(userId, graph) {
    console.log(`[GraphProcessor] Calculating metrics for user ${userId}`);

    const metrics = {
      // Basic counts
      nodeCount: graph.nodes.size,
      edgeCount: graph.edges.length,

      // Degree metrics
      degree: this.calculateDegree(userId, graph),
      weightedDegree: this.calculateWeightedDegree(userId, graph),

      // Clustering coefficient (how connected are your interests)
      clusteringCoefficient: this.calculateClusteringCoefficient(userId, graph),

      // Betweenness centrality (are you a bridge between different areas)
      betweennessCentrality: this.calculateBetweenness(userId, graph),

      // Diversity score (how varied are your interests)
      diversityScore: this.calculateDiversity(graph),

      // Platform balance (how evenly distributed across platforms)
      platformBalance: this.calculatePlatformBalance(graph),

      // Concept density (how many abstract concepts vs concrete items)
      conceptDensity: this.calculateConceptDensity(graph),

      // Calculated at
      calculatedAt: new Date()
    };

    console.log(`[GraphProcessor] Metrics calculated:`, {
      degree: metrics.degree,
      clustering: metrics.clusteringCoefficient.toFixed(2),
      betweenness: metrics.betweennessCentrality.toFixed(2),
      diversity: metrics.diversityScore.toFixed(2)
    });

    return metrics;
  }

  /**
   * Calculate degree (number of connections)
   */
  calculateDegree(nodeId, graph) {
    let degree = 0;
    graph.edges.forEach(edge => {
      if (edge.source === nodeId || edge.target === nodeId) {
        degree++;
      }
    });
    return degree;
  }

  /**
   * Calculate weighted degree (sum of edge weights)
   */
  calculateWeightedDegree(nodeId, graph) {
    let weightedDegree = 0;
    graph.edges.forEach(edge => {
      if (edge.source === nodeId || edge.target === nodeId) {
        weightedDegree += edge.weight || 1;
      }
    });
    return weightedDegree;
  }

  /**
   * Calculate clustering coefficient
   * Measures how connected your interests are to each other
   */
  calculateClusteringCoefficient(nodeId, graph) {
    // Get neighbors
    const neighbors = new Set();
    graph.edges.forEach(edge => {
      if (edge.source === nodeId) neighbors.add(edge.target);
      if (edge.target === nodeId) neighbors.add(edge.source);
    });

    if (neighbors.size < 2) return 0;

    // Count edges between neighbors
    let edgesBetweenNeighbors = 0;
    graph.edges.forEach(edge => {
      if (neighbors.has(edge.source) && neighbors.has(edge.target)) {
        edgesBetweenNeighbors++;
      }
    });

    // Calculate clustering coefficient
    const possibleEdges = (neighbors.size * (neighbors.size - 1)) / 2;
    return possibleEdges > 0 ? edgesBetweenNeighbors / possibleEdges : 0;
  }

  /**
   * Calculate betweenness centrality (simplified)
   * Measures if you're a bridge between different areas
   */
  calculateBetweenness(nodeId, graph) {
    // Simplified: count how many different node types are connected
    const connectedTypes = new Set();
    graph.edges.forEach(edge => {
      if (edge.source === nodeId) {
        const targetNode = graph.nodes.get(edge.target);
        if (targetNode) connectedTypes.add(targetNode.type);
      }
      if (edge.target === nodeId) {
        const sourceNode = graph.nodes.get(edge.source);
        if (sourceNode) connectedTypes.add(sourceNode.type);
      }
    });

    // Normalize by possible types
    const possibleTypes = ['artist', 'track', 'concept', 'channel', 'repository'];
    return connectedTypes.size / possibleTypes.length;
  }

  /**
   * Calculate diversity score
   */
  calculateDiversity(graph) {
    const types = new Map();
    graph.nodes.forEach(node => {
      if (!types.has(node.type)) types.set(node.type, 0);
      types.set(node.type, types.get(node.type) + 1);
    });

    // Shannon entropy for diversity
    let entropy = 0;
    const total = graph.nodes.size;
    types.forEach(count => {
      const p = count / total;
      if (p > 0) entropy -= p * Math.log2(p);
    });

    // Normalize to 0-1
    return Math.min(entropy / 2, 1);
  }

  /**
   * Calculate platform balance
   */
  calculatePlatformBalance(graph) {
    const platforms = new Map();
    graph.edges.forEach(edge => {
      if (!platforms.has(edge.platform)) platforms.set(edge.platform, 0);
      platforms.set(edge.platform, platforms.get(edge.platform) + 1);
    });

    if (platforms.size === 0) return 0;

    // Calculate variance
    const values = Array.from(platforms.values());
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;

    // Lower variance = better balance
    return 1 / (1 + variance / 100);
  }

  /**
   * Calculate concept density
   */
  calculateConceptDensity(graph) {
    let conceptCount = 0;
    graph.nodes.forEach(node => {
      if (node.type === 'concept') conceptCount++;
    });
    return graph.nodes.size > 0 ? conceptCount / graph.nodes.size : 0;
  }

  /**
   * Get user metrics (for admin dashboard)
   */
  getUserMetrics(userId) {
    return this.userMetrics.get(userId) || null;
  }

  /**
   * Get user graph (for admin visualization)
   */
  getUserGraph(userId) {
    return this.userGraphs.get(userId) || null;
  }

  /**
   * Get all metrics for admin monitoring
   */
  getAllMetrics() {
    const allMetrics = [];
    this.userMetrics.forEach((metrics, userId) => {
      allMetrics.push({ userId, ...metrics });
    });
    return allMetrics;
  }
}

export default new GraphProcessor();