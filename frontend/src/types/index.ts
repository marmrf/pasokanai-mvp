export interface District {
  id: string
  name: string
  province: string
  latitude: number
  longitude: number
}

export interface RecommendationData {
  name: string
  emoji: string
  risk: string
  time: string
  timeSub: string
  price: string
  priceSub: string
  yield: string
  harvest: string
  reasoning: string
  scenarios: {
    optimis: [string, string]
    normal: [string, string]
    pesimis: [string, string]
  }
  avgPrice: number
  predictedPrice: number
  confidence?: number
  /** Data source: 'azure_openai' | 'gemini' | 'statistical_fallback' | 'seed' */
  _source?: string
  /** Commodity slug used for buyer lookup */
  _commodity?: string
}

export interface Buyer {
  id: string
  name: string
  buyer_type: string
  commodity: string
  latitude: number
  longitude: number
  contact: string
}

export type Screen = 'step1' | 'step2' | 'step3' | 'loading' | 'result'
export type Priority = 'profit' | 'safe' | ''
export type ScenarioType = 'optimis' | 'normal' | 'pesimis'
