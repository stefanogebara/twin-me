# Spotify Musical Soul Signature Components

Beautiful visualization components for displaying Spotify listening data as part of the Twin AI Learn Soul Signature platform.

## Overview

The Spotify Musical Soul Signature is a comprehensive visualization card that showcases a user's authentic listening personality extracted from their Spotify data. It consists of five sub-components that work together to provide deep insights into musical preferences, patterns, and personality.

## Components

### 1. SpotifyMusicInsights (Main Container)

The main container component that orchestrates all Spotify visualizations.

**Location:** `src/components/spotify/SpotifyMusicInsights.tsx`

**Props:**
```typescript
interface SpotifyMusicInsightsProps {
  userId: string;        // User ID to fetch Spotify data for
  className?: string;    // Optional CSS classes
}
```

**Features:**
- Fetches real data from `/api/test-extraction/spotify-insights/:userId`
- Loading state with animated spinner
- Error state with retry functionality
- Empty state with call-to-action to connect Spotify
- Responsive grid layout (1 col mobile, 2 cols tablet, 3 cols desktop)
- Framer Motion animations for smooth entrance

**Usage:**
```tsx
import { SpotifyMusicInsights } from '@/components/spotify';

<SpotifyMusicInsights userId={user.id} />
```

---

### 2. TopArtistsCard

Displays the user's top 5 most-listened artists with play counts and visual bars.

**Location:** `src/components/spotify/TopArtistsCard.tsx`

**Props:**
```typescript
interface TopArtistsCardProps {
  artists: SpotifyArtist[];
  className?: string;
}

interface SpotifyArtist {
  name: string;
  plays: number;
  genre: string;
  popularity: number;
}
```

**Features:**
- Visual bar chart representation of play counts
- Trending indicator for high-popularity artists (80+)
- Genre labels for each artist
- Animated bars on load
- Empty state handling

**Design:**
- Spotify green accent (#1DB954)
- Music2 icon from lucide-react
- Truncated text for long artist names
- Staggered animation delays

---

### 3. GenreDistributionChart

Shows genre breakdown as a donut chart with percentage distribution.

**Location:** `src/components/spotify/GenreDistributionChart.tsx`

**Props:**
```typescript
interface GenreDistributionChartProps {
  genres: SpotifyGenre[];
  className?: string;
}

interface SpotifyGenre {
  genre: string;
  percentage: number;
  count: number;
}
```

**Features:**
- Recharts donut chart visualization
- Top 5 genres displayed
- Custom color palette (8 colors)
- Interactive tooltips with track counts
- Color-coded legend below chart
- Empty state handling

**Design:**
- Disc3 icon from lucide-react
- Inner radius: 60px, Outer radius: 100px
- 3px padding between segments
- Custom tooltip with genre name, percentage, and track count

---

### 4. ListeningPatternsCard

Visualizes time-based listening habits and patterns.

**Location:** `src/components/spotify/ListeningPatternsCard.tsx`

**Props:**
```typescript
interface ListeningPatternsCardProps {
  patterns: SpotifyListeningPatterns;
  className?: string;
}

interface SpotifyListeningPatterns {
  peakHours: {
    start: number;      // 0-23 hour format
    end: number;        // 0-23 hour format
    label: string;      // e.g., "Evening listener"
  };
  weekdayVsWeekend: {
    weekday: number;    // Minutes listened on weekdays
    weekend: number;    // Minutes listened on weekends
  };
  averageSessionLength: number;  // Minutes
  skipRate: number;              // Percentage (0-100)
  totalMinutesListened: number;  // Total listening time
}
```

**Features:**
- Peak listening hours with AM/PM formatting
- Weekday vs Weekend comparison bars
- Total listening time (hours + minutes)
- Average session length
- Skip rate visualization
- Multiple animated sections

**Design:**
- Clock icon from lucide-react
- Gradient bars for weekday (green) and weekend (orange)
- Stats grid with bordered cards
- Staggered entrance animations

---

### 5. AudioFeaturesRadar

Displays audio personality traits as a radar chart.

**Location:** `src/components/spotify/AudioFeaturesRadar.tsx`

**Props:**
```typescript
interface AudioFeaturesRadarProps {
  audioFeatures: SpotifyAudioFeatures;
  className?: string;
}

interface SpotifyAudioFeatures {
  averageEnergy: number;          // 0-1 scale
  averageValence: number;         // 0-1 scale (positivity)
  averageDanceability: number;    // 0-1 scale
  averageAcousticness: number;    // 0-1 scale
  averageInstrumentalness: number;// 0-1 scale
}
```

**Features:**
- 5-axis radar chart using Recharts
- Audio features scaled to 0-100% for display
- Musical personality insight badge
- Feature legend with percentages
- Interactive tooltips with descriptions

**Personality Insights:**
- "High-energy party enthusiast" (energy > 0.7, dance > 0.7)
- "Upbeat and positive listener" (valence > 0.7, dance > 0.6)
- "Mellow and contemplative" (acoustic > 0.6, energy < 0.5)
- "Intense and dramatic" (energy > 0.6, valence < 0.5)
- "Rhythm-focused groove lover" (dance > 0.7)
- "Balanced and diverse taste" (default)

**Design:**
- Activity icon from lucide-react
- Spotify green radar fill with 35% opacity
- 2px stroke width
- Polar grid with stone-200 color

---

## Data Hook

### useSpotifyInsights

Custom React Query hook for fetching Spotify insights.

**Location:** `src/hooks/useSpotifyInsights.ts`

**Usage:**
```typescript
import { useSpotifyInsights } from '@/hooks/useSpotifyInsights';

const { data, isLoading, isError, error, refetch } = useSpotifyInsights({
  userId: user.id,
  enabled: true  // Optional, defaults to true
});
```

**Features:**
- TanStack React Query integration
- 5-minute stale time
- 2 retry attempts
- Automatic refetching on window focus
- Type-safe TypeScript interfaces

**API Endpoint:**
```
GET /api/test-extraction/spotify-insights/:userId
```

---

## Design System Integration

### Colors
- **Spotify Green:** `#1DB954` (primary accent)
- **Hover Green:** `#1ed760`
- **Background Ivory:** `#FAF9F5` (from design system)
- **Surface White:** `#FFFFFF`
- **Text Stone:** Various stone shades (900, 700, 600, 500, 400)
- **Orange Accent:** `#D97706` (secondary accent from design system)

### Typography
- **Headings:** `font-heading` (Space Grotesk)
- **Body Text:** `font-body` (Source Serif 4)
- **UI Elements:** `font-ui` (DM Sans)
- **Monospace:** `font-mono` (for numbers)

### Spacing
- Card padding: `p-6` (24px)
- Section margins: `mb-8` (32px)
- Grid gaps: `gap-6` (24px)
- Component gaps: `gap-2`, `gap-3` (8px, 12px)

### Shadows & Borders
- Cards: `shadow-md hover:shadow-lg`
- Borders: `border border-stone-200`
- Spotify accent borders: `border-[#1DB954]/20`

### Animations
- Framer Motion for entrance animations
- Staggered delays (0.1s increments)
- Easing: `ease-out` for most animations
- Chart animations: 800ms duration, 200ms delay

---

## Responsive Breakpoints

```css
/* Mobile (default) */
grid-cols-1

/* Tablet (768px+) */
md:grid-cols-2

/* Desktop (1024px+) */
lg:grid-cols-3
```

### Layout Strategy
- **Mobile:** Single column, stack all cards vertically
- **Tablet:** 2 columns for most cards, full width for AudioFeaturesRadar
- **Desktop:** 3 columns for main cards, full width for AudioFeaturesRadar

---

## Integration with Soul Signature Dashboard

The Spotify Musical Soul Signature is integrated into the Soul Signature Dashboard between the "Roots vs Branches" and "Life Journey Timeline" sections.

**Location:** `src/pages/SoulSignatureDashboard.tsx`

**Conditional Rendering:**
```tsx
{hasConnectedServices && user?.id && (
  <div className="mb-8">
    <SpotifyMusicInsights userId={user.id} />
  </div>
)}
```

Only displays when:
1. User has connected services
2. User ID is available
3. Spotify data extraction has been completed

---

## API Response Format

Expected response from `/api/test-extraction/spotify-insights/:userId`:

```typescript
{
  topArtists: [
    {
      name: "Artist Name",
      plays: 1234,
      genre: "Genre Name",
      popularity: 85
    }
  ],
  topTracks: [
    {
      name: "Track Name",
      artist: "Artist Name",
      plays: 567,
      duration_ms: 240000
    }
  ],
  genres: [
    {
      genre: "Pop",
      percentage: 35.5,
      count: 142
    }
  ],
  listeningPatterns: {
    peakHours: {
      start: 18,
      end: 22,
      label: "Evening listener"
    },
    weekdayVsWeekend: {
      weekday: 12000,  // minutes
      weekend: 8000    // minutes
    },
    averageSessionLength: 45.5,  // minutes
    skipRate: 12.3,              // percentage
    totalMinutesListened: 20000
  },
  audioFeatures: {
    averageEnergy: 0.72,
    averageValence: 0.65,
    averageDanceability: 0.68,
    averageAcousticness: 0.25,
    averageInstrumentalness: 0.15
  }
}
```

---

## Error Handling

### Loading State
- Animated spinner with Spotify green
- "Analyzing Your Musical Soul" message
- Centered layout with icon

### Error State
- Red accent card with AlertCircle icon
- Error message display
- "Try Again" button with refetch functionality

### Empty State
- Spotify green icon
- "No Spotify Data Yet" message
- "Connect Spotify" CTA button
- Redirects to `/get-started`

---

## Performance Considerations

1. **React Query Caching:** 5-minute stale time reduces API calls
2. **Lazy Loading:** Component only fetches when visible and enabled
3. **Optimized Animations:** requestAnimationFrame for smooth 60fps
4. **Responsive Images:** Icons use SVG for crisp rendering
5. **Memoization:** Charts only re-render when data changes

---

## Accessibility

- **Semantic HTML:** Proper heading hierarchy (h2, h3)
- **ARIA Labels:** Descriptive labels on interactive elements
- **Color Contrast:** WCAG AA compliant (4.5:1 for text)
- **Keyboard Navigation:** All interactive elements focusable
- **Screen Reader:** Meaningful alt text and descriptions
- **Focus Indicators:** Visible focus rings on buttons

---

## Future Enhancements

1. **Time Range Selection:** Last 4 weeks, 6 months, all time
2. **Top Tracks Card:** Display favorite songs with album art
3. **Playlist Insights:** Analysis of user-created playlists
4. **Listening Mood Timeline:** Visualize emotional journey
5. **Artist Network Graph:** Connections between favorite artists
6. **Seasonal Trends:** How taste changes over months
7. **Social Comparison:** Anonymous benchmarks vs other users
8. **Export Feature:** Download insights as PDF or image

---

## Maintenance Notes

- **Recharts Version:** 2.15.4 (ensure compatibility)
- **Framer Motion Version:** 12.23.13
- **Lucide React Version:** 0.462.0
- **API Endpoint:** Ensure backend route exists at `/api/test-extraction/spotify-insights/:userId`

---

## Testing Checklist

- [ ] Loading state displays correctly
- [ ] Error state handles API failures gracefully
- [ ] Empty state shows when no data available
- [ ] Top artists display with correct play counts
- [ ] Genre chart renders with proper percentages
- [ ] Listening patterns show accurate time data
- [ ] Audio features radar displays personality insight
- [ ] Responsive layout works on mobile, tablet, desktop
- [ ] Animations are smooth and performant
- [ ] Colors match Spotify branding and design system
- [ ] Tooltips display on hover
- [ ] Data refetch works on error retry

---

## Credits

Designed and implemented for the Twin AI Learn Soul Signature platform, adhering to Anthropic-inspired design principles with Spotify's brand integration.
