export default function TechSection() {
  return (
    <div className="tech">
      <div className="container">
        <div className="section-head">
          <span className="kicker">Sumber Data Resmi</span>
          <h2>Datanya dari kantor pemerintah</h2>
          <p>Kami scraping dan mengintegrasikan data publik dari 5 sumber resmi pemerintah — bukan tebak-tebakan.</p>
        </div>
        <div className="tech-grid">
          <div className="tech-card">
            <div className="tech-card-icon">🌧️</div>
            <div className="tech-card-title">Open-Meteo</div>
            <div className="tech-card-desc">Data cuaca harian untuk 5 kabupaten DIY: curah hujan, suhu, dan kelembapan. Diambil otomatis setiap bulan via Azure Functions.</div>
          </div>
          <div className="tech-card">
            <div className="tech-card-icon">📊</div>
            <div className="tech-card-title">Bapanas — Panel Harga</div>
            <div className="tech-card-desc">Harga komoditas pangan strategis dari Badan Pangan Nasional. Scraping otomatis menggunakan Playwright untuk data harga per minggu.</div>
          </div>
          <div className="tech-card">
            <div className="tech-card-icon">🌾</div>
            <div className="tech-card-title">DPKP DIY</div>
            <div className="tech-card-desc">Data harga komoditas tingkat petani (farm-gate) dari Dinas Pertanian dan Ketahanan Pangan DIY — harga yang benar-benar diterima petani lokal.</div>
          </div>
          <div className="tech-card">
            <div className="tech-card-icon">🏦</div>
            <div className="tech-card-title">KUR Kementerian Koperasi</div>
            <div className="tech-card-desc">Aturan dan syarat KUR sesuai ketentuan resmi pemerintah. Bunga 6%/tahun, pinjaman sampai Rp 100 juta, tanpa jaminan untuk pinjaman kecil.</div>
          </div>
          <div className="tech-card">
            <div className="tech-card-icon">🛡️</div>
            <div className="tech-card-title">AI Gap Alert — Azure OpenAI</div>
            <div className="tech-card-desc">GPT-4o-mini menganalisis selisih harga tengkulak vs harga pasar dan menghasilkan kalimat negosiasi berbahasa Indonesia yang sopan dan efektif.</div>
          </div>
          <div className="tech-card">
            <div className="tech-card-icon">🤝</div>
            <div className="tech-card-title">Gratis untuk Petani</div>
            <div className="tech-card-desc">Seluruh fitur PasokanAI gratis untuk petani. Infrastruktur berjalan di Azure Static Web Apps dan Azure Functions dengan biaya yang ditanggung tim.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
