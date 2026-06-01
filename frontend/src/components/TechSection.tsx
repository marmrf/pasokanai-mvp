export default function TechSection() {
  return (
    <div className="tech">
      <div className="container">
        <div className="section-head">
          <span className="kicker">Yang Membantu Kami</span>
          <h2>Datanya dari sumber resmi</h2>
          <p>Anda tidak perlu khawatir — semua angka yang kami pakai datang dari kantor pemerintah, bukan tebak-tebakan.</p>
        </div>
        <div className="tech-grid">
          <div className="tech-card">
            <div className="tech-card-icon">🌧️</div>
            <div className="tech-card-title">Data Cuaca dari BMKG</div>
            <div className="tech-card-desc">Setiap hari kami mengecek prakiraan hujan dan suhu di daerah Anda, langsung dari kantor cuaca resmi.</div>
          </div>
          <div className="tech-card">
            <div className="tech-card-icon">📊</div>
            <div className="tech-card-title">Harga dari BPS &amp; Bapanas</div>
            <div className="tech-card-desc">Harga pasar yang kami tampilkan diambil dari kantor statistik pemerintah, jadi angkanya bisa dipercaya.</div>
          </div>
          <div className="tech-card">
            <div className="tech-card-icon">🌾</div>
            <div className="tech-card-title">Pengalaman 3 Tahun Terakhir</div>
            <div className="tech-card-desc">Saran kami dibuat dari pengalaman ribuan petani lain di daerah sejenis selama 3 tahun terakhir.</div>
          </div>
          <div className="tech-card">
            <div className="tech-card-icon">🏦</div>
            <div className="tech-card-title">Info KUR dari Pemerintah</div>
            <div className="tech-card-desc">Aturan dan syarat KUR yang kami pakai sesuai dengan ketentuan resmi Kementerian Koperasi UKM.</div>
          </div>
          <div className="tech-card">
            <div className="tech-card-icon">🛡️</div>
            <div className="tech-card-title">Lindungi Harga Petani</div>
            <div className="tech-card-desc">Kami bantu Anda tahu harga sebenarnya, supaya tidak ditekan tengkulak. Ini yang kami sebut "Perlindungan Harga".</div>
          </div>
          <div className="tech-card">
            <div className="tech-card-icon">🤝</div>
            <div className="tech-card-title">Gratis Selamanya</div>
            <div className="tech-card-desc">Kami percaya petani sudah cukup berjuang. Pakai PasokanAI tidak akan dipungut biaya apapun.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
