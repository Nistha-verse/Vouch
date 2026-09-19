export function safeBigIntToString(value: unknown): string {
  if (typeof value === 'bigint') return value.toString();
  throw new Error('Expected bigint');
}

export function serializeIntentFields(intent: any): any {
  // Convert bigint amount to string when present.
  const copy = { ...intent };
  if (copy && typeof copy === 'object' && 'amount' in copy) {
    if (typeof copy.amount === 'bigint') copy.amount = copy.amount.toString();
  }
  return copy;
}

export function jsonResponse(res: any, payload: unknown) {
  // Ensure no bigint escapes into JSON.stringify
  return JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}
