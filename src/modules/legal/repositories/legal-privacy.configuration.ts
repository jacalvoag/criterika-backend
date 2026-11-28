export interface RegistrationPrivacyConfiguration {
  responsibleName: string;
  contactEmail: string;
  postalAddress: string;
}

/** Same operational prerequisite for registration, later acceptance and legal publication. */
export function isPrivacyConfigured(
  privacy: RegistrationPrivacyConfiguration,
): boolean {
  return (
    [
      privacy.responsibleName,
      privacy.contactEmail,
      privacy.postalAddress,
    ].every((value) => typeof value === 'string' && value.trim().length > 0) &&
    /^[^\s@]+@[^\s@]+$/.test(privacy.contactEmail)
  );
}
