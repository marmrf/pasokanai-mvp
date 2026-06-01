import { createClient } from '@supabase/supabase-js'
import type { RecommendationData } from '../types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export async function fetchDistricts() {
  const { data, error } = await supabase
    .from('districts')
    .select('*')
    .order('name')
  if (error) console.error('fetchDistricts:', error)
  return data || []
}

/**
 * Fetch crop recommendation.
 * Priority: AI endpoint (/api/generate-recommendation) → Supabase seed data
 *
 * Returns a Supabase-shaped row: { recommendation_text, commodity, confidence }
 * recommendation_text includes _source to indicate data quality.
 */
export async function fetchRecommendation(districtId: string, priority: 'profit' | 'safe') {
  // 1. Try AI-powered endpoint (Azure Function must be running)
  try {
    const res = await fetch('/api/generate-recommendation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ district_id: districtId, priority }),
      signal: AbortSignal.timeout(12000),  // 12s timeout for AI generation
    })
    if (res.ok) {
      const data = await res.json() as RecommendationData & { _commodity?: string; _confidence?: number }
      return {
        recommendation_text: data,
        commodity: data._commodity || '',
        confidence: data._confidence ?? 78,
      }
    }
  } catch {
    // API offline or timeout — fall through to Supabase seed
  }

  // 2. Fallback: static seed data from Supabase
  const { data, error } = await supabase
    .from('recommendations')
    .select('*')
    .eq('district_id', districtId)
    .eq('priority', priority)
    .single()
  if (error) console.error('fetchRecommendation (seed):', error)

  if (data) {
    // Mark seed data so ResultScreen can show warning
    const recText = data.recommendation_text as RecommendationData
    recText._source = recText._source || 'seed'
    return data
  }
  return null
}

export async function fetchBuyers(commodity: string) {
  const { data, error } = await supabase
    .from('buyers')
    .select('*')
    .eq('commodity', commodity)
    .limit(4)
  if (error) console.error('fetchBuyers:', error)
  return data || []
}
