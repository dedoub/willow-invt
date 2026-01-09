// Invoice Types

export interface LineItem {
  description: string
  qty?: number | null
  unitPrice?: number | null
  amount: number
}

export interface Invoice {
  id: string
  user_id: string | null
  invoice_no: string
  invoice_date: string  // ISO date string (YYYY-MM-DD)
  bill_to_company: string
  attention: string
  line_items: LineItem[]
  total_amount: number
  currency: string
  status: InvoiceStatus
  sent_at: string | null
  paid_at: string | null
  sent_to_email: string | null
  gmail_message_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'

export interface CreateInvoiceInput {
  invoice_date: string
  invoice_no?: string  // Auto-generated if not provided
  bill_to_company?: string
  attention?: string
  line_items: LineItem[]
  notes?: string
}

export interface UpdateInvoiceInput {
  invoice_date?: string
  bill_to_company?: string
  attention?: string
  line_items?: LineItem[]
  status?: InvoiceStatus
  sent_to_email?: string
  gmail_message_id?: string
  notes?: string
}

export type InvoiceItemType = 'monthly_fee' | 'referral_fee' | 'custom'

export interface InvoiceItemTemplate {
  type: InvoiceItemType
  label: string
  descriptionTemplate: string  // e.g., "Monthly Fee - {month} {year}"
}
