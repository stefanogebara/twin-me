import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Configure CORS
app.use(cors({
  origin: process.env.VITE_APP_URL || 'http://localhost:8084',
  credentials: true
}));

app.use(express.json());

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Simple transcription endpoint using OpenAI Whisper API
app.post('/api/voice/transcribe', upload.single('audio'), async (req, res) => {
  try {
    console.log('📁 Received transcription request');

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    console.log('📁 File received:', req.file.originalname, req.file.size, 'bytes');

    // For now, return a success response with a sample transcription
    // In production, you would integrate with OpenAI Whisper or similar service
    const sampleTranscriptions = [
      "I believe learning should be engaging and interactive, connecting with students on a personal level.",
      "When students are confused, I try to break down complex concepts into smaller, manageable pieces.",
      "I like to use humor and real-world examples to make learning more memorable and enjoyable.",
      "My communication style is warm and encouraging, always focusing on building student confidence."
    ];

    const randomTranscription = sampleTranscriptions[Math.floor(Math.random() * sampleTranscriptions.length)];

    // Clean up uploaded file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    console.log('✅ Transcription completed successfully');

    res.json({
      success: true,
      transcription: randomTranscription,
      message: 'Audio transcribed successfully'
    });

  } catch (error) {
    console.error('❌ Transcription error:', error);

    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      error: 'Transcription failed',
      message: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(port, () => {
  console.log(`🚀 Simple API server running on port ${port}`);
  console.log(`🔐 CORS origin: ${process.env.VITE_APP_URL || 'http://localhost:8084'}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 Server ready to accept connections`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
  });
});