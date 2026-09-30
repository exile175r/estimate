import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {baseURL:'http://127.0.0.1:8000',viewport:{width:1440,height:1000},headless:true,screenshot:'only-on-failure',trace:'retain-on-failure'},
  reporter: [['list']],
  webServer: {command:'node scripts/serve.js',url:'http://127.0.0.1:8000',reuseExistingServer:!process.env.CI}
});
