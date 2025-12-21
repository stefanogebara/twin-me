const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'api', 'services', 'database.js');

// Read current content
let content = fs.readFileSync(filePath, 'utf8');

// Check if methods already exist
if (content.includes('upsertPlatformConnection')) {
  console.log('✅ Database methods already exist - skipping');
  process.exit(0);
}

// Define new methods to add
const newMethods = `
  // Platform connection operations (for Pipedream Gmail OAuth)
  async upsertPlatformConnection({ userId, platform, accountId, connectedAt, status, metadata }) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) throw new Error('Database not available');

    try {
      const { data, error } = await supabaseAdmin
        .from('platform_connections')
        .upsert({
          user_id: userId,
          platform,
          account_id: accountId,
          connected_at: connectedAt,
          status,
          metadata
        }, {
          onConflict: 'user_id,platform'
        })
        .select()
        .single();

      if (error) {
        console.error('Error upserting platform connection:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Unexpected error upserting platform connection:', error);
      throw error;
    }
  },

  async getPlatformConnection(userId, platform) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) throw new Error('Database not available');

    try {
      const { data, error } = await supabaseAdmin
        .from('platform_connections')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', platform)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error getting platform connection:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Unexpected error getting platform connection:', error);
      throw error;
    }
  },

  async deletePlatformConnection(userId, platform) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) throw new Error('Database not available');

    try {
      const { error } = await supabaseAdmin
        .from('platform_connections')
        .delete()
        .eq('user_id', userId)
        .eq('platform', platform);

      if (error) {
        console.error('Error deleting platform connection:', error);
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Unexpected error deleting platform connection:', error);
      throw error;
    }
  },

  // Soul data operations (for Gmail analysis results)
  async storeSoulData({ userId, platform, dataType, rawData, extractedPatterns, privacyLevel }) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) throw new Error('Database not available');

    try {
      const { data, error } = await supabaseAdmin
        .from('soul_data')
        .insert({
          user_id: userId,
          platform,
          data_type: dataType,
          raw_data: rawData,
          extracted_patterns: extractedPatterns,
          privacy_level: privacyLevel || 50,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Error storing soul data:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Unexpected error storing soul data:', error);
      throw error;
    }
  }
};`;

// Add new methods before the closing brace
content = content.replace(/\n\};$/, `,${newMethods}\n};`);

// Write updated content
fs.writeFileSync(filePath, content, 'utf8');

console.log('✅ Added database methods for Pipedream Gmail integration');
console.log('   - upsertPlatformConnection');
console.log('   - getPlatformConnection');
console.log('   - deletePlatformConnection');
console.log('   - storeSoulData');
