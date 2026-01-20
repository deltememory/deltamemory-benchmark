# DeltaMemory LoCoMo Benchmark

> State-of-the-art long-term conversation memory, evaluated on the [LoCoMo](https://github.com/snap-research/locomo) benchmark.

## Results

DeltaMemory achieves **89% accuracy** on LoCoMo-10, outperforming all existing memory systems across key reasoning categories.

| Method | Single-Hop | Multi-Hop | Open Domain | Temporal | Overall |
|--------|------------|-----------|-------------|----------|---------|
| **DeltaMemory** | **91.5%** | **87.5%** | **90.5%** | 82.2% | **89%** |
| Memobase v0.0.37 | 70.9% | 46.9% | 77.2% | 85.1% | 75.8% |
| Zep | 74.1% | 66.0% | 67.7% | 79.8% | 75.1% |
| Memobase v0.0.32 | 63.8% | 52.1% | 71.8% | 80.4% | 70.9% |
| Mem0-Graph | 65.7% | 47.2% | 75.7% | 58.1% | 68.4% |
| Mem0 | 67.1% | 51.2% | 72.9% | 55.5% | 66.9% |
| LangMem | 62.2% | 47.9% | 71.1% | 23.4% | 58.1% |
| OpenAI | 63.8% | 42.9% | 62.3% | 21.7% | 52.9% |

### Key Highlights

- **+13% over Memobase** - The previous best open-source memory system
- **+14% over Zep** - Popular production memory layer
- **+22% over Mem0** - Widely adopted memory framework
- **87.5% Multi-Hop** - Nearly 2x better than competitors at complex reasoning

### What Makes DeltaMemory Different

| Capability | DeltaMemory | Others |
|------------|-------------|--------|
| Cognitive extraction | ✅ Facts, events, profiles, concepts | ❌ Raw embeddings |
| Knowledge graph | ✅ Relationship tracking | ❌ Flat storage |
| Temporal reasoning | ✅ Event timeline | ❌ No time awareness |
| Multi-hop inference | ✅ Graph traversal | ❌ Vector similarity only |

## Detailed Results

**10 conversations, 1540 questions evaluated**

| Category | Correct | Total | Accuracy | Description |
|----------|---------|-------|----------|-------------|
| Single-hop | 258 | 282 | 91.5% | Direct fact recall |
| Multi-hop | 84 | 96 | 87.5% | Reasoning across multiple facts |
| Open-domain | 761 | 841 | 90.5% | General knowledge questions |
| Temporal | 264 | 321 | 82.2% | Time-based reasoning |

### Per-Conversation Breakdown

| Conversation | Accuracy | Questions |
|--------------|----------|-----------|
| conv-41 | 93% | 152 |
| conv-30 | 92% | 81 |
| conv-26 | 91% | 152 |
| conv-44 | 90% | 123 |
| conv-48 | 89% | 191 |
| conv-49 | 89% | 156 |
| conv-50 | 87% | 158 |
| conv-42 | 86% | 199 |
| conv-43 | 85% | 178 |
| conv-47 | 83% | 150 |

## Configuration

| Component | Model |
|-----------|-------|
| Extraction | GPT-4.1 |
| Answer Generation | GPT-4.1 |
| LLM Judge | GPT-4.1 |
| Recall Limit | 50 memories |

## Run the Benchmark

```bash
# Install
npm install
cp .env.example .env
# Edit .env with your Azure OpenAI credentials

# Ingest conversations
npm run ingest

# Evaluate
npm run evaluate
```

## Output

Results saved to `./results/`:
- `locomo_conversation_N.json` - Per-conversation Q&A with reasoning
- `locomo_results_{timestamp}.json` - Overall summary

---

*LoCoMo benchmark by [Snap Research](https://github.com/snap-research/locomo). Competitor results from their published leaderboard.*
