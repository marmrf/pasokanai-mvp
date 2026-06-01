interface HeroProps {
  onScrollToApp: () => void
}

export default function Hero({ onScrollToApp }: HeroProps) {
  return (
    <div className="hero">
      <div className="hero-eyebrow">Asisten Tani · Gratis · Untuk Petani Indonesia</div>
      <h1><em>Tanam apa</em> yang cocok?<br /><em>Jual ke siapa</em> yang adil?<br />Kami bantu jawab.</h1>
      <p className="lead">
        Cerita sebentar tentang lahanmu, nanti kami berikan saran:{' '}
        tanaman apa yang cocok, kapan waktu tanam yang pas, perkiraan hasil panen,{' '}
        dan harga jual yang wajar. <strong>Tidak perlu paham teknologi.</strong>
      </p>
      <button className="hero-cta" onClick={onScrollToApp}>
        🌱 Mulai Sekarang — Gratis
      </button>
      <div className="hero-trust">
        <span>✅ Pakai data dari pemerintah</span>
        <span>📊 Selalu diperbarui</span>
        <span>🤝 Gratis untuk semua petani</span>
        <span>🛡️ Lindungi dari harga tidak adil</span>
      </div>
    </div>
  )
}
