import { jsPDF } from 'jspdf'
import type { Invoice, LineItem } from './types'
import { COMPANY_INFO, WIRE_INFO, formatInvoiceDate, formatAmount } from './constants'

// Colors
const BRAND_BLUE = '#5BA4C9'
const TEXT_DARK = '#333333'
const TEXT_GRAY = '#666666'
const TABLE_HEADER_BG = '#F5F5F5'

// Logo file name
const LOGO_FILENAME = 'willow-text.png'

// Helper function to load image as data URL (works in both server and client)
async function loadImageAsDataUrl(): Promise<string | null> {
  // Server-side (Node.js)
  if (typeof window === 'undefined') {
    try {
      const fs = await import('fs')
      const path = await import('path')
      const logoPath = path.join(process.cwd(), 'public', LOGO_FILENAME)
      const buffer = fs.readFileSync(logoPath)
      const base64 = buffer.toString('base64')
      return `data:image/png;base64,${base64}`
    } catch {
      return null
    }
  }

  // Client-side (Browser)
  try {
    const response = await fetch(`/${LOGO_FILENAME}`)
    if (!response.ok) return null

    const blob = await response.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// Generate invoice PDF
export async function generateInvoicePdf(invoice: Invoice): Promise<Uint8Array> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  let y = 20

  // ===== HEADER SECTION =====

  // Logo image (left side) - load from public folder
  // Original image: 600x108px, ratio 5.55:1
  const logoDataUrl = await loadImageAsDataUrl()
  if (logoDataUrl) {
    try {
      // Width 45mm, height = 45/5.55 ≈ 8mm to maintain aspect ratio
      doc.addImage(logoDataUrl, 'PNG', margin, y - 3, 45, 8)
    } catch {
      // Skip logo if image processing fails
    }
  }

  // Company info (right side)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(TEXT_GRAY)
  const rightX = pageWidth - margin
  doc.text(COMPANY_INFO.name, rightX, y, { align: 'right' })
  doc.text(COMPANY_INFO.address, rightX, y + 4, { align: 'right' })
  doc.text(COMPANY_INFO.city, rightX, y + 8, { align: 'right' })
  doc.text(COMPANY_INFO.phone, rightX, y + 12, { align: 'right' })

  y += 35

  // ===== BILL TO & INVOICE INFO =====

  // BILL TO label
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(BRAND_BLUE)
  doc.text('BILL TO', margin, y)

  // Invoice info (right side)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(TEXT_DARK)
  doc.text('Invoice Date:', pageWidth - margin - 50, y)
  doc.text(formatInvoiceDate(invoice.invoice_date), rightX, y, { align: 'right' })

  y += 5

  // Bill to company
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(TEXT_DARK)
  doc.text(invoice.bill_to_company, margin, y)

  // Invoice number
  doc.text('Invoice No:', pageWidth - margin - 50, y)
  doc.text(invoice.invoice_no, rightX, y, { align: 'right' })

  y += 10

  // ATTENTION label
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(BRAND_BLUE)
  doc.text('ATTENTION', margin, y)

  y += 5

  // Attention name
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(TEXT_DARK)
  doc.text(invoice.attention, margin, y)

  y += 15

  // ===== TABLE =====

  // Table header
  const colWidths = {
    description: 80,
    qty: 25,
    unitPrice: 35,
    amount: 30,
  }
  const tableWidth = pageWidth - 2 * margin

  // Table header background
  const headerHeight = 10
  doc.setFillColor(TABLE_HEADER_BG)
  doc.rect(margin, y, tableWidth, headerHeight, 'F')

  // Table header text (vertically centered)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(TEXT_GRAY)

  const headerTextY = y + headerHeight / 2 + 1 // +1 for baseline adjustment
  let colX = margin + 3
  doc.text('DESCRIPTION', colX, headerTextY)
  colX += colWidths.description
  doc.text('QTY', colX, headerTextY)
  colX += colWidths.qty
  doc.text('UNIT PRICE', colX, headerTextY)
  colX += colWidths.unitPrice
  doc.text('AMOUNT', colX + colWidths.amount - 8, headerTextY, { align: 'right' })

  y += headerHeight + 4

  // Table rows
  doc.setTextColor(TEXT_DARK)
  doc.setFontSize(10)

  const rowHeight = 8
  for (const item of invoice.line_items as LineItem[]) {
    const rowTextY = y + rowHeight / 2 + 1 // +1 for baseline adjustment
    colX = margin + 3
    doc.text(item.description, colX, rowTextY)
    colX += colWidths.description
    doc.text(item.qty ? String(item.qty) : '', colX, rowTextY)
    colX += colWidths.qty
    doc.text(item.unitPrice ? formatAmount(item.unitPrice) : '', colX, rowTextY)
    colX += colWidths.unitPrice
    doc.text(formatAmount(item.amount), colX + colWidths.amount - 8, rowTextY, { align: 'right' })

    y += rowHeight
  }

  // Add some empty rows for visual consistency (optional)
  const minRows = 5
  const emptyRows = Math.max(0, minRows - invoice.line_items.length)
  y += emptyRows * 8

  // Table border bottom
  doc.setDrawColor('#CCCCCC')
  doc.line(margin, y, pageWidth - margin, y)

  y += 8

  // TOTAL (aligned with AMOUNT column)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  const amountColX = margin + 3 + colWidths.description + colWidths.qty + colWidths.unitPrice
  const totalLabelX = amountColX - 15
  doc.text('TOTAL', totalLabelX, y)
  // Combine $ with amount, right-aligned to match AMOUNT column
  const totalWithDollar = `$${formatAmount(invoice.total_amount)}`
  doc.text(totalWithDollar, amountColX + colWidths.amount - 8, y, { align: 'right' })

  y += 50

  // ===== WIRE INFORMATION =====

  // Wire info header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(TEXT_DARK)
  doc.text('Wire Information', margin, y)

  y += 2

  // Underline
  doc.setDrawColor(TEXT_DARK)
  doc.line(margin, y, margin + 100, y)

  y += 8

  // Wire info details
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(TEXT_GRAY)

  const wireLines = [
    `Bank Name: ${WIRE_INFO.bankName}`,
    `Bank Address: ${WIRE_INFO.bankAddress}`,
    `Swift Code: ${WIRE_INFO.swiftCode}`,
    `Account Name: ${WIRE_INFO.accountName}`,
    `Account No.: ${WIRE_INFO.accountNo}`,
    `Business Registration No.: ${WIRE_INFO.businessRegistrationNo}`,
    `Tel: ${WIRE_INFO.tel}`,
  ]

  for (const line of wireLines) {
    doc.text(line, margin, y)
    y += 5
  }

  // Return PDF as Uint8Array
  return doc.output('arraybuffer') as unknown as Uint8Array
}

// Generate PDF filename
export function generatePdfFilename(invoice: Invoice): string {
  const dateStr = invoice.invoice_date.replace(/-/g, '')
  return `Willow_Invoice_${invoice.invoice_no.replace('#', '')}_${dateStr}.pdf`
}
