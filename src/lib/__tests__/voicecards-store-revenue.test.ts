import assert from 'node:assert/strict'
import test from 'node:test'

import {
  aggregateVoicecardsStoreRevenue,
  parseVoicecardsAppStoreSalesReport,
  parseVoicecardsGooglePlaySalesReport,
} from '../voicecards-store-revenue'

test('parses the actual customer price from an App Store sales report', () => {
  const report = [
    'SKU\tUnits\tDeveloper Proceeds\tCustomer Currency\tCurrency of Proceeds\tProduct Type Identifier\tCustomer Price',
    'com.monor.voicecards.credits.1000\t1\t1159\tJPY\tJPY\tIA1\t1800',
  ].join('\n')

  assert.deepEqual(parseVoicecardsAppStoreSalesReport(report, '2026-09-08'), [{
    date: '2026-09-08',
    platform: 'ios',
    product_id: 'com.monor.voicecards.credits.1000:IA1',
    currency: 'JPY',
    units: 1,
    customer_price: 1800,
    proceeds: 1159,
    proceeds_currency: 'JPY',
  }])
})

test('aggregates actual sales and proceeds by store and currency', () => {
  const totals = aggregateVoicecardsStoreRevenue([
    {
      platform: 'ios',
      currency: 'JPY',
      units: 2,
      customer_price: 3600,
      proceeds: 2318,
      proceeds_currency: 'JPY',
    },
    {
      platform: 'ios',
      currency: 'JPY',
      units: -1,
      customer_price: -1800,
      proceeds: -1159,
      proceeds_currency: 'JPY',
    },
    {
      platform: 'android',
      currency: 'USD',
      units: 1,
      customer_price: 9.99,
      proceeds: 8.49,
      proceeds_currency: 'USD',
    },
  ])

  assert.equal(totals.reportedUnits, 2)
  assert.equal(totals.unpricedRows, 0)
  assert.deepEqual(Object.fromEntries(totals.salesByPlatformCurrency), {
    'android:USD': 9.99,
    'ios:JPY': 1800,
  })
  assert.deepEqual(Object.fromEntries(totals.proceedsByPlatformCurrency), {
    'android:USD': 8.49,
    'ios:JPY': 1159,
  })
})

test('parses and aggregates Google Play charged amounts in buyer currency', () => {
  const report = [
    'Order Number,Order Charged Date,Financial Status,Product Title,Package ID,SKU ID,Currency of Sale,Charged Amount',
    'GPA.1,2026-08-22,Charged,"1,100 Credits",com.monor.voicecards,com.monor.voicecards.credits.1000,EUR,9.99',
    'GPA.2,2026-08-22,Charged,"1,100 Credits",com.monor.voicecards,com.monor.voicecards.credits.1000,EUR,8.99',
    'GPA.3,2026-08-23,Refunded,100 Credits,com.monor.voicecards,com.monor.voicecards.credits.100,EUR,0.99',
  ].join('\n')

  assert.deepEqual(parseVoicecardsGooglePlaySalesReport(report, 'com.monor.voicecards'), [
    {
      date: '2026-08-22',
      platform: 'android',
      product_id: 'com.monor.voicecards.credits.1000',
      currency: 'EUR',
      units: 2,
      customer_price: 18.98,
      proceeds: null,
      proceeds_currency: null,
    },
    {
      date: '2026-08-23',
      platform: 'android',
      product_id: 'com.monor.voicecards.credits.100',
      currency: 'EUR',
      units: -1,
      customer_price: -0.99,
      proceeds: null,
      proceeds_currency: null,
    },
  ])
})

test('keeps a partial refund amount when the report has zero units', () => {
  const totals = aggregateVoicecardsStoreRevenue([{
    platform: 'ios',
    currency: 'USD',
    units: 0,
    customer_price: -2.5,
    proceeds: -1.75,
    proceeds_currency: 'USD',
  }])

  assert.equal(totals.salesByPlatformCurrency.get('ios:USD'), -2.5)
  assert.equal(totals.proceedsByPlatformCurrency.get('ios:USD'), -1.75)
})
