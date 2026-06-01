import { useState, useEffect, useCallback } from 'react'
import { fetchDistricts, fetchRecommendation, fetchBuyers } from './lib/supabase'
import type { District, RecommendationData, Buyer, Screen, Priority } from './types'

import Header from './components/Header'
import Hero from './components/Hero'
import Stats from './components/Stats'
import HowItWorks from './components/HowItWorks'
import DevBanner from './components/DevBanner'
import Step1 from './components/form/Step1'
import Step2 from './components/form/Step2'
import Step3 from './components/form/Step3'
import LoadingScreen from './components/form/LoadingScreen'
import ResultScreen from './components/form/ResultScreen'
import TechSection from './components/TechSection'
import MapDashboard from './components/MapDashboard'
import Footer from './components/Footer'

export default function App() {
  const [screen, setScreen] = useState<Screen>('step1')
  const [districts, setDistricts] = useState<District[]>([])

  // Form state
  const [districtId, setDistrictId] = useState('')
  const [districtLabel, setDistrictLabel] = useState('')
  const [luas, setLuas] = useState('')
  const [modal, setModal] = useState('')
  const [priority, setPriority] = useState<Priority>('')

  // Result state
  const [recommendation, setRecommendation] = useState<RecommendationData | null>(null)
  const [buyers, setBuyers] = useState<Buyer[]>([])
  const [animationDone, setAnimationDone] = useState(false)
  const [fetchError, setFetchError] = useState('')

  // Load districts on mount
  useEffect(() => {
    fetchDistricts().then(data => setDistricts(data as District[]))
  }, [])

  // When both animation and data are ready → show result
  useEffect(() => {
    if (animationDone && recommendation && screen === 'loading') {
      setScreen('result')
    }
  }, [animationDone, recommendation, screen])

  const handleStartAnalysis = useCallback(async () => {
    setScreen('loading')
    setAnimationDone(false)
    setRecommendation(null)
    setFetchError('')

    try {
      const row = await fetchRecommendation(districtId, priority as 'profit' | 'safe')
      if (!row) {
        setFetchError('Maaf, untuk daerah ini belum ada datanya. Coba pilih kabupaten lain dulu ya 🙏')
        setScreen('step1')
        return
      }
      const recData: RecommendationData = {
        ...(row.recommendation_text as RecommendationData),
        confidence: row.confidence,
      }
      setRecommendation(recData)

      const buyerData = await fetchBuyers(row.commodity)
      setBuyers(buyerData as Buyer[])
    } catch (err) {
      console.error('Analysis error:', err)
      setFetchError('Terjadi kesalahan saat memuat data. Silakan coba lagi.')
      setScreen('step1')
    }
  }, [districtId, priority])

  const handleAnimationDone = useCallback(() => {
    setAnimationDone(true)
  }, [])

  const handleReset = useCallback(() => {
    setScreen('step1')
    setDistrictId('')
    setDistrictLabel('')
    setLuas('')
    setModal('')
    setPriority('')
    setRecommendation(null)
    setBuyers([])
    setAnimationDone(false)
    setFetchError('')
    setTimeout(() => {
      document.getElementById('app')?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }, [])

  const scrollToApp = () => {
    document.getElementById('app')?.scrollIntoView({ behavior: 'smooth' })
  }

  // Derive slug for gap-check API: "Kulon Progo" → "kulon_progo"
  const districtSlug = districtLabel
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')

  return (
    <>
      <Header onScrollToApp={scrollToApp} />
      <Hero onScrollToApp={scrollToApp} />
      <Stats />
      <HowItWorks />

      <section className="app-section" id="app">
        <div className="app">
          {screen === 'step1' && (
            <Step1
              districts={districts}
              districtId={districtId}
              luas={luas}
              fetchError={fetchError}
              onDistrictChange={(id, label) => { setDistrictId(id); setDistrictLabel(label) }}
              onLuasChange={setLuas}
              onNext={() => setScreen('step2')}
            />
          )}
          {screen === 'step2' && (
            <Step2
              modal={modal}
              priority={priority}
              onModalChange={setModal}
              onPriorityChange={setPriority}
              onBack={() => setScreen('step1')}
              onNext={() => setScreen('step3')}
            />
          )}
          {screen === 'step3' && (
            <Step3
              districtLabel={districtLabel}
              luas={luas}
              modal={modal}
              priority={priority}
              onBack={() => setScreen('step2')}
              onStart={handleStartAnalysis}
            />
          )}
          {screen === 'loading' && (
            <LoadingScreen onDone={handleAnimationDone} />
          )}
          {screen === 'result' && recommendation && (
            <ResultScreen
              recommendation={recommendation}
              districtLabel={districtLabel}
              districtSlug={districtSlug}
              districtId={districtId}
              luas={parseFloat(luas) || 1}
              buyers={buyers}
              onReset={handleReset}
            />
          )}
        </div>
      </section>

      <MapDashboard />
      <TechSection />
      <Footer />
      <DevBanner />
    </>
  )
}
