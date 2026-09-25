import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ranjha.internet',
  appName: 'Ranjha7star',
  webDir: 'dist/ranjha-internet/browser',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SystemBars: {
      // Edge-to-edge: inject --safe-area-inset-* so the web layout pads itself.
      insetsHandling: 'css',
      // index.html uses viewport-fit=cover; hinting it avoids a layout jump on launch.
      initialViewportFitValueHint: 'cover',
      // The app is light-only: keep status/nav bar icons dark even in system dark mode.
      style: 'LIGHT'
    }
  }
};

export default config;
