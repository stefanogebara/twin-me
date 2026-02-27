import { registerRootComponent } from 'expo';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import App from './App';
import { widgetTaskHandler } from './src/widgets/widgetTaskHandler';

// Register the home screen widget task handler.
// This MUST be called at the module level (top of entry file) so Android
// can dispatch widget lifecycle events to it even when the app is closed.
registerWidgetTaskHandler(widgetTaskHandler);

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
