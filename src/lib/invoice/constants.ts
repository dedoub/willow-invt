// Invoice Constants

import type { InvoiceItemTemplate } from './types'

// Company Information (Willow Investments)
export const COMPANY_INFO = {
  name: 'Willow Investments, Inc.',
  address: '#402-592A, 12, Teheran-ro 70-gil',
  city: 'Gangnam-gu, Seoul 06081, Republic of Korea',
  phone: 'T +82-10-9629-1025',
  // Old phone numbers (for reference)
  // phone: 'T +82-2-563-1271',
  // fax: 'F +82-2-564-1271',
} as const

// Wire Information
export const WIRE_INFO = {
  bankName: 'Shinhan Bank',
  bankAddress: '20, Sejong-daero 9-gil, Jung-gu, Seoul, Republic of Korea',
  swiftCode: 'SHBKKRSEXXX',
  accountName: 'Willow Investments, Inc.',
  accountNo: '180-011-030723',
  businessRegistrationNo: '205-88-01897',
  tel: '+82-10-9629-1025',
} as const

// Default Client (ETC)
export const DEFAULT_CLIENT = {
  company: 'Exchange Traded Concepts, LLC',
  attention: 'Garrett Stevens',
  email: 'gstevens@exchangetradedconcepts.com',
} as const

// Invoice Item Templates
export const ITEM_TEMPLATES: InvoiceItemTemplate[] = [
  {
    type: 'monthly_fee',
    label: 'Monthly Fee',
    descriptionTemplate: 'Monthly Fee - {month} {year}',
  },
  {
    type: 'referral_fee',
    label: 'Referral Fee',
    descriptionTemplate: 'Referral Fee - {month} {year}',
  },
  {
    type: 'custom',
    label: 'Custom',
    descriptionTemplate: '',
  },
]

// Month names for formatting
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

// Format description with month/year
export function formatItemDescription(template: string, month: number, year: number): string {
  return template
    .replace('{month}', MONTH_NAMES[month])
    .replace('{year}', String(year))
}

// Generate invoice number
export function generateInvoiceNo(year: number, sequence: number): string {
  const yearSuffix = String(year).slice(-2)  // e.g., 2026 -> 26
  return `#${yearSuffix}-ETC-${sequence}`
}

// Parse invoice number to extract year and sequence
export function parseInvoiceNo(invoiceNo: string): { year: number; sequence: number } | null {
  const match = invoiceNo.match(/^#(\d{2})-ETC-(\d+)$/)
  if (!match) return null

  const yearSuffix = parseInt(match[1], 10)
  const sequence = parseInt(match[2], 10)

  // Convert 2-digit year to 4-digit (assume 2000s)
  const year = yearSuffix < 50 ? 2000 + yearSuffix : 1900 + yearSuffix

  return { year, sequence }
}

// Format date as DD-MMM-YY (e.g., "26-Dec-25")
export function formatInvoiceDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const day = d.getDate()
  const monthShort = d.toLocaleString('en-US', { month: 'short' })
  const yearShort = String(d.getFullYear()).slice(-2)
  return `${day}-${monthShort}-${yearShort}`
}

// Format currency
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

// Format amount without currency symbol
export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
