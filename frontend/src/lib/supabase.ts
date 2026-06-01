import { createClient } from '@supabase/supabase-js'

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

export async function fetchRecommendation(districtId: string, priority: 'profit' | 'safe') {
  const { data, error } = await supabase
    .from('recommendations')
    .select('*')
    .eq('district_id', districtId)
    .eq('priority', priority)
    .single()
  if (error) console.error('fetchRecommendation:', error)
  return data
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
