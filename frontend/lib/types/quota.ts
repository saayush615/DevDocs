// used = today's count (or lifetime count for documents/conversations),
// limit = the cap the backend enforces (from Quota env vars).
export interface QuotaUsage {
  used: number;
  limit: number;
}

export interface Quota {
  queries: QuotaUsage;
  uploads: QuotaUsage;
  documents: QuotaUsage;
  conversations: QuotaUsage;
}
