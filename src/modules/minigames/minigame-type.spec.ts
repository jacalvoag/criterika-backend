import { MINIGAME_TYPES } from './minigame-type.js';

describe('Tipos de minijuego', () => {
  it('contiene exactamente los tipos de minijuego del contrato', () => {
    expect(MINIGAME_TYPES).toEqual([
      'MEMORAMA',
      'PREGUNTAS',
      'SOPA_LETRAS',
      'CRUCIGRAMA',
      'RELACIONAR',
    ]);
  });
});
