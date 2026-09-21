const MAX_RECIPIENT_LENGTH = 64;
const MAX_CATEGORY_LENGTH = 64;

export function canonicalRecipient(value: unknown): string {
  return canonicalText(value, 'recipient', MAX_RECIPIENT_LENGTH);
}

export function canonicalCategory(value: unknown): string {
  return canonicalText(value, 'category', MAX_CATEGORY_LENGTH);
}

function canonicalText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string.`);
  }
  const canonical = value.trim();
  if (!canonical || canonical.length > maxLength) {
    throw new Error(`${field} must be non-empty and within the maximum length.`);
  }
  return canonical;
}
