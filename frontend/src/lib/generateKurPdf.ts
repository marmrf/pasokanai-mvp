/**
 * Generate a clean, curated KUR proposal PDF from the hidden `.kur-report` node
 * (revisi #4): hanya hasil penting yang dibutuhkan petani & bank — bukan seluruh
 * halaman website. Falls back to window.print() if anything goes wrong.
 *
 * The `.kur-report` element is normally `display:none` on screen; we temporarily
 * render it off-screen at A4 width, rasterize it, and paginate into a PDF.
 */
export async function generateKurPdf(fileLabel: string): Promise<void> {
  const el = document.querySelector<HTMLElement>('.kur-report')
  if (!el) {
    window.print()
    return
  }

  const prevCss = el.style.cssText
  // A4 @ ~96dpi ≈ 794px wide. Render off-screen, fully visible for capture.
  el.style.cssText =
    'display:block; position:fixed; left:-99999px; top:0; width:794px; ' +
    'background:#ffffff; padding:24px; box-sizing:border-box; z-index:-1;'

  try {
    // Lazy-load heavy libs only when the user actually exports (keeps mobile bundle light)
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ])

    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    })

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const imgW = pageW
    const imgH = (canvas.height * imgW) / canvas.width
    const img = canvas.toDataURL('image/jpeg', 0.92)

    let heightLeft = imgH
    let position = 0
    pdf.addImage(img, 'JPEG', 0, position, imgW, imgH)
    heightLeft -= pageH

    while (heightLeft > 0) {
      position -= pageH
      pdf.addPage()
      pdf.addImage(img, 'JPEG', 0, position, imgW, imgH)
      heightLeft -= pageH
    }

    const safe = (fileLabel || 'Petani').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
    pdf.save(`Proposal-KUR-${safe || 'PasokanAI'}.pdf`)
  } catch (err) {
    console.error('PDF generation failed, falling back to print:', err)
    window.print()
  } finally {
    el.style.cssText = prevCss
  }
}
