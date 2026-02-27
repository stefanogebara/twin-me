/**
 * Widget Task Handler
 * ===================
 * Handles Android home screen widget lifecycle events.
 * Registered in mobile/index.ts via registerWidgetTaskHandler().
 *
 * Events handled:
 *   WIDGET_ADDED    — widget placed on home screen for the first time
 *   WIDGET_RESIZED  — user resized the widget
 *   WIDGET_UPDATE   — periodic refresh (configured in app.json)
 *   WIDGET_DELETED  — widget removed (cleanup if needed)
 *
 * Data: reads 'widget:latest_insight' from AsyncStorage.
 * HomeScreen.tsx writes this key on every successful insight fetch.
 */

import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  TwinInsightWidget,
  TwinInsightWidgetEmpty,
  type WidgetInsight,
} from './TwinInsightWidget';

export const WIDGET_STORAGE_KEY = 'widget:latest_insight';

async function getStoredInsight(): Promise<WidgetInsight | null> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WidgetInsight;
  } catch {
    return null;
  }
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const insight = await getStoredInsight();

      if (insight) {
        props.renderWidget(React.createElement(TwinInsightWidget, { insight }));
      } else {
        props.renderWidget(React.createElement(TwinInsightWidgetEmpty));
      }
      break;
    }
    case 'WIDGET_DELETED':
    case 'WIDGET_CLICK':
      // Nothing to handle
      break;
    default:
      break;
  }
}
