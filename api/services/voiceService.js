import axios from 'axios';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

class VoiceService {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
    this.defaultVoiceId = 'pNInz6obpgDQGcFmaJgB'; // Adam voice

    if (!this.apiKey || this.apiKey === 'your_elevenlabs_api_key_here') {
      console.warn('ElevenLabs API key not configured. Voice features will be disabled.');
      this.enabled = false;
    } else {
      this.enabled = true;
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
      console.error('Failed to fetch voices:', error);
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
          model_id: 'eleven_monolingual_v1',
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
      console.error('Text-to-speech failed:', error);
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
      const audioData = fs.readFileSync(audioFilePath);
      const formData = new FormData();

      formData.append('name', voiceName);
      formData.append('description', description);
      formData.append('files', new Blob([audioData], { type: 'audio/mpeg' }), path.basename(audioFilePath));

      const response = await axios.post(`${this.baseUrl}/voices/add`, formData, {
        headers: {
          'xi-api-key': this.apiKey,
          ...formData.getHeaders()
        }
      });

      return {
        success: true,
        voiceId: response.data.voice_id,
        message: 'Voice cloned successfully'
      };
    } catch (error) {
      console.error('Voice cloning failed:', error);
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
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
      console.error('Voice deletion failed:', error);
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
      console.error('Failed to get voice settings:', error);
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
      console.error('Failed to update voice settings:', error);
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
      console.error('Failed to get user info:', error);
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
      console.error('Failed to save audio file:', error);
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
      console.error('Failed to generate twin speech:', error);
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
      console.error('Failed to process twin voice upload:', error);
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