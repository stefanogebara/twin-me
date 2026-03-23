/**
 * TwinInsightWidget
 * =================
 * Android home-screen widget that shows the latest twin insight.
 *
 * Uses `react-native-android-widget` layout primitives:
 *   FlexWidget, TextWidget — these map to Android RemoteViews.
 *
 * Data: widget task handler reads the cached insight from AsyncStorage
 * (key: 'widget:latest_insight') which HomeScreen writes on every refresh.
 *
 * Requires a rebuild after adding react-native-android-widget:
 *   cd mobile/android && ./gradlew assembleRelease --quiet
 */

import React from 'react';
import { FlexWidget, TextWidget, ImageWidget } from 'react-native-android-widget';

export interface WidgetInsight {
  text: string;
  category?: string;
  memoriesTotal?: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  personality: '#8b5cf6',
  lifestyle: '#10b981',
  cultural: '#C9B99A',
  social: '#3b82f6',
  motivation: '#D4CBBE',
};

interface Props {
  insight: WidgetInsight;
}

export function TwinInsightWidget({ insight }: Props) {
  const dotColor = (CATEGORY_COLORS[insight.category ?? ''] ?? '#8b5cf6') as `#${string}`;
  const displayText = insight.text.length > 120
    ? insight.text.slice(0, 117) + '…'
    : insight.text;
  const memoriesLabel = insight.memoriesTotal
    ? `${insight.memoriesTotal.toLocaleString()} memories`
    : 'TwinMe';

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: '#FAFAF8',
        borderRadius: 24,
        padding: 16,
        justifyContent: 'space-between',
      }}
      clickAction="OPEN_APP"
    >
      {/* Header row */}
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 8 }}>
        <ImageWidget
          image={require('../../assets/flower-hero.png')}
          imageWidth={18}
          imageHeight={18}
        />
        <TextWidget
          text="TwinMe"
          style={{
            fontSize: 11,
            color: '#9CA3AF',
            fontFamily: 'Inter_500Medium',
            letterSpacing: 0.5,
          }}
        />
      </FlexWidget>

      {/* Insight text */}
      <FlexWidget
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'flex-start',
          flexGap: 8,
          marginTop: 10,
          marginBottom: 10,
        }}
      >
        {/* Category dot */}
        <FlexWidget
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: dotColor,
            marginTop: 5,
          }}
        />
        {/* Text wrapped in FlexWidget to get flex:1 */}
        <FlexWidget style={{ flex: 1 }}>
          <TextWidget
            text={displayText}
            style={{
              fontSize: 13,
              color: '#1C1917',
              fontFamily: 'Inter_400Regular',
            }}
            maxLines={5}
          />
        </FlexWidget>
      </FlexWidget>

      {/* Footer */}
      <TextWidget
        text={memoriesLabel}
        style={{
          fontSize: 10,
          color: '#A8A29E',
          fontFamily: 'Inter_400Regular',
        }}
      />
    </FlexWidget>
  );
}

/** Widget shown when no data has been loaded yet */
export function TwinInsightWidgetEmpty() {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: '#FAFAF8',
        borderRadius: 24,
        padding: 16,
        justifyContent: 'center',
        alignItems: 'center',
        flexGap: 8,
      }}
      clickAction="OPEN_APP"
    >
      <ImageWidget
        image={require('../../assets/flower-hero.png')}
        imageWidth={28}
        imageHeight={28}
      />
      <TextWidget
        text="Open TwinMe to load your soul signature"
        style={{
          fontSize: 12,
          color: '#9CA3AF',
          fontFamily: 'Inter_400Regular',
          textAlign: 'center',
        }}
        maxLines={2}
      />
    </FlexWidget>
  );
}
