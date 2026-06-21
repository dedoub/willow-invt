// Client-safe ETF types. `export type` is fully erased at build, so importing
// this from a client component does NOT pull the server-only `supabase-etf`
// module (which holds the service-role DB clients) into the browser bundle.
export type {
  FeeTier,
  FeeStructure,
  AUMData,
  ETFProduct,
  ETFProductInput,
  ETFDisplayData,
  HistoricalAUMPoint,
  HistoricalDataPoint,
  ETFDocument,
  TimeSeriesData,
  AkrosProduct,
} from './supabase-etf'
