// LoCoMo dataset types

export interface Dialog {
  speaker: string
  dia_id: string
  text: string
  img_url?: string[]
  blip_caption?: string
  query?: string
}

export interface QA {
  question: string
  answer: string | number
  evidence: string[]
  category: number // 1=single-hop, 2=temporal, 3=multi-hop, 4=open-domain, 5=adversarial
}

export interface Conversation {
  speaker_a: string
  speaker_b: string
  [key: string]: string | Dialog[] | undefined
}

export interface Sample {
  sample_id: string
  qa: QA[]
  conversation: Conversation
}

export interface QuestionResult {
  question: string
  expected: string
  generated: string
  category: number
  correct: boolean
  latency_ms: number
}

export interface ConversationResult {
  sample_id: string
  total: number
  correct: number
  accuracy: number
  by_category: Record<number, { total: number; correct: number; accuracy: number }>
  questions: QuestionResult[]
}
