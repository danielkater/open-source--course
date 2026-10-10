import { defineConfig } from '@playwright/test'
import path from 'node:path'
const projectRoot = path.resolve(process.cwd(), '..')
const database = path.join(projectRoot, '.test-data', `e2e-${Date.now()}.sqlite3`)
export default defineConfig({
  testDir: './tests', fullyParallel: false, workers: 1, timeout: 60000,
  use: {baseURL: 'http://127.0.0.1:5174', viewport: {width:1536,height:1000}, trace:'retain-on-failure', screenshot:'only-on-failure'},
  reporter: [['list'], ['html',{open:'never'}]],
  webServer: [
    {command: '.venv\\Scripts\\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8001', cwd:projectRoot, url:'http://127.0.0.1:8001/api/health', reuseExistingServer:false, env:{DATABASE_PATH:database,LLM_ENABLED:'false',LLM_API_KEY:'',LLM_MODEL:''}},
    {command:'npm run dev -- --port 5174', url:'http://127.0.0.1:5174', reuseExistingServer:false, env:{API_TARGET:'http://127.0.0.1:8001'}}
  ]
})
