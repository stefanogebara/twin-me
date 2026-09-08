import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App), and sets the
// environment up the same way whether the app runs in a dev client or a store build.
registerRootComponent(App);
