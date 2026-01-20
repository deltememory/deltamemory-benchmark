// Evaluate LoCoMo benchmark using Azure OpenAI

import { DeltaMemory } from 'deltamemory'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { config, validateConfig } from './config.js'
import { chat } from './azure.js'
import { progressBar, clearLine, CATEGORIES, extractNicknames, formatNicknames } from './utils.js'
import type { Sample, QuestionResult, ConversationResult } from './types.js'

// Answer generation prompt - comprehensive context usage
const ANSWER_PROMPT = `You are a conversation memory assistant. Answer the question based on ALL the provided context.

# SPEAKER NICKNAMES/ALIASES:
{{nicknames}}

# USER PROFILE (facts about the speakers):
{{profiles}}

# EVENT TIMELINE (dated events):
{{events}}

# KNOWLEDGE GRAPH (relationships and facts):
{{graph}}

# CONVERSATION MEMORIES:
{{memories}}

Question: {{question}}

Instructions:
- Search through ALL the context above to find relevant information
- Include specific dates, names, and details when available
- If multiple items are mentioned (e.g., "what books did X recommend"), list ALL of them
- For counting questions, count carefully through all memories
- Answer concisely but completely`

// LLM Judge prompt - returns JSON with reasoning (generous grading like Backboard)
const JUDGE_PROMPT = `Your task is to label an answer to a question as 'CORRECT' or 'WRONG'.

Question: {{question}}
Gold answer: {{expected}}
Generated answer: {{generated}}

The gold answer is usually concise. The generated answer might be much longer, but you should be GENEROUS with your grading:
- As long as the generated answer touches on the SAME TOPIC as the gold answer, it should be CORRECT
- For time-related questions: different formats are OK ("May 7th" = "7 May" = "May 7, 2023")
- Relative time references that match the same date/period are CORRECT
- Extra information in the generated answer is fine if it contains the key information
- Partial matches count: if the gold answer has multiple items and the generated answer has some of them, lean towards CORRECT

Return JSON: {"is_correct": true/false, "reasoning": "one sentence explanation"}`

interface JudgeResult {
  is_correct: boolean
  reasoning: string
  error: string | null
}

async function generateAnswer(
  question: string,
  nicknames: string,
  profiles: string,
  events: string,
  graph: string,
  memories: string
): Promise<string> {
  const prompt = ANSWER_PROMPT
    .replace('{{nicknames}}', nicknames || 'None')
    .replace('{{profiles}}', profiles || 'None')
    .replace('{{events}}', events || 'None')
    .replace('{{graph}}', graph || 'None')
    .replace('{{memories}}', memories || 'None')
    .replace('{{question}}', question)

  return chat([{ role: 'user', content: prompt }])
}

async function judge(question: string, expected: string, generated: string): Promise<JudgeResult> {
  const prompt = JUDGE_PROMPT
    .replace('{{question}}', question)
    .replace('{{expected}}', expected)
    .replace('{{generated}}', generated)

  try {
    const response = await chat(
      [
        { role: 'system', content: 'You are evaluating answer correctness. Return JSON only.' },
        { role: 'user', content: prompt },
      ],
      { jsonMode: true }
    )

    const result = JSON.parse(response)
    return {
      is_correct: result.is_correct === true,
      reasoning: result.reasoning || '',
      error: null,
    }
  } catch (e: any) {
    return {
      is_correct: false,
      reasoning: '',
      error: e.message || 'Failed to parse judge response',
    }
  }
}

function formatProfiles(profiles: any[]): string {
  if (!profiles?.length) return ''
  return profiles.map(p => `- ${p.topic}::${p.sub_topic}: ${p.content}`).join('\n')
}

function formatEvents(events: any[]): string {
  if (!events?.length) return ''
  return events.map(e => {
    const date = e.event_at ? new Date(e.event_at * 1000).toISOString().split('T')[0] : ''
    return `- [${date}] ${e.gist}`
  }).join('\n')
}

function formatGraph(graph: any[]): string {
  if (!graph?.length) return ''
  return graph.map(g => `- ${g.statement}`).join('\n')
}

function formatMemories(results: any[]): string {
  if (!results?.length) return ''
  return results.map(r => r.memory.content).join('\n')
}

// Category type names for output
const CATEGORY_TYPES: Record<number, string> = {
  1: 'single_hop',
  2: 'temporal_reasoning',
  3: 'multi_hop',
  4: 'open_domain',
}

async function main() {
  console.log('🧠 DeltaMemory LoCoMo Benchmark - EVALUATE')
  console.log('==========================================')
  console.log(`Model: Azure OpenAI (${config.azure.model})`)
  console.log('')

  validateConfig()

  // Check data
  if (!existsSync(config.dataPath)) {
    console.error(`❌ Dataset not found: ${config.dataPath}`)
    process.exit(1)
  }

  // Load dataset
  const data: Sample[] = JSON.parse(readFileSync(config.dataPath, 'utf-8'))
  console.log(`📂 Loaded ${data.length} conversations\n`)

  // Connect
  const db = new DeltaMemory({
    baseUrl: config.deltamemory.url,
    apiKey: config.deltamemory.apiKey,
  })

  try {
    await db.health()
    console.log(`✅ Connected to DeltaMemory\n`)
  } catch {
    console.error(`❌ Cannot connect to DeltaMemory`)
    process.exit(1)
  }

  // Create results directory
  mkdirSync(config.resultsDir, { recursive: true })

  // Track overall progress
  const totalQuestions = data.reduce((sum, s) => sum + s.qa.filter(q => q.category !== 5).length, 0)
  let processed = 0
  let totalCorrect = 0

  const allResults: ConversationResult[] = []

  for (let i = 0; i < data.length; i++) {
    const sample = data[i]
    const sampleId = sample.sample_id || `sample-${i}`
    const collection = `locomo-${sampleId}`

    console.log(`\n📝 [${i + 1}/${data.length}] ${sampleId}`)

    // Filter adversarial questions
    const questions = sample.qa.filter(q => q.category !== 5)
    console.log(`   Questions: ${questions.length}`)

    // Check collection
    const stats = await db.stats(collection)
    if (stats.memory_count === 0) {
      console.log(`   ⚠️ No data! Run: npm run ingest`)
      continue
    }

    // Track by category for this conversation
    const byType: Record<string, {
      total: number
      evaluated_count: number
      correct_count: number
      accuracy_percentage: number
      responses: any[]
    }> = {}

    const questionResults: QuestionResult[] = []

    // Extract speaker names for nickname detection
    const speakers = [sample.conversation.speaker_a, sample.conversation.speaker_b]

    for (let j = 0; j < questions.length; j++) {
      const qa = questions[j]
      processed++

      // Progress
      clearLine()
      const acc = processed > 0 ? ((totalCorrect / processed) * 100).toFixed(1) : '0.0'
      process.stdout.write(`   ${progressBar(j + 1, questions.length)} | Total: ${progressBar(processed, totalQuestions)} | Acc: ${acc}%`)

      const start = Date.now()

      // Recall with higher limit for better coverage
      const recall = await db.recall(qa.question, { collection, limit: 50 })

      // Format context
      const profiles = formatProfiles((recall as any).profiles || [])
      const events = formatEvents((recall as any).events || [])
      const graph = formatGraph(recall.graph_knowledge || [])
      const memories = formatMemories(recall.results)
      
      // Extract nicknames from memories
      const nicknameMap = extractNicknames(memories, speakers)
      const nicknames = formatNicknames(nicknameMap)

      // Generate answer
      const generated = await generateAnswer(qa.question, nicknames, profiles, events, graph, memories)
      const expected = String(qa.answer)

      // Judge with reasoning
      const evaluation = await judge(qa.question, expected, generated)

      if (evaluation.is_correct) totalCorrect++

      const latency = Date.now() - start
      const questionType = CATEGORY_TYPES[qa.category] || 'unknown'

      // Initialize category if needed
      if (!byType[questionType]) {
        byType[questionType] = {
          total: 0,
          evaluated_count: 0,
          correct_count: 0,
          accuracy_percentage: 0,
          responses: [],
        }
      }

      // Track response
      const response = {
        conversation_id: sampleId,
        question_type: questionType,
        category: qa.category,
        question: qa.question,
        expected_answer: expected,
        ai_response: generated,
        response_time: latency / 1000,
        evaluation: {
          is_correct: evaluation.is_correct,
          reasoning: evaluation.reasoning,
          error: evaluation.error,
        },
      }

      byType[questionType].total++
      byType[questionType].evaluated_count++
      if (evaluation.is_correct) byType[questionType].correct_count++
      byType[questionType].responses.push(response)

      questionResults.push({
        question: qa.question,
        expected,
        generated,
        category: qa.category,
        correct: evaluation.is_correct,
        latency_ms: latency,
      })

      // Rate limit
      await new Promise(r => setTimeout(r, 50))
    }

    clearLine()

    // Calculate accuracy percentages
    for (const type of Object.keys(byType)) {
      const data = byType[type]
      data.accuracy_percentage = data.evaluated_count > 0 
        ? (data.correct_count / data.evaluated_count) * 100 
        : 0
    }

    // Calculate conversation results
    const correct = questionResults.filter(q => q.correct).length
    const accuracy = questions.length > 0 ? correct / questions.length : 0

    const convResult: ConversationResult = {
      sample_id: sampleId,
      total: questions.length,
      correct,
      accuracy,
      by_category: {},
      questions: questionResults,
    }

    // Convert byType to by_category
    for (const [type, data] of Object.entries(byType)) {
      const cat = Object.entries(CATEGORY_TYPES).find(([_, v]) => v === type)?.[0]
      if (cat) {
        convResult.by_category[Number(cat)] = {
          total: data.total,
          correct: data.correct_count,
          accuracy: data.accuracy_percentage / 100,
        }
      }
    }

    allResults.push(convResult)

    // Save per-conversation file (Backboard format)
    const convFile = {
      conversation_id: sampleId,
      total: questions.length,
      evaluated_count: questions.length,
      correct_count: correct,
      accuracy_percentage: accuracy * 100,
      by_type: byType,
    }

    const convPath = join(config.resultsDir, `locomo_conversation_${i + 1}.json`)
    writeFileSync(convPath, JSON.stringify(convFile, null, 2))

    // Print results
    console.log(`   ✅ Accuracy: ${(accuracy * 100).toFixed(1)}% | Saved: ${convPath}`)
    for (const [type, data] of Object.entries(byType)) {
      console.log(`      ${type}: ${data.accuracy_percentage.toFixed(0)}% (${data.correct_count}/${data.total})`)
    }
  }

  // Overall results
  console.log('\n\n========================================')
  console.log('📊 OVERALL RESULTS')
  console.log('========================================\n')

  const overallAccuracy = allResults.reduce((sum, r) => sum + r.accuracy, 0) / allResults.length
  const totalQs = allResults.reduce((sum, r) => sum + r.total, 0)
  const totalC = allResults.reduce((sum, r) => sum + r.correct, 0)

  console.log(`Conversations: ${allResults.length}`)
  console.log(`Questions: ${totalQs}`)
  console.log(`Correct: ${totalC}`)
  console.log(`Accuracy: ${(overallAccuracy * 100).toFixed(1)}%`)

  // By category
  console.log('\nBy Category:')
  for (const cat of [1, 2, 3, 4]) {
    const catResults = allResults.flatMap(r => r.questions.filter(q => q.category === cat))
    if (catResults.length > 0) {
      const catCorrect = catResults.filter(q => q.correct).length
      console.log(`  ${CATEGORIES[cat]}: ${((catCorrect / catResults.length) * 100).toFixed(1)}% (${catCorrect}/${catResults.length})`)
    }
  }

  // Save overall results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const resultsPath = join(config.resultsDir, `locomo_results_${timestamp}.json`)

  writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    model: config.azure.model,
    summary: {
      conversations: allResults.length,
      questions: totalQs,
      correct: totalC,
      accuracy: overallAccuracy,
      accuracy_percentage: overallAccuracy * 100,
    },
    per_conversation: allResults.map(r => ({
      conversation_id: r.sample_id,
      total: r.total,
      correct: r.correct,
      accuracy_percentage: r.accuracy * 100,
    })),
  }, null, 2))

  console.log(`\n💾 Results saved to ${resultsPath}`)
}

main().catch(console.error)
