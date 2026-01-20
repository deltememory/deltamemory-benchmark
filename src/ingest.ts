// Ingest LoCoMo conversations into DeltaMemory

import { DeltaMemory } from 'deltamemory'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { config } from './config.js'
import { extractSessions, formatDialog, progressBar, clearLine } from './utils.js'
import type { Sample } from './types.js'

async function main() {
  console.log('🧠 DeltaMemory LoCoMo Benchmark - INGEST')
  console.log('========================================\n')

  // Check data exists
  if (!existsSync(config.dataPath)) {
    console.error(`❌ Dataset not found: ${config.dataPath}`)
    console.log('Run: npm run download')
    process.exit(1)
  }

  // Load dataset
  console.log(`📂 Loading ${config.dataPath}...`)
  const data: Sample[] = JSON.parse(readFileSync(config.dataPath, 'utf-8'))
  console.log(`   Found ${data.length} conversations\n`)

  // Connect to DeltaMemory
  const db = new DeltaMemory({
    baseUrl: config.deltamemory.url,
    apiKey: config.deltamemory.apiKey,
  })

  try {
    await db.health()
    console.log(`✅ Connected to DeltaMemory\n`)
  } catch {
    console.error(`❌ Cannot connect to DeltaMemory at ${config.deltamemory.url}`)
    process.exit(1)
  }

  // Create state directory
  mkdirSync(config.stateDir, { recursive: true })

  const state: Record<string, { collection: string; dialogs: number }> = {}

  for (let i = 0; i < data.length; i++) {
    const sample = data[i]
    const sampleId = sample.sample_id || `sample-${i}`
    const collection = `locomo-${sampleId}`

    console.log(`\n📝 [${i + 1}/${data.length}] ${sampleId}`)
    console.log(`   Speakers: ${sample.conversation.speaker_a}, ${sample.conversation.speaker_b}`)

    const sessions = extractSessions(sample.conversation)
    const totalDialogs = sessions.reduce((sum, s) => sum + s.dialogs.length, 0)
    console.log(`   Sessions: ${sessions.length}, Dialogs: ${totalDialogs}`)

    // Purge existing
    try {
      await db.purge(collection)
    } catch {}

    // Ingest dialogs
    const start = Date.now()
    let count = 0

    for (const { datetime, dialogs } of sessions) {
      for (const dialog of dialogs) {
        // Pass datetime to formatDialog for relative date resolution
        await db.ingest(formatDialog(dialog, datetime), {
          collection,
          datetime,
          speaker: dialog.speaker,
          metadata: {
            dia_id: dialog.dia_id,
          },
        })

        count++
        
        // Rate limit: 500 RPM = ~8.3 req/sec, add 150ms delay to stay safe
        await new Promise(r => setTimeout(r, 150))
        clearLine()
        process.stdout.write(`   ⏳ ${progressBar(count, totalDialogs)}`)
      }
    }

    clearLine()
    console.log(`   ✅ Ingested ${count} dialogs in ${Date.now() - start}ms`)

    state[sampleId] = { collection, dialogs: count }
  }

  // Wait for extraction
  const waitMs = parseInt(process.env.EXTRACTION_WAIT_MS || '10000')
  console.log(`\n⏳ Waiting ${waitMs / 1000}s for background extraction...`)
  await new Promise(r => setTimeout(r, waitMs))

  // Verify
  console.log('\n📊 Extraction results:')
  for (const [id, { collection }] of Object.entries(state)) {
    const stats = await db.stats(collection)
    console.log(`   ${id}: memories=${stats.memory_count}, facts=${stats.fact_count}, concepts=${stats.concept_count}`)
  }

  // Save state
  const statePath = join(config.stateDir, 'ingest.json')
  writeFileSync(statePath, JSON.stringify({ timestamp: new Date().toISOString(), samples: state }, null, 2))

  console.log('\n✅ INGEST COMPLETE')
  console.log(`   State saved to ${statePath}`)
  console.log('\n🚀 Run: npm run evaluate')
}

main().catch(console.error)
