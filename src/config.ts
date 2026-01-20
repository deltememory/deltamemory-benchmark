// Configuration - Azure OpenAI only
// Load .env file
import { config as dotenvConfig } from 'dotenv'
dotenvConfig()

export const config = {
  // DeltaMemory
  deltamemory: {
    url: process.env.DELTAMEMORY_URL || 'http://localhost:6969',
    apiKey: process.env.DELTAMEMORY_API_KEY || '',
  },
  
  // Azure OpenAI
  azure: {
    endpoint: process.env.AZURE_ENDPOINT || '',
    apiKey: process.env.AZURE_API_KEY || '',
    model: process.env.AZURE_MODEL || 'gpt-4.1',
    apiVersion: process.env.AZURE_API_VERSION || '2024-12-01-preview',
  },
  
  // Paths
  dataPath: process.env.DATA_PATH || './data/locomo10.json',
  resultsDir: './results',
  stateDir: './state',
}

export function validateConfig() {
  const missing: string[] = []
  
  if (!config.azure.endpoint) missing.push('AZURE_ENDPOINT')
  if (!config.azure.apiKey) missing.push('AZURE_API_KEY')
  
  if (missing.length > 0) {
    console.error(`❌ Missing environment variables: ${missing.join(', ')}`)
    console.error('   Create a .env file (see .env.example)')
    process.exit(1)
  }
}
