# Privacy System Backend Implementation

## Overview

This document describes the comprehensive backend implementation for the Soul Signature Privacy Spectrum Dashboard. The system provides granular privacy controls through contextual twins, cluster-based settings, and audience-specific configurations.

## Architecture

### Database Schema

The privacy system uses 5 main tables in Supabase:

1. **`privacy_settings`** - User-specific global privacy configuration
2. **`contextual_twins`** - User-created twins for different contexts (Professional, Social, Dating, etc.)
3. **`cluster_definitions`** - Life cluster definitions (Hobbies, Career, Skills, etc.)
4. **`user_cluster_settings`** - User-specific privacy settings for each cluster
5. **`audience_presets`** - Preset configurations for different audiences

### Key Features

- **Contextual Twins**: Users can create multiple digital twins, each with different privacy settings
- **Cluster-Based Privacy**: Granular control over 15+ life clusters (hobbies, career, entertainment, etc.)
- **Audience Presets**: Pre-configured settings for Everyone, Professional, Friends, Intimate, and Dating contexts
- **Audit Logging**: Complete audit trail of all privacy changes
- **Row Level Security (RLS)**: Database-level security ensuring users can only access their own data

## File Structure

```
twin-ai-learn/
├── database/supabase/migrations/
│   ├── privacy_settings_schema.sql          # Original privacy schema
│   └── 20250106000000_contextual_twins_privacy.sql  # Contextual twins enhancement
├── api/
│   ├── services/
│   │   └── privacyService.js                # Database operations & business logic
│   └── routes/
│       └── privacy-settings.js              # RESTful API endpoints
└── src/types/
    └── privacy.ts                           # TypeScript type definitions
```

## API Endpoints

### Privacy Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/privacy-settings` | Get user's privacy settings |
| PUT | `/api/privacy-settings` | Update privacy settings |
| POST | `/api/privacy-settings/apply-template/:templateId` | Apply a privacy template |
| GET | `/api/privacy-settings/statistics` | Get privacy statistics |

### Contextual Twins

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/privacy-settings/twins` | Get all contextual twins |
| GET | `/api/privacy-settings/twins/:twinId` | Get specific twin |
| POST | `/api/privacy-settings/twins` | Create new twin |
| PUT | `/api/privacy-settings/twins/:twinId` | Update twin |
| DELETE | `/api/privacy-settings/twins/:twinId` | Delete twin |
| POST | `/api/privacy-settings/twins/:twinId/activate` | Activate twin |
| POST | `/api/privacy-settings/twins/deactivate` | Deactivate current twin |

### Clusters

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/privacy-settings/clusters/definitions` | Get all cluster definitions |
| GET | `/api/privacy-settings/clusters` | Get user's cluster settings |
| PUT | `/api/privacy-settings/clusters/:clusterId/privacy` | Update cluster privacy level |
| PUT | `/api/privacy-settings/clusters/:clusterId/toggle` | Enable/disable cluster |

### Audience Presets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/privacy-settings/presets` | Get all audience presets |
| POST | `/api/privacy-settings/presets/:presetKey/apply` | Apply audience preset |

### Audit Log

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/privacy-settings/audit-log` | Get privacy audit log |

## Usage Examples

### 1. Create a Contextual Twin

```javascript
// POST /api/privacy-settings/twins
const response = await fetch('/api/privacy-settings/twins', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    name: 'Professional',
    description: 'My work persona - optimized for career networking',
    twin_type: 'professional',
    cluster_settings: {
      career: { privacyLevel: 90, enabled: true },
      skills: { privacyLevel: 95, enabled: true },
      education: { privacyLevel: 85, enabled: true },
      hobbies: { privacyLevel: 20, enabled: false }
    },
    color: '#3B82F6',
    icon: 'Briefcase'
  })
});

const { data: twin } = await response.json();
```

### 2. Activate a Twin

```javascript
// POST /api/privacy-settings/twins/:twinId/activate
const response = await fetch(`/api/privacy-settings/twins/${twinId}/activate`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### 3. Update Cluster Privacy

```javascript
// PUT /api/privacy-settings/clusters/:clusterId/privacy
const response = await fetch(`/api/privacy-settings/clusters/hobbies/privacy`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    privacyLevel: 75
  })
});
```

### 4. Apply Audience Preset

```javascript
// POST /api/privacy-settings/presets/:presetKey/apply
const response = await fetch('/api/privacy-settings/presets/professional/apply', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

## Default Cluster Definitions

The system comes with 15 pre-defined life clusters:

### Personal Clusters
- **Hobbies & Interests** (default sensitivity: 60)
- **Sports & Fitness** (default sensitivity: 55)
- **Spirituality & Religion** (default sensitivity: 70)
- **Entertainment Choices** (default sensitivity: 50)
- **Social Connections** (default sensitivity: 65)
- **Travel & Experiences** (default sensitivity: 55)
- **Food & Dining** (default sensitivity: 45)

### Professional Clusters
- **Studies & Education** (default sensitivity: 40)
- **Career & Jobs** (default sensitivity: 45)
- **Skills & Expertise** (default sensitivity: 35)
- **Achievements & Recognition** (default sensitivity: 40)
- **Professional Network** (default sensitivity: 50)

### Creative Clusters
- **Artistic Expression** (default sensitivity: 60)
- **Content Creation** (default sensitivity: 55)
- **Musical Identity** (default sensitivity: 50)
- **Writing & Literature** (default sensitivity: 55)

## Default Audience Presets

### Everyone (Public)
- Global privacy: 40%
- Professional clusters: High visibility
- Personal clusters: Low visibility

### Professional
- Global privacy: 60%
- Career/Skills/Education: 90-95% visibility
- Personal/Creative: 15-30% visibility

### Friends
- Global privacy: 80%
- Most clusters: 80-95% visibility
- Spirituality: 50% visibility

### Intimate
- Global privacy: 100%
- All clusters: 100% visibility

### Dating
- Global privacy: 75%
- Entertainment/Hobbies/Music: 90-95% visibility
- Career: 50% visibility
- Spirituality: 60% visibility

## Default Contextual Twins

When a user creates an account, 4 default twins are automatically created:

1. **Professional Twin**
   - Career-focused settings
   - High visibility for professional clusters
   - Low visibility for personal clusters

2. **Social Twin**
   - Friend-focused settings
   - High visibility for hobbies, entertainment, social connections
   - Moderate visibility for professional clusters

3. **Dating Twin**
   - Personality showcase
   - High visibility for interests, entertainment, travel
   - Moderate visibility for career/education

4. **Public Twin**
   - Safe for everyone
   - Moderate visibility for skills and achievements
   - Low visibility for personal information

## Database Functions

### `create_default_contextual_twins(p_user_id UUID)`
Creates 4 default contextual twins for a new user.

### `apply_contextual_twin(p_user_id UUID, p_twin_id UUID)`
Applies a contextual twin's settings to the user's privacy configuration. Updates activation tracking and creates audit log entry.

### `get_twin_cluster_privacy(p_twin_id UUID, p_cluster_id TEXT)`
Gets the effective privacy level for a cluster in a contextual twin, considering global overrides.

### `is_cluster_enabled_in_twin(p_twin_id UUID, p_cluster_id TEXT)`
Checks if a cluster is enabled in a contextual twin.

## Security Considerations

### Row Level Security (RLS)
All tables have RLS enabled with policies ensuring:
- Users can only view/modify their own data
- System presets are read-only
- Audit logs are write-only for users (read-only access)

### Authentication
All API endpoints require authentication via JWT token. The `authMiddleware` extracts and validates the user ID from the token.

### Input Validation
- Privacy levels must be 0-100
- Twin types must be valid enum values
- Cluster settings must conform to expected structure
- Boolean fields are strictly validated

## Migration Instructions

### 1. Run Database Migrations

```bash
# Run the original privacy schema
psql -h your-supabase-host -d postgres -f database/supabase/migrations/privacy_settings_schema.sql

# Run the contextual twins enhancement
psql -h your-supabase-host -d postgres -f database/supabase/migrations/20250106000000_contextual_twins_privacy.sql
```

### 2. Update Server Configuration

Add the privacy routes to your Express server:

```javascript
// In api/server.js or similar
const privacySettingsRoutes = require('./routes/privacy-settings');

// Mount the routes
app.use('/api/privacy-settings', privacySettingsRoutes);
```

### 3. Environment Variables

Ensure these variables are set:

```env
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-jwt-secret
```

## Testing

### Manual Testing

```bash
# Test getting privacy settings
curl -X GET http://localhost:3001/api/privacy-settings \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test creating a twin
curl -X POST http://localhost:3001/api/privacy-settings/twins \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Twin","twin_type":"custom","cluster_settings":{}}'

# Test activating a twin
curl -X POST http://localhost:3001/api/privacy-settings/twins/TWIN_ID/activate \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Integration Testing

```javascript
// Example test using Jest
describe('Privacy Settings API', () => {
  it('should create privacy settings for new user', async () => {
    const response = await request(app)
      .get('/api/privacy-settings')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('global_privacy');
  });
});
```

## Troubleshooting

### Common Issues

1. **"Unauthorized - User ID not found"**
   - Ensure JWT token is valid and included in Authorization header
   - Check that JWT middleware is properly configured

2. **"Privacy level must be between 0 and 100"**
   - Validate input values before sending to API
   - Ensure values are integers, not strings

3. **"Contextual twin not found or does not belong to user"**
   - Verify twin ID is correct
   - Ensure user owns the twin (can't activate another user's twin)

4. **RLS Policy Errors**
   - Verify Supabase RLS policies are correctly set up
   - Check that user authentication is working

## Future Enhancements

- [ ] Batch update operations for multiple clusters
- [ ] Schedule twin activations (e.g., "Use Professional twin during work hours")
- [ ] Privacy recommendation engine based on usage patterns
- [ ] Export/import privacy configurations
- [ ] Privacy sharing (temporarily share specific clusters with specific users)
- [ ] Time-limited privacy overrides
- [ ] Privacy analytics dashboard

## Support

For questions or issues:
- GitHub Issues: [Create an issue](https://github.com/your-repo/issues)
- Documentation: [Full docs](https://your-docs-site.com)
- Email: support@twin-ai-learn.com

---

**Version**: 1.0.0
**Last Updated**: January 6, 2025
**Author**: Backend Architecture Team
