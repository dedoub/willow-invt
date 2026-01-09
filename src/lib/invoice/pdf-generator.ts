import { jsPDF } from 'jspdf'
import type { Invoice, LineItem } from './types'
import { COMPANY_INFO, WIRE_INFO, formatInvoiceDate, formatAmount } from './constants'

// Colors
const BRAND_BLUE = '#5BA4C9'
const TEXT_DARK = '#333333'
const TEXT_GRAY = '#666666'
const TABLE_HEADER_BG = '#F5F5F5'
const LINE_COLOR = '#CCCCCC'

// Embedded logo (leaf-icon.png) as base64
const LOGO_BASE64 = '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'

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

  // Logo image (left side) - try-catch for server-side compatibility
  try {
    doc.addImage(LOGO_BASE64, 'PNG', margin, y, 16, 16)
  } catch {
    // Skip logo if image processing fails on server
  }

  // Company name with logo text
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(BRAND_BLUE)
  doc.text('willow', margin + 20, y + 6)
  doc.setTextColor(TEXT_DARK)
  doc.text('invt', margin + 43, y + 6)

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
  doc.setFillColor(TABLE_HEADER_BG)
  doc.rect(margin, y - 4, tableWidth, 8, 'F')

  // Table header text
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(TEXT_GRAY)

  let colX = margin + 3
  doc.text('DESCRIPTION', colX, y)
  colX += colWidths.description
  doc.text('QTY', colX, y)
  colX += colWidths.qty
  doc.text('UNIT PRICE', colX, y)
  colX += colWidths.unitPrice
  doc.text('AMOUNT', colX + colWidths.amount - 3, y, { align: 'right' })

  y += 6

  // Table border top
  doc.setDrawColor(LINE_COLOR)
  doc.line(margin, y, pageWidth - margin, y)

  y += 6

  // Table rows
  doc.setTextColor(TEXT_DARK)
  doc.setFontSize(10)

  for (const item of invoice.line_items as LineItem[]) {
    colX = margin + 3
    doc.text(item.description, colX, y)
    colX += colWidths.description
    doc.text(item.qty ? String(item.qty) : '', colX, y)
    colX += colWidths.qty
    doc.text(item.unitPrice ? formatAmount(item.unitPrice) : '', colX, y)
    colX += colWidths.unitPrice
    doc.text(formatAmount(item.amount), colX + colWidths.amount - 3, y, { align: 'right' })

    y += 8
  }

  // Add some empty rows for visual consistency (optional)
  const minRows = 5
  const emptyRows = Math.max(0, minRows - invoice.line_items.length)
  y += emptyRows * 8

  // Table border bottom
  doc.line(margin, y, pageWidth - margin, y)

  y += 8

  // TOTAL
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  const totalLabelX = pageWidth - margin - 60
  doc.text('TOTAL', totalLabelX, y)
  // Combine $ with amount, right-aligned
  const totalWithDollar = `$${formatAmount(invoice.total_amount)}`
  doc.text(totalWithDollar, pageWidth - margin - 3, y, { align: 'right' })

  y += 25

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
  return `Invoice_${invoice.invoice_no.replace('#', '')}_${dateStr}.pdf`
}
