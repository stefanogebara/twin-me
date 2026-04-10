/**
 * Twin Pipeline API Routes
 *
 * Endpoints for managing the digital twin formation pipeline.
 */

import express from "express";
import twinPipelineOrchestrator from "../services/twinPipelineOrchestrator.js";
import twinFormationService from "../services/twinFormationService.js";
import twinEvolutionService from "../services/twinEvolutionService.js";
import { authenticateUser } from "../middleware/auth.js";
import { createLogger } from "../services/logger.js";

const log = createLogger("TwinPipeline");

const router = express.Router();

/**
 * POST /api/twin/form
 * Trigger the full twin formation pipeline
 */
router.post("/form", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID required",
      });
    }

    const options = {
      forceRefresh: req.body.forceRefresh || false,
    };

    const result = await twinPipelineOrchestrator.runFullPipeline(
      userId,
      options,
    );

    res.json(result);
  } catch (error) {
    log.error("Form error:", error);
    res.status(500).json({
      success: false,
      error:
        process.env.NODE_ENV !== "production"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * GET /api/twin/status/:userId
 * Get current pipeline and twin status
 */
router.get("/status/:userId", authenticateUser, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Forbidden", message: "Access denied" });
    }

    const status = await twinPipelineOrchestrator.getFullTwinStatus(userId);

    res.json(status);
  } catch (error) {
    log.error("Status error:", error);
    res.status(500).json({
      success: false,
      error:
        process.env.NODE_ENV !== "production"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * GET /api/twin/profile/:userId
 * Get the complete twin profile
 */
router.get("/profile/:userId", authenticateUser, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Forbidden", message: "Access denied" });
    }

    const twinResult = await twinFormationService.getTwin(userId);

    if (!twinResult.success) {
      return res.status(404).json({
        success: false,
        error: "Twin not found",
        message: "Run the formation pipeline first",
      });
    }

    res.json({
      success: true,
      twin: twinResult.twin,
      personality: null,
    });
  } catch (error) {
    log.error("Profile error:", error);
    res.status(500).json({
      success: false,
      error:
        process.env.NODE_ENV !== "production"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * POST /api/twin/refresh/:platform
 * Refresh data from a single platform
 */
router.post("/refresh/:platform", authenticateUser, async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID required",
      });
    }

    const result = await twinPipelineOrchestrator.runIncrementalUpdate(
      userId,
      platform,
    );

    res.json(result);
  } catch (error) {
    log.error("Refresh error:", error);
    res.status(500).json({
      success: false,
      error:
        process.env.NODE_ENV !== "production"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * GET /api/twin/evolution/:userId
 * Get evolution history and timeline
 */
router.get("/evolution/:userId", authenticateUser, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Forbidden", message: "Access denied" });
    }

    const { limit = 10, timeRange } = req.query;

    const [historyResult, timelineResult, summaryResult] = await Promise.all([
      twinEvolutionService.getEvolutionHistory(userId, {
        limit: parseInt(limit),
        timeRange: timeRange ? parseInt(timeRange) : null,
      }),
      twinEvolutionService.getScoreTimeline(userId, { limit: 30 }),
      twinEvolutionService.getEvolutionSummary(userId),
    ]);

    res.json({
      success: true,
      history: historyResult.events,
      timeline: timelineResult.timeline,
      trends: timelineResult.trends,
      summary: summaryResult.success ? summaryResult.summary : null,
    });
  } catch (error) {
    log.error("Evolution error:", error);
    res.status(500).json({
      success: false,
      error:
        process.env.NODE_ENV !== "production"
          ? error.message
          : "Internal server error",
    });
  }
});

/**
 * GET /api/twin/personality/:userId
 * Get just the personality scores with confidence
 */
router.get("/personality/:userId", authenticateUser, (_req, res) => {
  res.status(410).json({ success: false, error: "OCEAN personality scores removed — use soul signature layers instead" });
});

/**
 * GET /api/twin/pipeline-status/:userId
 * Get real-time pipeline execution status
 */
router.get("/pipeline-status/:userId", authenticateUser, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Forbidden", message: "Access denied" });
    }

    const status = twinPipelineOrchestrator.getPipelineStatus(userId);

    res.json({
      success: true,
      ...status,
    });
  } catch (error) {
    log.error("Pipeline status error:", error);
    res.status(500).json({
      success: false,
      error:
        process.env.NODE_ENV !== "production"
          ? error.message
          : "Internal server error",
    });
  }
});

export default router;
// TEST_MARKER_12345
