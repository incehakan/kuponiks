/**
 * PM2 production process file for Deal Finder backend.
 *
 * Usage:
 *   npm run build
 *   pm2 start ecosystem.config.cjs
 *   pm2 status
 *   pm2 logs
 *
 * Requires Redis + PostgreSQL and a populated .env (NODE_ENV=production).
 * Named `.cjs` because package.json has `"type": "module"`.
 */
module.exports = {
  apps: [
    {
      name: "api-server",
      script: "dist/server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      kill_timeout: 10_000,
      env: {
        NODE_ENV: "production",
        PROCESS_ROLE: "api",
        // Shared VDS: maprithm already uses :3000
        PORT: "3010",
      },
      error_file: "./logs/api-server-error.log",
      out_file: "./logs/api-server-out.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "scraper-worker",
      script: "dist/scraper/worker.main.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      // Puppeteer + adapters can use significant memory under load.
      max_memory_restart: "1G",
      kill_timeout: 30_000,
      env: {
        NODE_ENV: "production",
        PROCESS_ROLE: "worker",
      },
      error_file: "./logs/scraper-worker-error.log",
      out_file: "./logs/scraper-worker-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
