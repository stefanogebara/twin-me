/**
 * Open Wearables API Client
 *
 * Client for communicating with the self-hosted Open Wearables service.
 * Open Wearables is an open-source platform that unifies wearable device data
 * from multiple providers (Garmin, Polar, Suunto, Whoop, Apple Health).
 *
 * Docs: http://localhost:8000/docs
 * GitHub: https://github.com/the-momentum/open-wearables
 */

class OpenWearablesService {
  constructor() {
    this.baseUrl = process.env.OPEN_WEARABLES_URL || 'http://localhost:8000';
    this.apiKey = process.env.OPEN_WEARABLES_API_KEY;
  }

  /**
   * Make a request to the Open Wearables API
   */
  async request(method, endpoint, data = null) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Open-Wearables-API-Key': this.apiKey
      }
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, options);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[OpenWearables] API error (${response.status}):`, errorText);
        throw new Error(`Open Wearables API error: ${response.status} - ${errorText}`);
      }

      // Handle empty responses
      const text = await response.text();
      if (!text) return null;

      return JSON.parse(text);
    } catch (error) {
      console.error('[OpenWearables] Request failed:', error.message);
      throw error;
    }
  }

  /**
   * Create a user in Open Wearables (maps to TwinMe user)
   * @param {string} twinmeUserId - The TwinMe user ID
   * @param {string} email - User's email
   */
  async createUser(twinmeUserId, email) {
    console.log('[OpenWearables] Creating user:', { twinmeUserId, email });
    return this.request('POST', '/api/v1/users', {
      external_id: twinmeUserId,
      email
    });
  }

  /**
   * Get user by external ID (TwinMe user ID)
   * @param {string} twinmeUserId - The TwinMe user ID
   */
  async getUser(twinmeUserId) {
    return this.request('GET', `/api/v1/users/external/${twinmeUserId}`);
  }

  /**
   * Get user by Open Wearables user ID
   * @param {string} owUserId - The Open Wearables user ID
   */
  async getUserById(owUserId) {
    return this.request('GET', `/api/v1/users/${owUserId}`);
  }

  /**
   * Generate connection link for a wearable provider
   * @param {string} owUserId - Open Wearables user ID
   * @param {string} provider - Provider name ('garmin', 'polar', 'suunto', 'whoop', 'apple_health')
   * @param {string} callbackUrl - URL to redirect after OAuth
   */
  async getConnectionLink(owUserId, provider, callbackUrl) {
    console.log('[OpenWearables] Getting connection link:', { owUserId, provider });
    // Open Wearables uses GET /api/v1/oauth/{provider}/authorize endpoint
    const params = new URLSearchParams({
      user_id: owUserId,
      redirect_uri: callbackUrl
    });
    return this.request('GET', `/api/v1/oauth/${provider}/authorize?${params}`);
  }

  /**
   * Get user's connected providers
   * @param {string} owUserId - Open Wearables user ID
   */
  async getConnections(owUserId) {
    return this.request('GET', `/api/v1/users/${owUserId}/connections`);
  }

  /**
   * Disconnect a provider
   * @param {string} owUserId - Open Wearables user ID
   * @param {string} provider - Provider name to disconnect
   */
  async disconnectProvider(owUserId, provider) {
    console.log('[OpenWearables] Disconnecting provider:', { owUserId, provider });
    return this.request('DELETE', `/api/v1/users/${owUserId}/connections/${provider}`);
  }

  /**
   * Get activities (workouts) for a user
   * @param {string} owUserId - Open Wearables user ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   */
  async getActivities(owUserId, startDate, endDate) {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    return this.request('GET', `/api/v1/users/${owUserId}/activities?${params}`);
  }

  /**
   * Get sleep data for a user
   * @param {string} owUserId - Open Wearables user ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   */
  async getSleep(owUserId, startDate, endDate) {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    return this.request('GET', `/api/v1/users/${owUserId}/sleep?${params}`);
  }

  /**
   * Get daily summaries (steps, calories, etc.)
   * @param {string} owUserId - Open Wearables user ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   */
  async getDailySummaries(owUserId, startDate, endDate) {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    return this.request('GET', `/api/v1/users/${owUserId}/daily?${params}`);
  }

  /**
   * Get heart rate data
   * @param {string} owUserId - Open Wearables user ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   */
  async getHeartRate(owUserId, startDate, endDate) {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    return this.request('GET', `/api/v1/users/${owUserId}/heart-rate?${params}`);
  }

  /**
   * Get all data types for a user in a single call
   * @param {string} owUserId - Open Wearables user ID
   * @param {number} days - Number of days to fetch (default: 30)
   */
  async getAllData(owUserId, days = 30) {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log('[OpenWearables] Fetching all data:', { owUserId, startDate, endDate });

    // Fetch all data types in parallel
    const [activities, sleep, daily, heartRate] = await Promise.all([
      this.getActivities(owUserId, startDate, endDate).catch(err => {
        console.warn('[OpenWearables] Failed to fetch activities:', err.message);
        return [];
      }),
      this.getSleep(owUserId, startDate, endDate).catch(err => {
        console.warn('[OpenWearables] Failed to fetch sleep:', err.message);
        return [];
      }),
      this.getDailySummaries(owUserId, startDate, endDate).catch(err => {
        console.warn('[OpenWearables] Failed to fetch daily summaries:', err.message);
        return [];
      }),
      this.getHeartRate(owUserId, startDate, endDate).catch(err => {
        console.warn('[OpenWearables] Failed to fetch heart rate:', err.message);
        return [];
      })
    ]);

    return {
      activities: activities || [],
      sleep: sleep || [],
      daily: daily || [],
      heartRate: heartRate || []
    };
  }

  /**
   * Check if the Open Wearables service is available
   */
  async healthCheck() {
    try {
      // Open Wearables returns {"message":"Server is running!"} at root
      const response = await fetch(`${this.baseUrl}/`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export default new OpenWearablesService();
