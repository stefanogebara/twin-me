// Minimal twin-chat route for MVP
// All twin chat functionality has been removed for the simplified MVP

import express from 'express';
const router = express.Router();

// Placeholder endpoint - returns 501 Not Implemented
router.post('/chat', (req, res) => {
  res.status(501).json({
    error: 'Twin chat functionality is not available in the MVP version'
  });
});

export default router;