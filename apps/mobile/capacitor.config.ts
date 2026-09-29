import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.zmail',
  appName: 'zmail',
  webDir: '../../packages/web/dist',
  backgroundColor: '#1677ff',
  android: {
    allowMixedContent: false,
    backgroundColor: '#1677ff',
  },
  server: {
    // WebView 以 https 源加载本地打包页面，避免明文限制
    androidScheme: 'https',
    cleartext: false,
  },
};

export default config;
