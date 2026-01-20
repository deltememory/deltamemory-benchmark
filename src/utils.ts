// Utility functions

import type { Dialog, Conversation } from './types.js'

// Progress bar
export function progressBar(current: number, total: number, width = 30): string {
  const percent = total > 0 ? current / total : 0
  const filled = Math.round(width * percent)
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled)
  return `[${bar}] ${current}/${total} (${(percent * 100).toFixed(1)}%)`
}

export function clearLine() {
  process.stdout.write('\r\x1b[K')
}

// Convert "1:56 pm on 8 May, 2023" to ISO 8601
export function toISO8601(timestamp: string): string | undefined {
  if (!timestamp) return undefined

  try {
    const parts = timestamp.toLowerCase().trim().split(' on ')
    if (parts.length !== 2) return undefined

    const timePart = parts[0].trim()
    let datePart = parts[1].trim().replace(',', '')

    // Parse time
    const timeMatch = timePart.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i)
    if (!timeMatch) return undefined

    let hours = parseInt(timeMatch[1])
    const minutes = parseInt(timeMatch[2])
    const isPM = timeMatch[3].toLowerCase() === 'pm'

    if (isPM && hours !== 12) hours += 12
    if (!isPM && hours === 12) hours = 0

    // Parse date
    const dateMatch = datePart.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/)
    if (!dateMatch) return undefined

    const day = parseInt(dateMatch[1])
    const monthStr = dateMatch[2].toLowerCase()
    const year = parseInt(dateMatch[3])

    const months: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    }

    const month = months[monthStr]
    if (month === undefined) return undefined

    return new Date(year, month, day, hours, minutes, 0).toISOString()
  } catch {
    return undefined
  }
}

// Extract sessions from conversation
export function extractSessions(conversation: Conversation): Array<{
  session: number
  datetime: string | undefined
  dialogs: Dialog[]
}> {
  const sessions: Array<{ session: number; datetime: string | undefined; dialogs: Dialog[] }> = []

  for (let i = 1; i <= 35; i++) {
    const dialogs = conversation[`session_${i}`] as Dialog[] | undefined
    const datetime = conversation[`session_${i}_date_time`] as string | undefined

    if (dialogs && dialogs.length > 0) {
      sessions.push({
        session: i,
        datetime: toISO8601(datetime || ''),
        dialogs,
      })
    }
  }

  return sessions
}

// Format dialog with image metadata and enhanced context
export function formatDialog(dialog: Dialog, sessionDatetime?: string): string {
  let content = dialog.text

  // Add image metadata if present
  if (dialog.img_url && (dialog.query || dialog.blip_caption)) {
    if (dialog.query && dialog.blip_caption) {
      content += ` [Sharing image - query: ${dialog.query}. The image shows: ${dialog.blip_caption}]`
    } else if (dialog.query) {
      content += ` [Sharing image - query: ${dialog.query}]`
    } else if (dialog.blip_caption) {
      content += ` [Sharing image that shows: ${dialog.blip_caption}]`
    }
  }

  // Resolve relative dates to absolute if we have session datetime
  if (sessionDatetime) {
    content = resolveRelativeDates(content, sessionDatetime)
  }

  return `${dialog.speaker}: ${content}`
}

// Resolve relative date references to absolute dates
export function resolveRelativeDates(text: string, sessionDatetime: string): string {
  const sessionDate = new Date(sessionDatetime)
  if (isNaN(sessionDate.getTime())) return text

  const formatDate = (d: Date) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December']
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
  }

  // Map of relative terms to date offsets
  const relativePatterns: Array<{ pattern: RegExp; offset: (m: RegExpMatchArray) => number }> = [
    { pattern: /\byesterday\b/gi, offset: () => -1 },
    { pattern: /\blast week\b/gi, offset: () => -7 },
    { pattern: /\blast weekend\b/gi, offset: () => -7 },
    { pattern: /\bthe weekend before\b/gi, offset: () => -7 },
    { pattern: /\btwo weeks ago\b/gi, offset: () => -14 },
    { pattern: /\blast month\b/gi, offset: () => -30 },
    { pattern: /\ba few days ago\b/gi, offset: () => -3 },
    { pattern: /\bthe other day\b/gi, offset: () => -2 },
    { pattern: /\blast friday\b/gi, offset: () => {
      const day = sessionDate.getDay()
      return day >= 5 ? -(day - 5) - 7 : -(day + 2)
    }},
    { pattern: /\blast saturday\b/gi, offset: () => {
      const day = sessionDate.getDay()
      return day >= 6 ? -(day - 6) - 7 : -(day + 1)
    }},
    { pattern: /\blast sunday\b/gi, offset: () => {
      const day = sessionDate.getDay()
      return day === 0 ? -7 : -day
    }},
  ]

  let result = text
  for (const { pattern, offset } of relativePatterns) {
    result = result.replace(pattern, (match) => {
      const targetDate = new Date(sessionDate)
      targetDate.setDate(targetDate.getDate() + offset([match]))
      return `${match} (${formatDate(targetDate)})`
    })
  }

  return result
}

// Category names
export const CATEGORIES: Record<number, string> = {
  1: 'Single-hop',
  2: 'Temporal',
  3: 'Multi-hop',
  4: 'Open-domain',
  5: 'Adversarial',
}


// Extract nicknames and aliases from text
export function extractNicknames(text: string, speakers: string[]): Map<string, string[]> {
  const nicknames = new Map<string, string[]>()
  
  // Common nickname patterns
  const patterns = [
    /(?:call(?:s|ed)?\s+(?:me|him|her|them)\s+)["']?(\w+)["']?/gi,
    /(?:nickname(?:d)?\s+)["']?(\w+)["']?/gi,
    /(?:known\s+as\s+)["']?(\w+)["']?/gi,
    /(?:goes\s+by\s+)["']?(\w+)["']?/gi,
  ]
  
  for (const speaker of speakers) {
    const speakerNicknames: string[] = []
    
    // Check for shortened versions of names
    if (speaker.length > 3) {
      const shortName = speaker.substring(0, Math.min(3, speaker.length))
      // Look for the short name being used
      const shortPattern = new RegExp(`\\b${shortName}\\b`, 'gi')
      if (shortPattern.test(text)) {
        speakerNicknames.push(shortName)
      }
    }
    
    // Check for common nickname patterns
    for (const pattern of patterns) {
      const matches = text.matchAll(pattern)
      for (const match of matches) {
        if (match[1] && !speakerNicknames.includes(match[1])) {
          speakerNicknames.push(match[1])
        }
      }
    }
    
    if (speakerNicknames.length > 0) {
      nicknames.set(speaker, speakerNicknames)
    }
  }
  
  return nicknames
}

// Format nicknames for context
export function formatNicknames(nicknames: Map<string, string[]>): string {
  if (nicknames.size === 0) return ''
  
  const lines: string[] = []
  for (const [speaker, aliases] of nicknames) {
    lines.push(`- ${speaker} is also called: ${aliases.join(', ')}`)
  }
  return lines.join('\n')
}
