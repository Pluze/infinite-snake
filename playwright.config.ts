import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./e2e', testMatch:'**/*.browser.ts', workers:1,
 use:{channel:process.env.PLAYWRIGHT_CHANNEL,baseURL:'http://127.0.0.1:5174', viewport:{width:1440,height:960}},
 webServer:{command:'npm run dev',url:'http://127.0.0.1:5174',reuseExistingServer:!process.env.CI},
});
