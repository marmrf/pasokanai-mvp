/**
 * Generate a clean, curated KUR proposal PDF from the hidden `.kur-report` node.
 *
 * Tujuan (revisi): PDF hanya berisi OUTPUT PERHITUNGAN SISTEM yang bisa dipakai
 * petani sebagai acuan — bukan seluruh halaman website.
 *
 * Penting (anti tumpang-tindih): alih-alih merasterisasi seluruh laporan jadi
 * satu gambar panjang lalu memotongnya buta per A4 (yang membuat blok seperti
 * kotak skor terpotong di sambungan halaman), kita memotret SETIAP BLOK
 * (header, tiap section, disclaimer, footer) secara terpisah, lalu menata
 * dari atas ke bawah. Jika sebuah blok tidak muat di sisa halaman, blok itu
 * dipindah utuh ke halaman berikutnya — jadi tidak ada blok yang terbelah.
 *
 * Falls back to window.print() if anything goes wrong.
 */
export async function generateKurPdf(fileLabel: string): Promise<void> {
  const root = document.querySelector<HTMLElement>('.kur-report')
  if (!root) {
    window.print()
    return
  }

  const prevCss = root.style.cssText
  // Render off-screen (terlihat untuk html2canvas, tak terlihat user) pada lebar
  // tetap agar tiap blok punya lebar konsisten. padding 0 — margin diatur di PDF.
  const RENDER_W = 760
  root.style.cssText =
    `display:block; position:fixed; left:-99999px; top:0; width:${RENDER_W}px; ` +
    'background:#ffffff; padding:0; margin:0; box-sizing:border-box; z-index:-1;'

  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ])

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const margin = 32
    const contentW = pageW - margin * 2
    const contentH = pageH - margin * 2
    const blockGap = 9 // jarak antar blok (pt)

    // Blok = anak langsung laporan. Lewati garis pemisah & elemen kosong.
    const blocks = Array.from(root.children).filter((c): c is HTMLElement => {
      if (!(c instanceof HTMLElement)) return false
      if (c.classList.contains('rpt-divider')) return false
      return c.offsetHeight > 6
    })

    let y = margin
    let first = true

    for (const block of blocks) {
      const canvas = await html2canvas(block, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        windowWidth: RENDER_W,
      })
      if (!canvas.width || !canvas.height) continue

      let drawW = contentW
      let drawH = (canvas.height * drawW) / canvas.width

      // Blok lebih tinggi dari satu halaman penuh → kecilkan agar muat utuh
      // (lebih baik diperkecil sedikit daripada terpotong/tumpang tindih).
      if (drawH > contentH) {
        const f = contentH / drawH
        drawH = contentH
        drawW = contentW * f
      }

      // Mulai halaman baru bila blok tidak muat di sisa halaman ini.
      if (!first && y + drawH > pageH - margin) {
        pdf.addPage()
        y = margin
      }
      first = false

      const x = margin + (contentW - drawW) / 2 // center bila diperkecil
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', x, y, drawW, drawH)
      y += drawH + blockGap
    }

    // Nomor halaman halus di bawah-kanan setiap halaman.
    const total = pdf.getNumberOfPages()
    for (let i = 1; i <= total; i++) {
      pdf.setPage(i)
      pdf.setFontSize(8)
      pdf.setTextColor(150)
      pdf.text(`Halaman ${i} dari ${total}`, pageW - margin, pageH - 14, { align: 'right' })
    }

    const safe = (fileLabel || 'Petani').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
    pdf.save(`Proposal-KUR-${safe || 'PasokanAI'}.pdf`)
  } catch (err) {
    console.error('PDF generation failed, falling back to print:', err)
    window.print()
  } finally {
    root.style.cssText = prevCss
  }
}
