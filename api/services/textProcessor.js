/**
 * Text Processing Pipeline
 * Extracts, cleans, and normalizes text from platform data
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class TextProcessor {
  /**
   * Process all unprocessed platform data for a user
   */
  async processUserData(userId, limit = 100) {
    console.log(`[TextProcessor] Processing data for user ${userId}...`);

    try {
      // Get unprocessed data
      const { data: rawData, error } = await supabase
        .from('user_platform_data')
        .select('*')
        .eq('user_id', userId)
        .eq('processed', false)
        .limit(limit);

      if (error) {
        throw new Error('Failed to fetch unprocessed data');
      }

      if (!rawData || rawData.length === 0) {
        console.log('[TextProcessor] No unprocessed data found');
        return { processed: 0 };
      }

      let processedCount = 0;

      for (const item of rawData) {
        try {
          await this.processItem(item);
          processedCount++;
        } catch (error) {
          console.error(`[TextProcessor] Error processing item ${item.id}:`, error);
        }
      }

      console.log(`[TextProcessor] Processed ${processedCount} items`);
      return { processed: processedCount };
    } catch (error) {
      console.error('[TextProcessor] Error in processUserData:', error);
      throw error;
    }
  }

  /**
   * Process a single data item
   */
  async processItem(item) {
    // Extract text from raw data
    const text = this.extractText(item.raw_data, item.platform, item.data_type);

    if (!text || text.trim().length === 0) {
      // Mark as processed even if no text
      await this.markAsProcessed(item.id);
      return;
    }

    // Clean and normalize text
    const cleanedText = this.normalizeText(text);

    if (cleanedText.length < 10) {
      // Too short, skip
      await this.markAsProcessed(item.id);
      return;
    }

    // Detect language (simple heuristic for now)
    const language = this.detectLanguage(cleanedText);

    // Extract context
    const context = this.extractContext(item.raw_data, item.platform, item.data_type);

    // Store processed text
    await this.storeTextContent({
      user_id: item.user_id,
      platform_data_id: item.id,
      text_content: cleanedText,
      content_type: this.mapContentType(item.data_type),
      language,
      word_count: this.countWords(cleanedText),
      char_count: cleanedText.length,
      platform: item.platform,
      timestamp: context.timestamp || item.extracted_at,
      context
    });

    // Mark as processed
    await this.markAsProcessed(item.id);
  }

  /**
   * Extract text from raw data based on platform and type
   */
  extractText(rawData, platform, dataType) {
    try {
      switch (platform) {
        case 'github':
          return this.extractGitHubText(rawData, dataType);
        case 'discord':
          return this.extractDiscordText(rawData, dataType);
        case 'linkedin':
          return this.extractLinkedInText(rawData, dataType);
        default:
          return '';
      }
    } catch (error) {
      console.error(`[TextProcessor] Error extracting text:`, error);
      return '';
    }
  }

  /**
   * Extract text from GitHub data
   */
  extractGitHubText(rawData, dataType) {
    switch (dataType) {
      case 'commit':
        return rawData.message || '';
      case 'issue':
        return `${rawData.title}\n\n${rawData.body || ''}`;
      case 'issue_comment':
        return rawData.body || '';
      case 'pull_request':
        return `${rawData.title}\n\n${rawData.body || ''}`;
      case 'code_review':
        return rawData.body || '';
      case 'repository':
        return rawData.description || '';
      default:
        return '';
    }
  }

  /**
   * Extract text from Discord data
   */
  extractDiscordText(rawData, dataType) {
    switch (dataType) {
      case 'profile':
        return `${rawData.global_name || rawData.username}`;
      case 'guild':
        return rawData.name || '';
      case 'connection':
        return `${rawData.type}: ${rawData.name}`;
      default:
        return '';
    }
  }

  /**
   * Extract text from LinkedIn data
   */
  extractLinkedInText(rawData, dataType) {
    switch (dataType) {
      case 'profile':
        return `${rawData.name || ''} ${rawData.given_name || ''} ${rawData.family_name || ''}`;
      case 'post':
        return rawData.text || rawData.commentary || '';
      case 'comment':
        return rawData.message || '';
      default:
        return '';
    }
  }

  /**
   * Clean and normalize text
   */
  normalizeText(text) {
    if (!text) return '';

    // Remove URLs
    text = text.replace(/https?:\/\/[^\s]+/g, '[URL]');

    // Remove code blocks (keep code separate for code analysis)
    text = text.replace(/```[\s\S]*?```/g, '[CODE_BLOCK]');

    // Remove inline code
    text = text.replace(/`[^`]+`/g, '[CODE]');

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    // Normalize unicode
    text = text.normalize('NFKC');

    // Remove excessive punctuation
    text = text.replace(/([!?.]){2,}/g, '$1');

    return text;
  }

  /**
   * Detect language (simple heuristic)
   */
  detectLanguage(text) {
    // Very basic detection - check for common English words
    const englishWords = ['the', 'is', 'are', 'and', 'or', 'to', 'of', 'in', 'for', 'on'];
    const words = text.toLowerCase().split(/\s+/);

    let englishCount = 0;
    for (const word of words.slice(0, 100)) {
      if (englishWords.includes(word)) {
        englishCount++;
      }
    }

    // If more than 20% are common English words, assume English
    return englishCount / Math.min(words.length, 100) > 0.2 ? 'en' : 'unknown';
  }

  /**
   * Extract context from raw data
   */
  extractContext(rawData, platform, dataType) {
    const context = {};

    switch (platform) {
      case 'github':
        context.repo = rawData.repo || rawData.full_name;
        context.url = rawData.url;
        if (dataType === 'commit') {
          context.sha = rawData.sha;
          context.additions = rawData.additions;
          context.deletions = rawData.deletions;
        } else if (dataType === 'issue' || dataType === 'pull_request') {
          context.number = rawData.number;
          context.state = rawData.state;
          context.labels = rawData.labels;
        }
        context.timestamp = rawData.timestamp || rawData.created_at;
        break;

      case 'discord':
        if (dataType === 'guild') {
          context.guild_name = rawData.name;
          context.guild_id = rawData.id;
          context.member_count = rawData.approximate_member_count;
        }
        break;

      case 'linkedin':
        if (dataType === 'profile') {
          context.name = rawData.name;
          context.locale = rawData.locale;
        }
        break;
    }

    return context;
  }

  /**
   * Map data type to content type
   */
  mapContentType(dataType) {
    const mapping = {
      'commit': 'message',
      'issue': 'post',
      'issue_comment': 'comment',
      'pull_request': 'post',
      'code_review': 'comment',
      'repository': 'description',
      'guild': 'metadata',
      'profile': 'metadata',
      'connection': 'metadata',
      'post': 'post',
      'comment': 'comment'
    };

    return mapping[dataType] || 'other';
  }

  /**
   * Count words in text
   */
  countWords(text) {
    return text.split(/\s+/).filter(w => w.length > 0).length;
  }

  /**
   * Store processed text in database
   */
  async storeTextContent(data) {
    try {
      const { error } = await supabase
        .from('user_text_content')
        .insert(data);

      if (error) {
        console.error('[TextProcessor] Error storing text:', error);
        throw error;
      }
    } catch (error) {
      console.error('[TextProcessor] Exception storing text:', error);
      throw error;
    }
  }

  /**
   * Mark platform data as processed
   */
  async markAsProcessed(platformDataId) {
    try {
      await supabase
        .from('user_platform_data')
        .update({ processed: true })
        .eq('id', platformDataId);
    } catch (error) {
      console.error('[TextProcessor] Error marking as processed:', error);
    }
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(userId) {
    try {
      const { data: total } = await supabase
        .from('user_platform_data')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      const { data: processed } = await supabase
        .from('user_platform_data')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('processed', true);

      const { data: textCount } = await supabase
        .from('user_text_content')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      return {
        totalRawItems: total || 0,
        processedItems: processed || 0,
        textItems: textCount || 0,
        pendingItems: (total || 0) - (processed || 0)
      };
    } catch (error) {
      console.error('[TextProcessor] Error getting stats:', error);
      return null;
    }
  }
}

module.exports = new TextProcessor();
