# Privacy Controls System - Implementation Guide

## Overview

The Twin AI Learn platform features a sophisticated "What's To Reveal, What's To Share" privacy control system that gives users granular control over their soul signature data. This document outlines the complete implementation.

## Architecture

### Frontend Components

#### 1. **IntensitySlider** (`src/components/IntensitySlider.tsx`)
Thermometer-style slider with visual feedback for privacy levels (0-100%).

**Features:**
- Visual thermometer metaphor with gradient colors
- Privacy level milestones (Hidden, Intimate, Friends, Professional, Public)
- Real-time value indicator
- Smooth animations using Framer Motion
- Accessibility compliant

**Usage:**
```tsx
<IntensitySlider
  value={privacyLevel}
  onChange={(newValue) => setPrivacyLevel(newValue)}
  label="Entertainment Privacy"
  description="Control visibility of your viewing habits"
  showThermometer={true}
/>
```

#### 2. **AudienceSelector** (`src/components/AudienceSelector.tsx`)
Manages audience-specific twin configurations (Professional, Social, Dating, etc.).

**Features:**
- Default audiences (Public, Professional, Social, Dating, Educational)
- Custom audience creation
- Visual color-coded cards
- Duplicate and edit capabilities
- Privacy level preview per audience

**Usage:**
```tsx
<AudienceSelector
  audiences={audiences}
  selectedAudienceId={currentAudience}
  onSelectAudience={(id) => setCurrentAudience(id)}
  onCreateAudience={() => openAudienceCreator()}
/>
```

#### 3. **PrivacyPreview** (`src/components/PrivacyPreview.tsx`)
Shows exactly what will be shared with the selected audience.

**Features:**
- Real-time preview of revealed/hidden data
- Cluster-based filtering
- Sensitive data warnings
- Platform-specific data breakdown
- Statistics dashboard (revealed, hidden, sensitive data)

**Usage:**
```tsx
<PrivacyPreview
  clusters={lifeClusters}
  audienceName="Professional Contacts"
/>
```

#### 4. **PrivacyTemplates** (`src/components/PrivacyTemplates.tsx`)
Quick presets for different privacy scenarios.

**Features:**
- 6 default templates (Maximum Privacy, Professional Only, etc.)
- Custom template creation
- Usage tracking
- Export/import individual templates
- Visual template cards with gradient effects

**Default Templates:**
- Maximum Privacy (0% - complete lockdown)
- Professional Only (focused on career data)
- Social Butterfly (high personal, low professional)
- Balanced Sharing (moderate across all)
- Full Transparency (100% - complete openness)
- Dating Profile (personality-focused)

**Usage:**
```tsx
<PrivacyTemplates
  templates={templates}
  activeTemplateId={currentTemplate}
  onApplyTemplate={(id) => applyTemplate(id)}
  onSaveAsTemplate={() => saveCurrentAsTemplate()}
/>
```

#### 5. **ClusterControl** (`src/components/ClusterControl.tsx`)
Individual life cluster management with subcategory controls.

**Features:**
- Expandable cluster cards
- Subcluster privacy sliders
- Platform data breakdown
- Advanced settings (time-based, conditional rules)
- Enable/disable toggles
- Data expiry settings

**Life Clusters:**
- **Personal:** Hobbies, Sports, Entertainment, Social Connections
- **Professional:** Education, Career, Skills, Achievements
- **Creative:** Artistic Expression, Content Creation, Musical Identity

**Usage:**
```tsx
<ClusterControl
  cluster={hobbyCluster}
  onChange={(updated) => updateCluster(updated)}
  onSubclusterChange={(clusterId, subId, level) => {
    updateSubcluster(clusterId, subId, level);
  }}
/>
```

#### 6. **EnhancedPrivacySpectrumDashboard** (`src/components/EnhancedPrivacySpectrumDashboard.tsx`)
Main dashboard integrating all privacy components.

**Features:**
- 4 main tabs: Overview, Clusters, Templates, Preview
- Global privacy control
- Unsaved changes tracking
- Quick statistics
- Export/import configurations
- Auto-save functionality

**Usage:**
```tsx
<EnhancedPrivacySpectrumDashboard
  userId={user.id}
  onSave={async (settings) => {
    await savePrivacySettings(settings);
  }}
  onExport={() => exportSettings()}
  onImport={(config) => importSettings(config)}
/>
```

### Backend API

#### API Endpoints (`api/routes/privacy-settings.js`)

**Base URL:** `/api/privacy-settings`

##### GET `/`
Get user's current privacy settings.

**Response:**
```json
{
  "globalPrivacy": 65,
  "selectedAudienceId": "social",
  "selectedTemplateId": "uuid",
  "clusters": [...],
  "audienceSpecificSettings": {},
  "createdAt": "2025-01-04T...",
  "updatedAt": "2025-01-04T..."
}
```

##### PUT `/`
Update user's privacy settings.

**Request:**
```json
{
  "globalPrivacy": 70,
  "selectedAudienceId": "professional",
  "selectedTemplateId": "template-uuid",
  "clusters": [...],
  "audienceSpecificSettings": {}
}
```

**Response:**
```json
{
  "success": true,
  "settings": {...},
  "message": "Privacy settings updated successfully"
}
```

##### GET `/templates`
Get user's custom privacy templates.

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "My Custom Template",
    "description": "Custom configuration",
    "settings": {...},
    "icon": "Shield",
    "color": "#8B5CF6",
    "isCustom": true,
    "usageCount": 5,
    "lastUsed": "2025-01-04T..."
  }
]
```

##### POST `/templates`
Create a new custom privacy template.

**Request:**
```json
{
  "name": "Work Mode",
  "description": "High professional visibility",
  "settings": {
    "globalPrivacy": 75,
    "clusterSettings": {
      "personal": 30,
      "professional": 95,
      "creative": 50
    }
  },
  "icon": "Briefcase",
  "color": "#3B82F6"
}
```

##### PUT `/templates/:id`
Update a custom template.

##### DELETE `/templates/:id`
Delete a custom template.

##### POST `/templates/:id/apply`
Apply a template and track usage.

**Response:**
```json
{
  "success": true,
  "template": {...},
  "message": "Template 'Professional Only' applied successfully"
}
```

##### POST `/import`
Import privacy configuration from JSON.

**Request:**
```json
{
  "globalPrivacy": 60,
  "clusters": [...],
  "audienceSpecificSettings": {}
}
```

##### GET `/export`
Export complete privacy configuration.

**Response:** JSON file download with all settings.

##### GET `/audit-log`
Get privacy settings change history.

**Query Parameters:**
- `limit` (default: 50) - Number of log entries

**Response:**
```json
[
  {
    "id": "uuid",
    "userId": "user-uuid",
    "action": "update_settings",
    "previousGlobalPrivacy": 50,
    "newGlobalPrivacy": 70,
    "changedAt": "2025-01-04T..."
  }
]
```

##### POST `/reset`
Reset privacy settings to defaults.

**Response:**
```json
{
  "success": true,
  "settings": {...},
  "message": "Privacy settings reset to defaults"
}
```

### Database Schema

#### Tables

**privacy_settings**
```sql
CREATE TABLE privacy_settings (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    global_privacy INTEGER CHECK (global_privacy >= 0 AND global_privacy <= 100),
    selected_audience_id TEXT,
    selected_template_id UUID,
    clusters JSONB,
    audience_specific_settings JSONB,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

**privacy_templates**
```sql
CREATE TABLE privacy_templates (
    id UUID PRIMARY KEY,
    user_id UUID,
    name TEXT NOT NULL,
    description TEXT,
    settings JSONB NOT NULL,
    icon TEXT,
    color TEXT,
    is_default BOOLEAN,
    is_custom BOOLEAN,
    usage_count INTEGER,
    last_used TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

**privacy_audit_log**
```sql
CREATE TABLE privacy_audit_log (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    action TEXT NOT NULL,
    previous_global_privacy INTEGER,
    new_global_privacy INTEGER,
    cluster_changes JSONB,
    metadata JSONB,
    changed_at TIMESTAMPTZ
);
```

**audience_configurations**
```sql
CREATE TABLE audience_configurations (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    default_privacy_level INTEGER,
    cluster_overrides JSONB,
    icon TEXT,
    color TEXT,
    is_custom BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

#### Utility Functions

**get_effective_privacy_level(user_id, cluster_id, audience_id)**
Calculate effective privacy level considering audience-specific overrides.

**should_reveal_data(user_id, cluster_id, data_sensitivity, audience_id)**
Determine if data should be revealed based on privacy settings.

### Data Flow

1. **User adjusts privacy slider:**
   ```
   IntensitySlider → onChange → ClusterControl → EnhancedPrivacySpectrumDashboard
   → sets hasUnsavedChanges
   ```

2. **User saves settings:**
   ```
   EnhancedPrivacySpectrumDashboard → onSave → PUT /api/privacy-settings
   → Supabase (privacy_settings table)
   → privacy_audit_log (automatic trigger)
   ```

3. **User applies template:**
   ```
   PrivacyTemplates → onApplyTemplate → POST /api/privacy-settings/templates/:id/apply
   → Updates usage_count and last_used
   → Applies settings to user's privacy_settings
   ```

4. **Preview data revelation:**
   ```
   PrivacyPreview → reads clusters with privacy levels
   → filters data points based on privacy level vs. data sensitivity
   → displays revealed/hidden stats
   ```

## Setup Instructions

### 1. Database Setup

Run the migration:
```bash
psql -U postgres -d twin_ai_learn -f database/supabase/migrations/privacy_settings_schema.sql
```

Or using Supabase CLI:
```bash
supabase db push
```

### 2. Environment Variables

No additional environment variables needed - uses existing Supabase configuration.

### 3. Frontend Integration

Update `SoulSignatureDashboard.tsx`:

```tsx
import { EnhancedPrivacySpectrumDashboard } from '@/components/EnhancedPrivacySpectrumDashboard';

// In your dashboard component
{showPrivacyControls && (
  <EnhancedPrivacySpectrumDashboard
    userId={user?.id}
    onSave={async (settings) => {
      const response = await fetch('/api/privacy-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });

      if (!response.ok) throw new Error('Save failed');
    }}
  />
)}
```

### 4. Server Integration

Already integrated in `api/server.js`:
```javascript
import privacySettingsRoutes from './routes/privacy-settings.js';
app.use('/api/privacy-settings', privacySettingsRoutes);
```

## Usage Examples

### Example 1: Professional Sharing Mode

```typescript
// User wants to share career info but hide personal life
const professionalTemplate = {
  globalPrivacy: 50,
  clusterSettings: {
    personal: 20,      // Low visibility
    professional: 85,  // High visibility
    creative: 40       // Moderate visibility
  }
};

// Apply template
await fetch('/api/privacy-settings/templates/professional-only/apply', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### Example 2: Dating Profile

```typescript
// User wants to showcase personality, hide work details
const datingTemplate = {
  globalPrivacy: 65,
  clusterSettings: {
    personal: 85,      // High - show hobbies, interests
    professional: 25,  // Low - hide work info
    creative: 80       // High - showcase creativity
  }
};
```

### Example 3: Audience-Specific Sharing

```typescript
// Different privacy levels for different audiences
const settings = {
  globalPrivacy: 60,
  selectedAudienceId: 'social',
  audienceSpecificSettings: {
    'professional': {
      'hobbies': 30,
      'career': 90,
      'skills': 95
    },
    'dating': {
      'hobbies': 85,
      'career': 40,
      'creative': 90
    },
    'social': {
      'hobbies': 75,
      'career': 50,
      'creative': 70
    }
  }
};
```

## Design Principles

### Visual Design

1. **Thermometer Metaphor:** Privacy levels visualized as heat/temperature
2. **Color Coding:**
   - Gray (#6B7280) - Hidden
   - Pink (#EC4899) - Intimate
   - Purple (#8B5CF6) - Friends
   - Blue (#3B82F6) - Professional
   - Green (#10B981) - Public

3. **Animations:** Smooth transitions using Framer Motion for all state changes

4. **Glassmorphism:** Subtle transparency and blur effects on cards

### UX Principles

1. **Progressive Disclosure:** Show simple controls first, advanced settings on demand
2. **Visual Feedback:** Immediate visual response to all interactions
3. **Clear Hierarchy:** Global → Cluster → Subcluster → Platform
4. **Undo-Friendly:** Unsaved changes indicator, easy reset
5. **Preview First:** Show what will be shared before committing
6. **Audit Trail:** Complete history of privacy changes

## Security Considerations

1. **Row Level Security (RLS):** All tables have RLS policies
2. **User Isolation:** Users can only access their own settings
3. **Validation:** Privacy levels constrained to 0-100 range
4. **Audit Logging:** All changes tracked with timestamps
5. **Authentication Required:** All endpoints require JWT token
6. **Sensitive Data Protection:** Warnings for high-sensitivity data revelation

## Performance Optimization

1. **Debounced Saves:** Auto-save triggered 2 seconds after last change
2. **Lazy Loading:** Cluster controls expanded only when needed
3. **Optimistic UI:** Immediate visual feedback before server confirmation
4. **Indexed Queries:** Database indexes on user_id and template_id
5. **JSONB Efficiency:** Cluster data stored as JSONB for flexible queries

## Testing

### Unit Tests
```typescript
// Test privacy level calculation
expect(getEffectivePrivacyLevel(userId, 'hobbies', 'professional')).toBe(75);

// Test data revelation logic
expect(shouldRevealData(userId, 'career', 60, 'social')).toBe(true);
```

### Integration Tests
```typescript
// Test template application
const response = await applyTemplate('professional-only');
expect(response.settings.globalPrivacy).toBe(50);
expect(response.settings.clusters.find(c => c.id === 'career').privacyLevel).toBe(85);
```

## Troubleshooting

### Issue: Privacy settings not saving
**Solution:** Check browser console for authentication errors. Ensure JWT token is valid.

### Issue: Templates not loading
**Solution:** Verify database migration ran successfully. Check default templates inserted.

### Issue: Slider values not updating
**Solution:** Check React state updates. Ensure onChange handlers properly connected.

### Issue: Preview showing incorrect data
**Solution:** Verify privacy level vs. data sensitivity comparison logic.

## Future Enhancements

1. **AI-Powered Recommendations:** Suggest privacy levels based on usage patterns
2. **Scheduled Privacy:** Auto-adjust privacy based on time/location
3. **Collaborative Privacy:** Share privacy configs with trusted users
4. **Privacy Insights:** Analytics on what you're sharing and with whom
5. **Multi-Device Sync:** Real-time privacy updates across devices
6. **Privacy Presets per Context:** Automatic switching (work hours, weekends, etc.)

## Support

For issues or questions:
- GitHub Issues: [twin-ai-learn/issues](https://github.com/your-repo/issues)
- Documentation: `/docs/privacy-controls`
- Email: support@twinailearn.com

---

**Last Updated:** January 2025
**Version:** 1.0.0
**Author:** Twin AI Learn Team
