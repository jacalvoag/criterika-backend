import { normalizeWordText } from './word-normalization.js';

describe('normalizeWordText', () => {
  describe('mayúsculas y minúsculas', () => {
    it('convierte las minúsculas a mayúsculas', () => {
      expect(normalizeWordText('palabra')).toBe('PALABRA');
    });

    it('iguala variantes que solo difieren en mayúsculas', () => {
      expect(normalizeWordText('PaLaBrA')).toBe(normalizeWordText('pAlAbRa'));
    });
  });

  describe('tildes', () => {
    it.each([
      ['á', 'A'],
      ['é', 'E'],
      ['í', 'I'],
      ['ó', 'O'],
      ['ú', 'U'],
      ['Á', 'A'],
      ['É', 'E'],
      ['Í', 'I'],
      ['Ó', 'O'],
      ['Ú', 'U'],
    ])('quita la tilde de %s', (accented, expected) => {
      expect(normalizeWordText(accented)).toBe(expected);
    });

    it('iguala una palabra con tilde y la misma sin tilde', () => {
      expect(normalizeWordText('canción')).toBe(normalizeWordText('cancion'));
    });

    it('quita la tilde escrita como marca combinante', () => {
      expect(normalizeWordText('canción')).toBe('CANCION');
    });
  });

  describe('diéresis', () => {
    it.each([
      ['pingüino', 'PINGUINO'],
      ['PINGÜINO', 'PINGUINO'],
    ])('convierte la Ü de %s en U', (word, expected) => {
      expect(normalizeWordText(word)).toBe(expected);
    });
  });

  describe('Ñ distinta de N', () => {
    it('conserva la Ñ mayúscula', () => {
      expect(normalizeWordText('AÑO')).toBe('AÑO');
    });

    it('convierte la ñ minúscula en Ñ', () => {
      expect(normalizeWordText('año')).toBe('AÑO');
    });

    it('no iguala una palabra con Ñ a la misma con N', () => {
      expect(normalizeWordText('año')).not.toBe(normalizeWordText('ano'));
    });

    it('no iguala una palabra con N a la misma con Ñ', () => {
      expect(normalizeWordText('ANO')).not.toBe(normalizeWordText('AÑO'));
    });

    it.each([
      ['precompuesta minúscula', 'año'],
      ['precompuesta mayúscula', 'AÑO'],
      ['descompuesta minúscula', 'año'],
      ['descompuesta mayúscula', 'AÑO'],
    ])('reconoce la Ñ %s', (_form, word) => {
      expect(normalizeWordText(word)).toBe('AÑO');
    });
  });

  describe('espacios', () => {
    it('quita los espacios al inicio, en medio y al final', () => {
      expect(normalizeWordText('  buen  dia  ')).toBe('BUENDIA');
    });

    it('quita tabuladores, saltos de línea y espacios duros', () => {
      expect(normalizeWordText('a\tb\nc\r\nd e')).toBe('ABCDE');
    });
  });

  describe('puntuación', () => {
    it('quita la puntuación del español', () => {
      expect(normalizeWordText('¡Hola!, ¿qué: tal?; (bien).')).toBe(
        'HOLAQUETALBIEN',
      );
    });

    it('quita apóstrofos y comillas', () => {
      expect(normalizeWordText(`O'Higgins "«dato»"`)).toBe('OHIGGINSDATO');
    });

    it.each([
      ['guion', 'a-b'],
      ['guion largo', 'a—b'],
      ['semiguion', 'a–b'],
    ])('quita el %s', (_name, word) => {
      expect(normalizeWordText(word)).toBe('AB');
    });
  });

  describe('palabras compuestas', () => {
    it('une una palabra compuesta con espacios y guiones', () => {
      expect(normalizeWordText('Teórico - práctico  final')).toBe(
        'TEORICOPRACTICOFINAL',
      );
    });

    it('iguala las distintas formas de escribir una palabra compuesta', () => {
      expect(normalizeWordText('medio-ambiente')).toBe(
        normalizeWordText('Medio Ambiente'),
      );
    });

    it('conserva la Ñ dentro de una palabra compuesta', () => {
      expect(normalizeWordText('niño-año nuevo')).toBe('NIÑOAÑONUEVO');
    });
  });

  describe('entradas vacías', () => {
    it.each([
      ['cadena vacía', ''],
      ['solo espacios', '   \t\n'],
      ['solo puntuación', '-.,;:¿?¡!'],
    ])('devuelve cadena vacía con %s', (_name, text) => {
      expect(normalizeWordText(text)).toBe('');
    });
  });

  describe('números y símbolos', () => {
    it('conserva los números', () => {
      expect(normalizeWordText('covid19')).toBe('COVID19');
    });

    it('no iguala palabras que solo difieren en un número', () => {
      expect(normalizeWordText('covid19')).not.toBe(normalizeWordText('covid'));
    });

    it.each([
      ['a+b', 'A+B'],
      ['a=b', 'A=B'],
      ['100$', '100$'],
    ])('conserva los símbolos de %s', (text, expected) => {
      expect(normalizeWordText(text)).toBe(expected);
    });

    it('produce un texto que el patrón de BoardPlacement.textoNormalizado rechaza', () => {
      expect(normalizeWordText('covid19')).not.toMatch(/^[A-ZÑ]{2,20}$/);
    });
  });

  describe('caracteres invisibles', () => {
    it.each([
      ['espacio de ancho cero', '​'],
      ['separador de ancho cero', '‌'],
      ['unión de ancho cero', '‍'],
      ['unión de palabras', '⁠'],
      ['marca de orden de bytes', '﻿'],
      ['guion suave', '­'],
      ['control de dirección', '‮'],
    ])('quita el carácter %s', (_name, invisible) => {
      expect(normalizeWordText(`pa${invisible}labra`)).toBe('PALABRA');
    });

    it('iguala un texto con invisibles y el mismo texto sin ellos', () => {
      expect(normalizeWordText('a​b')).toBe(normalizeWordText('AB'));
    });

    it('conserva la Ñ cuando un invisible separa la N de su tilde', () => {
      expect(normalizeWordText('n‍̃')).toBe('Ñ');
    });
  });

  describe('forma de la salida', () => {
    it('produce un texto que cumple el patrón de BoardPlacement.textoNormalizado', () => {
      expect(normalizeWordText('Señalización vial')).toMatch(/^[A-ZÑ]{2,20}$/);
    });

    it('devuelve lo mismo al normalizar un texto ya normalizado', () => {
      const normalized = normalizeWordText('¿Pingüino del año?');

      expect(normalizeWordText(normalized)).toBe(normalized);
    });
  });
});
