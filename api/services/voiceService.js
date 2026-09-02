import axios from 'axios';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { createLogger } from './logger.js';

const log = createLogger('Voice');

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

class VoiceService {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
    this.defaultVoiceId = 'pNInz6obpgDQGcFmaJgB'; // Adam voice

    if (!this.apiKey || this.apiKey === 'your_elevenlabs_api_key_here') {
      log.warn('ElevenLabs API key not configured. Voice features will be disabled.');
      this.enabled = false;
    } else {
      this.enabled = true;
    }

    // Initialize OpenAI for speech-to-text
    // Speech-to-text: prefer OpenAI direct; fall back to OpenRouter's Whisper proxy
    // (verified working 2026-08-31: POST /audio/transcriptions with model
    // openai/whisper-1, ~$0.006/min). Same SDK, different baseURL + model id.
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    if (openaiApiKey && openaiApiKey !== 'your_openai_api_key_here') {
      this.openai = new OpenAI({ apiKey: openaiApiKey });
      this.sttModel = 'whisper-1';
      this.speechToTextEnabled = true;
    } else if (openrouterApiKey) {
      this.openai = new OpenAI({
        apiKey: openrouterApiKey,
        baseURL: 'https://openrouter.ai/api/v1',
      });
      this.sttModel = 'openai/whisper-1';
      this.speechToTextEnabled = true;
      log.info('Speech-to-text via OpenRouter Whisper proxy (no direct OpenAI key)');
    } else {
      log.warn('Neither OpenAI nor OpenRouter API key configured. Speech-to-text will be disabled.');
      this.speechToTextEnabled = false;
    }
  }

  /**
   * Check if voice service is available
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Get available voices from ElevenLabs
   */
  async getAvailableVoices() {
    if (!this.enabled) {
      throw new Error('Voice service not available - API key not configured');
    }

    try {
      const response = await axios.get(`${this.baseUrl}/voices`, {
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        voices: response.data.voices.map(voice => ({
          id: voice.voice_id,
          name: voice.name,
          description: voice.description,
          category: voice.category,
          labels: voice.labels,
          preview_url: voice.preview_url,
          available_for_tiers: voice.available_for_tiers
        }))
      };
    } catch (error) {
      log.error('Failed to fetch voices:', error);
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  }

  /**
   * Convert text to speech using ElevenLabs
   */
  async textToSpeech(text, voiceId = null, options = {}) {
    if (!this.enabled) {
      throw new Error('Voice service not available - API key not configured');
    }

    const {
      stability = 0.5,
      similarity_boost = 0.8,
      style = 0.0,
      use_speaker_boost = true
    } = options;

    const selectedVoiceId = voiceId || this.defaultVoiceId;

    try {
      const response = await axios.post(
        `${this.baseUrl}/text-to-speech/${selectedVoiceId}`,
        {
          text: text,
          // eleven_monolingual_v1 was deprecated by ElevenLabs (400 unsupported_model,
          // caught in QA 2026-08-31). multilingual_v2 covers pt-BR for Presence calls.
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability,
            similarity_boost,
            style,
            use_speaker_boost
          }
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
          },
          responseType: 'arraybuffer'
        }
      );

      return {
        success: true,
        audioBuffer: response.data,
        contentType: 'audio/mpeg'
      };
    } catch (error) {
      log.error('Text-to-speech failed:', error);
      return {
        success: false,
        error: error.response?.data ? new TextDecoder().decode(error.response.data) : error.message
      };
    }
  }

  /**
   * Clone a voice from an audio sample
   */
  async cloneVoice(audioFilePath, voiceName, description = '') {
    if (!this.enabled) {
      throw new Error('Voice service not available - API key not configured');
    }

    try {
      // Native fetch + FormData: the previous axios call mixed the global (undici)
      // FormData with the form-data package's getHeaders(), which doesn't exist on
      // the native class — cloning crashed before ever reaching ElevenLabs
      // (TypeError caught in QA 2026-08-31). fetch sets the multipart boundary itself.
      const audioData = fs.readFileSync(audioFilePath);
      const formData = new FormData();

      formData.append('name', voiceName);
      formData.append('description', description);
      formData.append('files', new Blob([audioData], { type: 'audio/mpeg' }), path.basename(audioFilePath));

      const response = await fetch(`${this.baseUrl}/voices/add`, {
        method: 'POST',
        headers: { 'xi-api-key': this.apiKey },
        body: formData
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        return {
          success: false,
          error: detail?.detail || `ElevenLabs returned ${response.status}`
        };
      }

      const data = await response.json();
      return {
        success: true,
        voiceId: data.voice_id,
        message: 'Voice cloned successfully'
      };
    } catch (error) {
      log.error('Voice cloning failed:', error);
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  }

  /**
   * Add more samples to an existing cloned voice (improves fidelity over time).
   */
  async addSamplesToVoice(voiceId, audioFilePath, voiceName) {
    if (!this.enabled) {
      throw new Error('Voice service not available - API key not configured');
    }
    try {
      const audioData = fs.readFileSync(audioFilePath);
      const formData = new FormData();
      if (voiceName) formData.append('name', voiceName);
      formData.append('files', new Blob([audioData], { type: 'audio/mpeg' }), path.basename(audioFilePath));
      const response = await fetch(`${this.baseUrl}/voices/${voiceId}/edit`, {
        method: 'POST',
        headers: { 'xi-api-key': this.apiKey },
        body: formData
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        return { success: false, error: detail?.detail || `ElevenLabs returned ${response.status}` };
      }
      return { success: true };
    } catch (error) {
      log.error('Adding voice samples failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a cloned voice
   */
  async deleteVoice(voiceId) {
    if (!this.enabled) {
      throw new Error('Voice service not available - API key not configured');
    }

    try {
      await axios.delete(`${this.baseUrl}/voices/${voiceId}`, {
        headers: {
          'xi-api-key': this.apiKey
        }
      });

      return {
        success: true,
        message: 'Voice deleted successfully'
      };
    } catch (error) {
      log.error('Voice deletion failed:', error);
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  }

  /**
   * Get voice settings
   */
  async getVoiceSettings(voiceId) {
    if (!this.enabled) {
      throw new Error('Voice service not available - API key not configured');
    }

    try {
      const response = await axios.get(`${this.baseUrl}/voices/${voiceId}/settings`, {
        headers: {
          'xi-api-key': this.apiKey
        }
      });

      return {
        success: true,
        settings: response.data
      };
    } catch (error) {
      log.error('Failed to get voice settings:', error);
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  }

  /**
   * Update voice settings
   */
  async updateVoiceSettings(voiceId, settings) {
    if (!this.enabled) {
      throw new Error('Voice service not available - API key not configured');
    }

    try {
      const response = await axios.post(`${this.baseUrl}/voices/${voiceId}/settings/edit`, settings, {
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        message: 'Voice settings updated successfully'
      };
    } catch (error) {
      log.error('Failed to update voice settings:', error);
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  }

  /**
   * Get user subscription info
   */
  async getUserInfo() {
    if (!this.enabled) {
      throw new Error('Voice service not available - API key not configured');
    }

    try {
      const response = await axios.get(`${this.baseUrl}/user`, {
        headers: {
          'xi-api-key': this.apiKey
        }
      });

      return {
        success: true,
        user: response.data
      };
    } catch (error) {
      log.error('Failed to get user info:', error);
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  }

  /**
   * Save audio buffer to file
   */
  async saveAudioToFile(audioBuffer, filename, outputDir = './uploads/audio') {
    try {
      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const filePath = path.join(outputDir, filename);
      fs.writeFileSync(filePath, audioBuffer);

      return {
        success: true,
        filePath,
        filename
      };
    } catch (error) {
      log.error('Failed to save audio file:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate speech for a twin's message
   */
  async generateTwinSpeech(text, twinId, voiceId = null) {
    if (!this.enabled) {
      return {
        success: false,
        error: 'Voice service not available'
      };
    }

    try {
      // Generate speech
      const speechResult = await this.textToSpeech(text, voiceId);

      if (!speechResult.success) {
        return speechResult;
      }

      // Save to file
      const filename = `twin_${twinId}_${Date.now()}.mp3`;
      const saveResult = await this.saveAudioToFile(speechResult.audioBuffer, filename);

      if (!saveResult.success) {
        return saveResult;
      }

      return {
        success: true,
        audioUrl: `/api/audio/${filename}`,
        filename: saveResult.filename,
        filePath: saveResult.filePath
      };
    } catch (error) {
      log.error('Failed to generate twin speech:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process voice upload for twin cloning
   */
  async processTwinVoiceUpload(audioFilePath, twinId, twinName) {
    if (!this.enabled) {
      return {
        success: false,
        error: 'Voice service not available'
      };
    }

    try {
      const voiceName = `${twinName}_Twin_${twinId.substring(0, 8)}`;
      const description = `Cloned voice for digital twin: ${twinName}`;

      const cloneResult = await this.cloneVoice(audioFilePath, voiceName, description);

      if (!cloneResult.success) {
        return cloneResult;
      }

      return {
        success: true,
        voiceId: cloneResult.voiceId,
        voiceName,
        message: 'Voice successfully cloned for twin'
      };
    } catch (error) {
      log.error('Failed to process twin voice upload:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Convert speech to text using OpenAI Whisper
   */
  async speechToText(audioFile) {
    if (!this.speechToTextEnabled) {
      throw new Error('Speech-to-text service not available - no OpenAI or OpenRouter API key configured');
    }

    try {
      // No language pin: Whisper auto-detects. The old hardcoded 'en' would have
      // mistranscribed Portuguese (Presence conversations are pt-BR).
      // response_format 'json' works on both OpenAI direct and OpenRouter's proxy
      // (OpenRouter rejects 'text' with a 400 — found in QA 2026-08-31).
      const transcription = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: this.sttModel,
        response_format: 'json'
      });

      return {
        success: true,
        transcription: (transcription.text ?? String(transcription)).trim()
      };
    } catch (error) {
      log.error('Speech-to-text failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get default voice options for different twin types
   */
  getDefaultVoiceOptions() {
    return {
      professor: {
        stability: 0.7,
        similarity_boost: 0.8,
        style: 0.2,
        use_speaker_boost: true
      },
      personal: {
        stability: 0.5,
        similarity_boost: 0.7,
        style: 0.0,
        use_speaker_boost: true
      }
    };
  }
}

// Create singleton instance
export const voiceService = new VoiceService();

// Export class for testing
export { VoiceService };

export default voiceService;