# YouTube Insights Components

YouTube visualization components for the Soul Signature platform, following the existing Spotify and Netflix design patterns.

## Components Overview

### 1. YouTubeInsights (Main Container)
Main container component that orchestrates all YouTube insights visualization.

**Features:**
- YouTube red branding (#FF0000)
- Loading, error, and empty states
- Header with stats (videos watched, categories, hours watched)
- Grid layout for child components
- "View on YouTube" external link

**Usage:**
```tsx
import { YouTubeInsights } from '@/components/youtube';

<YouTubeInsights userId={user.id} />
```

### 2. TopVideosCard
Displays the top 5 most watched videos with engagement metrics.

**Features:**
- Video title, channel name
- View count with eye icon
- Duration with clock icon
- YouTube red progress bars showing relative popularity
- Smooth animations on load

### 3. CategoryDistributionChart
Pie chart showing content category distribution.

**Features:**
- Recharts PieChart with donut style
- YouTube red color scheme (8 color variations)
- Interactive tooltips with percentage, count, and watch time
- Animated legend with hover effects
- Watch time displayed in hours/minutes

### 4. WatchPatternsCard
Behavioral insights about viewing patterns.

**Features:**
- Peak viewing hours (formatted as time range)
- Average videos per session
- Average watch duration
- Completion rate percentage
- Weekday vs Weekend horizontal bar chart
- Icon-based visual hierarchy

### 5. TopChannelsCard
Shows favorite YouTube creators.

**Features:**
- Channel name with subscriber count
- Videos watched count
- Average watch time per video
- YouTube red progress bars
- Responsive layout with truncation

### 6. RecentlyWatchedCard
Timeline of recently watched videos.

**Features:**
- Grid layout (1-4 columns responsive)
- Video title and channel
- Duration badge
- Relative time (e.g., "2 hours ago") using date-fns
- Hover effects on cards

## Design System

### Colors
- Primary: `#FF0000` (YouTube Red)
- Variations: `#CC0000`, `#FF4444`, `#B30000`, `#FF6B6B`, `#E60000`, `#990000`, `#FF8888`
- Backgrounds: `bg-[#FF0000]/10` for subtle accents
- Gradients: `from-[#FF0000] to-[#FF4444]` for progress bars

### Typography
- Headings: `font-heading` (Space Grotesk)
- Body: `font-body` (Source Serif 4)
- UI: `font-ui` (DM Sans)

### Spacing
- Card padding: `p-6`
- Grid gaps: `gap-6`
- Component spacing: `space-y-4` or `space-y-5`
- Base unit: 8px system

### Components
- Cards: `bg-white border border-stone-200 shadow-md hover:shadow-lg`
- Icons: Lucide React with consistent sizing
- Animations: Framer Motion with staggered delays

## Data Structure

All components consume data from `useYouTubeInsights` hook:

```typescript
interface YouTubeInsights {
  topVideos: YouTubeVideo[];
  categories: YouTubeCategory[];
  watchPatterns: WatchPatterns;
  topChannels: TopChannel[];
  recentlyWatched: RecentlyWatched[];
  totalHoursWatched: number;
  totalVideosWatched: number;
}
```

## Icons Used

From `lucide-react`:
- `Youtube` - Main brand icon
- `Video` - Video content
- `Eye` - View counts
- `Clock` - Time/duration
- `TrendingUp` - Growth/patterns
- `CheckCircle` - Completion
- `Calendar` - Weekday/weekend
- `Users` - Channels
- `Play` - Recently watched
- `LayoutGrid` - Categories

## Responsive Behavior

- Mobile (< 640px): Single column
- Tablet (640px - 1024px): 2 columns
- Desktop (> 1024px): 3 columns
- Recently Watched: Spans full width on all breakpoints

## Integration Example

```tsx
import { YouTubeInsights } from '@/components/youtube';
import { useAuth } from '@/contexts/AuthContext';

function SoulSignatureDashboard() {
  const { user } = useAuth();

  return (
    <div className="space-y-8">
      <YouTubeInsights userId={user.id} />
    </div>
  );
}
```

## Error Handling

All components include:
- Loading states with spinner
- Error states with retry button
- Empty states with connect CTA
- Graceful fallbacks for missing data

## Accessibility

- Semantic HTML structure
- ARIA labels where appropriate
- Keyboard navigation support
- Focus states on interactive elements
- Color contrast ratios meet WCAG AA standards

## Performance

- React Query for data caching (5 minute stale time)
- Lazy loading with React.lazy (if needed)
- Optimized animations with Framer Motion
- Memoized calculations for chart data
