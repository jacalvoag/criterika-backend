/**
 * Criterika treats email addresses case-insensitively and trims surrounding
 * whitespace. Keep provider-specific dots and plus suffixes unchanged.
 * Validation of the HTTP input and normalized address is a separate step.
 */
export function normalizeRegistrationEmail(email: string): string {
  return email.trim().toLowerCase();
}
