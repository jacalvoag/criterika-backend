import { normalizeRegistrationEmail } from './registration-email.js';

describe('normalizeRegistrationEmail', () => {
  it('quita espacios externos y compara sin distinguir mayúsculas', () => {
    expect(normalizeRegistrationEmail('  Persona@Example.COM  ')).toBe(
      'persona@example.com',
    );
  });

  it('conserva puntos y sufijos sin aplicar reglas específicas del proveedor', () => {
    expect(normalizeRegistrationEmail('A.B+Escuela@Example.COM')).toBe(
      'a.b+escuela@example.com',
    );
  });
});
