import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { TransactionRunner } from '../../src/database/transaction-runner.js';
import { IdempotencyStore } from '../../src/database/idempotency-store.js';
import { GameAccountRepository } from '../../src/modules/accounts/repositories/game-account.repository.js';
import { GameContentRepository } from '../../src/modules/content/repositories/game-content.repository.js';
import {
  GameEconomyRepository,
  type PlayerStateRow,
} from '../../src/modules/economy/repositories/game-economy.repository.js';
import { GameplayRepository } from '../../src/modules/gameplay/repositories/gameplay.repository.js';
import { GameCollectionRepository } from '../../src/modules/collection/repositories/game-collection.repository.js';
import { GameDictionaryRepository } from '../../src/modules/dictionary/repositories/game-dictionary.repository.js';
import { buildLearningPath } from '../../src/modules/content/learning-path.js';
import {
  calculateLives,
  reserveLife,
  settleReservation,
} from '../../src/modules/economy/lives.js';
import { calculateRewardPolicy } from '../../src/modules/economy/level-reward.js';
import { resolveAttemptHeartbeat } from '../../src/modules/gameplay/attempt-heartbeat.js';
import type { AttemptRow } from '../../src/modules/gameplay/repositories/gameplay.rows.js';

function testUrl(name: string): URL {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `Falta ${name}; usar únicamente una base local desechable criterika_prueba_*.`,
    );
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/^\/criterika_prueba_[a-z0-9_]+$/.test(url.pathname)
  ) {
    throw new Error(
      'La suite solo admite una base local desechable criterika_prueba_*.',
    );
  }
  return url;
}
const appUrl = testUrl('PERSISTENCE_TEST_URL');
const adminUrl = testUrl('PERSISTENCE_TEST_ADMIN_URL');
if (
  appUrl.host !== adminUrl.host ||
  appUrl.pathname !== adminUrl.pathname ||
  appUrl.username === adminUrl.username
) {
  throw new Error(
    'Operador y aplicación deben apuntar a la misma base con logins separados.',
  );
}
const pool = new Pool({
  connectionString: appUrl.toString(),
  max: 5,
  options: '-c timezone=UTC',
  statement_timeout: 7000,
});
const admin = new Pool({
  connectionString: adminUrl.toString(),
  max: 2,
  options: '-c timezone=UTC',
  statement_timeout: 7000,
});
const runner = new TransactionRunner(pool);
const accounts = new GameAccountRepository();
const content = new GameContentRepository();
const economy = new GameEconomyRepository();
const gameplay = new GameplayRepository();
const collection = new GameCollectionRepository();
const dictionary = new GameDictionaryRepository();
// Deliberately fictitious test keys, never usable as application configuration.
const idempotency = new IdempotencyStore(
  Buffer.alloc(32, 11),
  Buffer.alloc(32, 22),
);
const fixture = readFileSync(
  new URL('../fixtures/01_flujo_jugable.sql', import.meta.url),
  'utf8',
);
const uid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

beforeEach(async () => {
  const tables = await admin.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname='criterika'",
  );
  if (tables.rows.length !== 53)
    throw new Error('Aplicar primero la migración 0001 en la base desechable.');
  const identifiers = tables.rows.map(
    ({ tablename }) => 'criterika."' + tablename.replaceAll('"', '""') + '"',
  );
  await admin.query(
    'TRUNCATE ' + identifiers.join(',') + ' RESTART IDENTITY CASCADE',
  );
  await admin.query(fixture);
});
afterAll(async () => {
  await pool.end();
  await admin.end();
});

/** Test coordinator only: no substitute for Uzzi's session/access capabilities or Rafael's services. */
async function playerTransaction<T>(
  player: number,
  work: (client: PoolClient, state: PlayerStateRow) => Promise<T>,
): Promise<T> {
  return runner.run(
    { tipo: 'JUGADOR', actorId: uid(player), requestId: randomUUID() },
    async (client) => {
      if (!(await accounts.lockPlayerAccount(client, uid(player))))
        throw new Error('Cuenta ficticia ausente');
      const state = await economy.lockPlayerState(client, uid(player));
      if (!state) throw new Error('Estado ficticio ausente');
      return work(client, state);
    },
  );
}
async function startIn(
  client: PoolClient,
  player: number,
  level: number,
  now: Date,
) {
  const preview = await content.lockLevelForStart(client, uid(level));
  if (!preview) throw new Error('Nivel ficticio ausente');
  const activities = await content.findPublishedActivities(
    client,
    preview.revisionId,
  );
  return gameplay.insertAttempt(client, {
    jugadorId: uid(player),
    nivelId: preview.nivelId,
    revisionId: preview.revisionId,
    zonaHoraria: 'America/Mexico_City',
    iniciadoEn: now,
    gemasPrevistas: level === 103 ? 300 : 150,
    xpPrevista: level === 103 ? 250 : 100,
    cartaPrevistaId: level === 103 ? (preview.carta?.id ?? null) : null,
    actividades: activities.map((a) => ({
      actividadId: a.actividadId,
      posicionInicial: a.posicion,
    })),
    terminosIds: preview.terminosIds,
    primeraEjecucion: { estadoJuego: {} },
  });
}
async function start(player = 10, level = 101, now = new Date()) {
  return playerTransaction(player, (client) =>
    startIn(client, player, level, now),
  );
}
async function state(player = 10) {
  return runner.read((client) => economy.findPlayerState(client, uid(player)));
}

async function approveIn(client: PoolClient, attempt: AttemptRow, now: Date) {
  const activities = await gameplay.findAttemptActivities(client, attempt.id);
  for (const activity of activities) {
    const current = await gameplay.findCurrentExecution(client, attempt.id);
    const execution =
      current?.actividad.id === activity.id
        ? current.ejecucion
        : await gameplay.insertExecution(client, {
            actividadIntentoId: activity.id,
            intentoId: attempt.id,
            numero: activity.historial.length + 1,
            estadoJuego: {},
            iniciadaEn: now,
          });
    await gameplay.updateExecution(client, {
      ejecucionId: execution.id,
      errores: 0,
      estadoJuego: {},
      estado: 'SUPERADA',
      finalizadaEn: now,
    });
    await gameplay.updateAttemptActivity(client, {
      actividadIntentoId: activity.id,
      estado: 'SUPERADA',
      ordenPendiente: null,
    });
  }
  expect(
    await gameplay.finishAttempt(client, {
      intentoId: attempt.id,
      estado: 'APROBADO',
      motivoFinalizacion: 'TODAS_SUPERADAS',
      finalizadoEn: now,
    }),
  ).toBe(true);
  return gameplay.insertFirstApproval(client, {
    jugadorId: attempt.jugadorId,
    nivelId: attempt.nivelId,
    intentoOrigenId: attempt.id,
    aprobadaEn: now,
    gemasOtorgadas: attempt.gemasPrevistas,
    xpOtorgada: attempt.xpPrevista,
  });
}

describe('Persistencia real del flujo jugable', () => {
  it('el login de aplicación hereda solo su grupo y no modifica auditoría', async () => {
    const roles = await pool.query(`SELECT
      pg_has_role(current_user,'criterika_app','USAGE') AS app,
      pg_has_role(current_user,'criterika_owner','MEMBER') AS owner,
      pg_has_role(current_user,'criterika_maintenance','MEMBER') AS maintenance`);
    expect(roles.rows[0]).toEqual({
      app: true,
      owner: false,
      maintenance: false,
    });
    await expect(
      playerTransaction(10, (client) =>
        client.query('DELETE FROM criterika.eventos_auditoria WHERE false'),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('el estado sin vidas permite rechazar la reserva sin crear intentos', async () => {
    await playerTransaction(12, async (client, player) => {
      expect(
        reserveLife(
          {
            totales: player.vidasTotales,
            reservadas: 0,
            proximaRegeneracionEn: player.proximaRegeneracionEn,
          },
          new Date(),
        ),
      ).toEqual({ ok: false, reason: 'NO_LIVES' });
      expect(await gameplay.findActiveAttempt(client, uid(12))).toBeNull();
    });
  });

  it('excluye términos deshabilitados antes del inicio y fija solo los publicados', async () => {
    await admin.query(
      "UPDATE criterika.terminos SET estado='DESHABILITADO' WHERE id=$1",
      [uid(4002)],
    );
    const result = await start(10, 103);
    const snapshot = await admin.query(
      'SELECT termino_id FROM criterika.terminos_intento WHERE intento_id=$1',
      [result.attempt.id],
    );
    expect(snapshot.rows).toEqual([{ termino_id: uid(4001) }]);
  });

  it('dos fallos seguidos de aprobación conservan la vida reservada', async () => {
    const result = await start();
    await playerTransaction(10, async (client) => {
      await gameplay.lockOwnAttempt(client, uid(10), result.attempt.id);
      let execution = result.ejecucion;
      for (let n = 1; n <= 2; n++) {
        await gameplay.updateExecution(client, {
          ejecucionId: execution.id,
          errores: 4,
          estadoJuego: {},
          estado: 'FALLIDA',
          finalizadaEn: new Date(),
        });
        await gameplay.updateAttemptActivity(client, {
          actividadIntentoId: result.actividades[0].id,
          estado: 'PENDIENTE_RECUPERACION',
          ordenPendiente: await gameplay.takeNextPendingOrder(
            client,
            result.attempt.id,
          ),
        });
        execution = await gameplay.insertExecution(client, {
          actividadIntentoId: result.actividades[0].id,
          intentoId: result.attempt.id,
          numero: n + 1,
          estadoJuego: {},
          iniciadaEn: new Date(),
        });
      }
      const approval = await approveIn(client, result.attempt, new Date());
      if (!approval) throw new Error('Aprobación ficticia ausente');
      await economy.creditLevelReward(client, {
        cuentaId: uid(10),
        aprobacionId: approval.aprobacionId,
        gemas: 150,
        xp: 100,
        registradaEn: new Date(),
      });
      const activities = await gameplay.findAttemptActivities(
        client,
        result.attempt.id,
      );
      expect(activities[0].historial).toEqual([
        'FALLIDA',
        'FALLIDA',
        'SUPERADA',
      ]);
    });
    expect((await state())?.vidasTotales).toBe(5);
  });

  it('lee el camino publicado y conserva el progreso y los niveles deshabilitados', async () => {
    await runner.read(async (client) => {
      const path = await content.findLearningPath(client, uid(10));
      expect(path.map((u) => u.id)).toEqual([uid(100), uid(110), uid(120)]);
      expect(path[0].niveles[0].nombre).toBe('Nombre publicado 101');
      const result = buildLearningPath(path);
      expect(
        result.ok && result.items[0].niveles.map((n) => n.disponible),
      ).toEqual([true, false, false]);
      const progress = buildLearningPath(
        await content.findLearningPath(client, uid(11)),
      );
      expect(progress.ok && progress.items[0].niveles[1].disponible).toBe(true);
      expect(result.ok && result.items[2].niveles[0].motivoNoDisponible).toBe(
        'UNIDAD_DESHABILITADA',
      );
    });
  });

  it('la vista previa omite soluciones y usa el nombre de la revisión', async () => {
    const preview = await runner.read((client) =>
      content.findPublishedLevelPreview(client, uid(101)),
    );
    expect(preview?.nombrePublicado).toBe('Nombre publicado 101');
    expect(preview?.actividades).toHaveLength(3);
    expect(JSON.stringify(preview)).not.toMatch(
      /contenido|opcionCorrectaId|parejas/,
    );
    expect(
      await runner.read((client) =>
        content.findPublishedLevelPreview(client, uid(131)),
      ),
    ).toBeNull();
  });

  it('un final sin carta publicada entrega datos para bloquear el inicio', async () => {
    const preview = await runner.read((client) =>
      content.findPublishedLevelPreview(client, uid(111)),
    );
    expect(preview?.carta?.estado).toBe('BORRADOR');
    expect(
      calculateRewardPolicy({
        tipo: 'FINAL_UNIDAD',
        cartaId:
          preview?.carta?.estado === 'PUBLICADO' ? preview.carta.id : null,
        primeraAprobacionRegistrada: false,
      }),
    ).toEqual({ ok: false, reason: 'MISSING_CARD' });
  });

  it('lee tableros del snapshot aunque cambie el borrador', async () => {
    const before = await runner.read((client) =>
      content.findPublishedActivities(client, uid(201)),
    );
    await admin.query(
      "UPDATE criterika.actividades SET contenido_borrador=jsonb_set(contenido_borrador,'{cambio}','true') WHERE nivel_id=$1",
      [uid(102)],
    );
    const after = await runner.read((client) =>
      content.findPublishedActivities(client, uid(201)),
    );
    expect(after).toEqual(before);
    expect(after.map((a) => a.tipo)).toEqual([
      'SOPA_LETRAS',
      'CRUCIGRAMA',
      'PREGUNTAS',
    ]);
    expect(after[0].contenido).toHaveProperty('distribucion.cuadricula');
  });

  it('convierte bigint a number y fechas locales a string sin cambiar la fila', async () => {
    const before = await state(11);
    expect(before?.gemasSaldo).toBe(450);
    expect(before?.xpTotal).toBe(100);
    expect(typeof before?.rachaUltimoDia).toBe('string');
    expect(
      calculateLives(
        {
          totales: before!.vidasTotales,
          reservadas: 0,
          proximaRegeneracionEn: before!.proximaRegeneracionEn,
        },
        new Date(),
      ).totales,
    ).toBe(5);
    expect(await state(11)).toEqual(before);
  });

  it('rechaza un bigint que no puede representarse exactamente', async () => {
    await admin.query(
      'UPDATE criterika.estados_jugador SET gemas_saldo=9007199254740993 WHERE cuenta_id=$1',
      [uid(10)],
    );
    await expect(state()).rejects.toThrow('entero seguro');
  });

  it('mantiene una instantánea coherente en consultas compuestas', async () => {
    await runner.read(async (client) => {
      expect(
        (await economy.findPlayerState(client, uid(10)))?.vidasTotales,
      ).toBe(5);
      await admin.query(
        "UPDATE criterika.estados_jugador SET vidas_totales=4,proxima_regeneracion_en=now()+interval '1 hour' WHERE cuenta_id=$1",
        [uid(10)],
      );
      expect(
        (await economy.findPlayerState(client, uid(10)))?.vidasTotales,
      ).toBe(5);
    });
    expect((await state())?.vidasTotales).toBe(4);
  });

  it('la transacción READ ONLY rechaza escrituras y libera el cliente', async () => {
    await expect(
      runner.read((client) =>
        economy.updateLives(client, uid(10), {
          vidasTotales: 5,
          proximaRegeneracionEn: null,
        }),
      ),
    ).rejects.toMatchObject({ code: '25006' });
    expect((await state())?.vidasTotales).toBe(5);
  });

  it('inicia con una sola ejecución, reserva implícita y cinco vidas totales', async () => {
    const result = await start();
    expect(result.actividades.map((a) => a.estado)).toEqual([
      'EN_EJECUCION',
      'PENDIENTE',
      'PENDIENTE',
    ]);
    const player = await state();
    const lives = calculateLives(
      {
        totales: player!.vidasTotales,
        reservadas: 1,
        proximaRegeneracionEn: player!.proximaRegeneracionEn,
      },
      new Date(),
    );
    expect(lives).toMatchObject({
      totales: 5,
      disponibles: 4,
      reservadas: 1,
      proximaRegeneracionEn: null,
    });
    expect(result.attempt.siguienteOrdenPendiente).toBe(7);
    expect(
      (
        await admin.query(
          'SELECT estructura_fijada FROM criterika.unidades WHERE id=$1',
          [uid(100)],
        )
      ).rows[0].estructura_fijada,
    ).toBe(true);
  });

  it('dos inicios concurrentes con el orden de bloqueo dejan un solo intento activo', async () => {
    const begin = () =>
      playerTransaction(10, async (client) => {
        if (await gameplay.lockActiveAttempt(client, uid(10)))
          return 'ACTIVE_ATTEMPT_EXISTS';
        await startIn(client, 10, 101, new Date());
        return 'CREATED';
      });
    expect((await Promise.all([begin(), begin()])).sort()).toEqual([
      'ACTIVE_ATTEMPT_EXISTS',
      'CREATED',
    ]);
    expect(
      (
        await admin.query(
          "SELECT count(*)::int AS n FROM criterika.intentos_nivel WHERE jugador_id=$1 AND estado='EN_CURSO'",
          [uid(10)],
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it('revierte intento, ejecución y vidas si falla una escritura posterior', async () => {
    await expect(
      playerTransaction(10, async (client) => {
        await startIn(client, 10, 101, new Date());
        await economy.updateLives(client, uid(10), {
          vidasTotales: 4,
          proximaRegeneracionEn: new Date(),
        });
        throw new Error('Falla controlada');
      }),
    ).rejects.toThrow('Falla controlada');
    expect(
      await runner.read((client) =>
        gameplay.findActiveAttempt(client, uid(10)),
      ),
    ).toBeNull();
    expect((await state())?.vidasTotales).toBe(5);
  });

  it('conserva el contexto solamente durante su transacción', async () => {
    await playerTransaction(10, async (client) => {
      expect(
        (
          await client.query(
            "SELECT current_setting('criterika.actor_id') AS actor",
          )
        ).rows[0].actor,
      ).toBe(uid(10));
    });
    const client = await pool.connect();
    try {
      expect(
        (
          await client.query(
            "SELECT nullif(current_setting('criterika.actor_id',true),'') AS actor",
          )
        ).rows[0].actor,
      ).toBeNull();
    } finally {
      client.release();
    }
  });

  it('no encuentra un intento ni una ejecución de otro titular', async () => {
    const result = await start();
    await playerTransaction(11, async (client) => {
      expect(
        await gameplay.lockOwnAttempt(client, uid(11), result.attempt.id),
      ).toBeNull();
    });
    expect(
      await runner.read((client) =>
        gameplay.findOwnAttempt(client, uid(11), result.attempt.id),
      ),
    ).toBeNull();
    expect(
      await playerTransaction(10, (client) =>
        gameplay.lockExecution(client, randomUUID(), result.ejecucion.id),
      ),
    ).toBeNull();
  });

  it('lleva el fallo recuperable al final y conserva historial por actividad', async () => {
    const result = await start();
    await playerTransaction(10, async (client) => {
      await gameplay.lockOwnAttempt(client, uid(10), result.attempt.id);
      await gameplay.lockExecution(
        client,
        result.attempt.id,
        result.ejecucion.id,
      );
      await gameplay.updateExecution(client, {
        ejecucionId: result.ejecucion.id,
        errores: 4,
        estadoJuego: { parejasResueltas: [] },
        estado: 'FALLIDA',
        finalizadaEn: new Date(),
      });
      const orden = await gameplay.takeNextPendingOrder(
        client,
        result.attempt.id,
      );
      await gameplay.updateAttemptActivity(client, {
        actividadIntentoId: result.actividades[0].id,
        estado: 'PENDIENTE_RECUPERACION',
        ordenPendiente: orden,
      });
      const all = await gameplay.findAttemptActivities(
        client,
        result.attempt.id,
      );
      const next = all
        .filter((a) => a.ordenPendiente !== null)
        .sort((a, b) => a.ordenPendiente! - b.ordenPendiente!)[0];
      expect(next.actividadId).toBe(result.actividades[1].actividadId);
      await gameplay.insertExecution(client, {
        actividadIntentoId: next.id,
        intentoId: result.attempt.id,
        numero: 1,
        estadoJuego: {},
        iniciadaEn: new Date(),
      });
      const current = await gameplay.findCurrentExecution(
        client,
        result.attempt.id,
      );
      expect(current?.actividad.historial).toEqual(['EN_CURSO']);
      expect(all[0].historial).toEqual(['FALLIDA']);
      expect(all[0].ordenPendiente).toBe(7);
    });
  });

  it('el tercer fallo termina sin abrir otra ejecución y consume una vida una sola vez', async () => {
    const result = await start();
    await playerTransaction(10, async (client, player) => {
      await gameplay.lockOwnAttempt(client, uid(10), result.attempt.id);
      let execution = result.ejecucion;
      for (let n = 1; n <= 3; n++) {
        await gameplay.updateExecution(client, {
          ejecucionId: execution.id,
          errores: 4,
          estadoJuego: {},
          estado: 'FALLIDA',
          finalizadaEn: new Date(),
        });
        await gameplay.updateAttemptActivity(client, {
          actividadIntentoId: result.actividades[0].id,
          estado: n === 3 ? 'AGOTADA' : 'PENDIENTE_RECUPERACION',
          ordenPendiente:
            n === 3
              ? null
              : await gameplay.takeNextPendingOrder(client, result.attempt.id),
        });
        if (n < 3)
          execution = await gameplay.insertExecution(client, {
            actividadIntentoId: result.actividades[0].id,
            intentoId: result.attempt.id,
            numero: n + 1,
            estadoJuego: {},
            iniciadaEn: new Date(),
          });
      }
      expect(
        await gameplay.finishAttempt(client, {
          intentoId: result.attempt.id,
          estado: 'FALLIDO',
          motivoFinalizacion: 'TERCER_FALLO',
          finalizadoEn: new Date(),
        }),
      ).toBe(true);
      const settled = settleReservation(
        {
          totales: player.vidasTotales,
          reservadas: 1,
          proximaRegeneracionEn: player.proximaRegeneracionEn,
        },
        'FALLIDO',
        new Date(),
      );
      if (!settled.ok) throw new Error('Reserva ficticia ausente');
      await economy.updateLives(client, uid(10), {
        vidasTotales: settled.state.totales,
        proximaRegeneracionEn: settled.state.proximaRegeneracionEn,
      });
      expect(
        await gameplay.finishAttempt(client, {
          intentoId: result.attempt.id,
          estado: 'ABANDONADO',
          motivoFinalizacion: 'SALIDA_CONFIRMADA',
          finalizadoEn: new Date(),
        }),
      ).toBe(false);
      expect(
        await gameplay.findCurrentExecution(client, result.attempt.id),
      ).toBeNull();
    });
    expect((await state())?.vidasTotales).toBe(4);
    expect(
      (
        await admin.query(
          'SELECT count(*)::int AS n FROM criterika.ejecuciones_actividad WHERE intento_id=$1',
          [result.attempt.id],
        )
      ).rows[0].n,
    ).toBe(3);
  });

  it('confirma aprobación, saldo y movimiento juntos sin duplicar la recompensa', async () => {
    const result = await start();
    await playerTransaction(10, async (client) => {
      await gameplay.lockOwnAttempt(client, uid(10), result.attempt.id);
      const approval = await approveIn(client, result.attempt, new Date());
      if (!approval) throw new Error('Aprobación ficticia ausente');
      const input = {
        cuentaId: uid(10),
        aprobacionId: approval.aprobacionId,
        gemas: 150,
        xp: 100,
        registradaEn: new Date(),
      };
      expect(await economy.creditLevelReward(client, input)).toEqual({
        saldoPosterior: 150,
      });
      expect(await economy.creditLevelReward(client, input)).toEqual({
        saldoPosterior: 150,
      });
      await economy.updateStreak(client, uid(10), {
        dias: 1,
        ultimaFechaLocalAprobada: '2026-11-21',
        zonaHoraria: 'America/Mexico_City',
      });
    });
    expect(await state()).toMatchObject({
      gemasSaldo: 150,
      xpTotal: 100,
      vidasTotales: 5,
      rachaUltimoDia: '2026-11-21',
    });
    expect(
      (
        await admin.query(
          'SELECT count(*)::int AS n FROM criterika.movimientos_gemas WHERE jugador_id=$1',
          [uid(10)],
        )
      ).rows[0].n,
    ).toBe(1);
    const repeated = await start();
    await playerTransaction(10, async (client) => {
      expect(await approveIn(client, repeated.attempt, new Date())).toBeNull();
      await economy.updateStreak(client, uid(10), {
        dias: 2,
        ultimaFechaLocalAprobada: '2026-11-22',
        zonaHoraria: 'America/Mexico_City',
      });
    });
    expect(await state()).toMatchObject({
      gemasSaldo: 150,
      xpTotal: 100,
      rachaContadorHito: 2,
    });
  });

  it('el final otorga carta y términos fijados aunque se deshabiliten después', async () => {
    const result = await start(10, 103);
    await admin.query(
      "UPDATE criterika.terminos SET estado='DESHABILITADO' WHERE id=$1",
      [uid(4001)],
    );
    await admin.query(
      "UPDATE criterika.cartas SET estado='DESHABILITADO' WHERE id=$1",
      [uid(6000)],
    );
    await playerTransaction(10, async (client) => {
      const approval = await approveIn(client, result.attempt, new Date());
      if (!approval) throw new Error('Aprobación ficticia ausente');
      await economy.creditLevelReward(client, {
        cuentaId: uid(10),
        aprobacionId: approval.aprobacionId,
        gemas: 300,
        xp: 250,
        registradaEn: new Date(),
      });
      await collection.grantCard(client, {
        jugadorId: uid(10),
        cartaId: uid(6000),
        aprobacionOrigenId: approval.aprobacionId,
        obtenidaEn: new Date(),
      });
      expect(
        await dictionary.grantAttemptTerms(client, {
          jugadorId: uid(10),
          intentoId: result.attempt.id,
          aprobacionOrigenId: approval.aprobacionId,
          desbloqueadosEn: new Date(),
        }),
      ).toEqual([uid(4001), uid(4002)]);
      expect(
        await dictionary.grantAttemptTerms(client, {
          jugadorId: uid(10),
          intentoId: result.attempt.id,
          aprobacionOrigenId: approval.aprobacionId,
          desbloqueadosEn: new Date(),
        }),
      ).toEqual([]);
    });
    expect(await state()).toMatchObject({ gemasSaldo: 300, xpTotal: 250 });
    expect(
      (
        await admin.query(
          'SELECT count(*)::int AS n FROM criterika.cartas_obtenidas WHERE jugador_id=$1',
          [uid(10)],
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it('revierte toda la recompensa si falla la concesión de carta', async () => {
    const result = await start(10, 103);
    await expect(
      playerTransaction(10, async (client) => {
        const approval = await approveIn(client, result.attempt, new Date());
        if (!approval) throw new Error('Aprobación ficticia ausente');
        await economy.creditLevelReward(client, {
          cuentaId: uid(10),
          aprobacionId: approval.aprobacionId,
          gemas: 300,
          xp: 250,
          registradaEn: new Date(),
        });
        await collection.grantCard(client, {
          jugadorId: uid(10),
          cartaId: randomUUID(),
          aprobacionOrigenId: approval.aprobacionId,
          obtenidaEn: new Date(),
        });
      }),
    ).rejects.toThrow('derecho fijado');
    expect((await state())?.gemasSaldo).toBe(0);
    expect(
      await runner.read((client) =>
        content.hasFirstApproval(client, uid(10), uid(103)),
      ),
    ).toBe(false);
    expect(
      (
        await runner.read((client) =>
          gameplay.findOwnAttempt(client, uid(10), result.attempt.id),
        )
      )?.estado,
    ).toBe('EN_CURSO');
  });

  it('recupera una interacción confirmada incluso después del cierre del intento', async () => {
    const result = await start();
    const key = randomUUID();
    const response = {
      intento: { id: result.attempt.id, estado: 'ABANDONADO' },
      errores: 0,
    };
    await playerTransaction(10, async (client) => {
      await gameplay.lockOwnAttempt(client, uid(10), result.attempt.id);
      await gameplay.insertInteraction(client, {
        ejecucionId: result.ejecucion.id,
        claveIntencion: key,
        huellaSolicitud: Buffer.alloc(32, 9),
        respuesta: { tipo: 'MEMORAMA' },
        evaluacion: response,
        registradaEn: new Date(),
      });
      await gameplay.finishAttempt(client, {
        intentoId: result.attempt.id,
        estado: 'ABANDONADO',
        motivoFinalizacion: 'SALIDA_CONFIRMADA',
        finalizadoEn: new Date(),
      });
    });
    await playerTransaction(10, async (client) => {
      expect(
        await gameplay.lockExecution(
          client,
          result.attempt.id,
          result.ejecucion.id,
        ),
      ).not.toBeNull();
      const interaction = await gameplay.findInteraction(
        client,
        result.ejecucion.id,
        key,
      );
      expect(interaction?.evaluacion).toEqual(response);
      expect(interaction?.huellaSolicitud.equals(Buffer.alloc(32, 9))).toBe(
        true,
      );
    });
    expect(
      (
        await admin.query(
          'SELECT count(*)::int AS n FROM criterika.interacciones_evaluadas WHERE ejecucion_id=$1',
          [result.ejecucion.id],
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it('un heartbeat a los 59 segundos renueva sin consumir', async () => {
    const now = new Date();
    const result = await start(10, 101, now);
    await playerTransaction(10, async (client) => {
      const attempt = await gameplay.lockOwnAttempt(
        client,
        uid(10),
        result.attempt.id,
      );
      const resolved = resolveAttemptHeartbeat(
        attempt!,
        new Date(now.getTime() + 59_000),
      );
      if (!resolved.ok) throw new Error('Heartbeat ficticio vencido');
      await gameplay.touchAttempt(
        client,
        result.attempt.id,
        resolved.ultimaComunicacionEn,
      );
    });
    expect((await state())?.vidasTotales).toBe(5);
    expect(
      (
        await runner.read((client) =>
          gameplay.findOwnAttempt(client, uid(10), result.attempt.id),
        )
      )?.ultimaComunicacionEn.getTime(),
    ).toBe(now.getTime() + 59_000);
  });

  it('monitor y comando concurrentes resuelven el mismo timeout con un solo consumo', async () => {
    const now = new Date();
    const result = await start(10, 101, now);
    const expire = () =>
      playerTransaction(10, async (client, player) => {
        const attempt = await gameplay.lockOwnAttempt(
          client,
          uid(10),
          result.attempt.id,
        );
        const resolved = resolveAttemptHeartbeat(
          attempt!,
          new Date(now.getTime() + 60_000),
        );
        if (resolved.resolucion !== 'ABANDONADO_POR_TIMEOUT') return false;
        const changed = await gameplay.finishAttempt(client, {
          intentoId: result.attempt.id,
          estado: 'ABANDONADO',
          motivoFinalizacion: 'TIMEOUT',
          finalizadoEn: resolved.finalizadoEn,
        });
        if (changed) {
          const settled = settleReservation(
            {
              totales: player.vidasTotales,
              reservadas: 1,
              proximaRegeneracionEn: player.proximaRegeneracionEn,
            },
            'ABANDONADO',
            resolved.finalizadoEn,
          );
          if (!settled.ok) throw new Error('Reserva ficticia ausente');
          await economy.updateLives(client, uid(10), {
            vidasTotales: settled.state.totales,
            proximaRegeneracionEn: settled.state.proximaRegeneracionEn,
          });
        }
        return changed;
      });
    expect(
      (await Promise.all([expire(), expire()])).sort(
        (a, b) => Number(a) - Number(b),
      ),
    ).toEqual([false, true]);
    expect((await state())?.vidasTotales).toBe(4);
    expect(
      await runner.read((client) =>
        gameplay.findCurrentExecution(client, result.attempt.id),
      ),
    ).toBeNull();
  });

  it('confirma un timeout aunque el resultado del comando sea un rechazo tipado', async () => {
    const now = new Date();
    const result = await start(10, 101, now);
    const response = await playerTransaction(10, async (client, player) => {
      const attempt = await gameplay.lockOwnAttempt(
        client,
        uid(10),
        result.attempt.id,
      );
      const resolution = resolveAttemptHeartbeat(
        attempt!,
        new Date(now.getTime() + 3_700_000),
      );
      if (resolution.resolucion !== 'ABANDONADO_POR_TIMEOUT')
        throw new Error('Se esperaba timeout');
      await gameplay.finishAttempt(client, {
        intentoId: result.attempt.id,
        estado: 'ABANDONADO',
        motivoFinalizacion: 'TIMEOUT',
        finalizadoEn: resolution.finalizadoEn,
      });
      const settled = settleReservation(
        {
          totales: player.vidasTotales,
          reservadas: 1,
          proximaRegeneracionEn: player.proximaRegeneracionEn,
        },
        'ABANDONADO',
        resolution.finalizadoEn,
      );
      if (!settled.ok) throw new Error('Reserva ficticia ausente');
      const effective = calculateLives(
        settled.state,
        new Date(now.getTime() + 3_700_000),
      );
      await economy.updateLives(client, uid(10), {
        vidasTotales: effective.totales,
        proximaRegeneracionEn: effective.proximaRegeneracionEn,
      });
      return { ok: false, code: 'ATTEMPT_FINISHED' };
    });
    expect(response.ok).toBe(false);
    expect((await state())?.vidasTotales).toBe(5);
    expect(
      (
        await runner.read((client) =>
          gameplay.findOwnAttempt(client, uid(10), result.attempt.id),
        )
      )?.motivoFinalizacion,
    ).toBe('TIMEOUT');
  });

  it('la restricción SQL impide vidas incompletas sin reloj de regeneración', async () => {
    await expect(
      playerTransaction(10, (client) =>
        economy.updateLives(client, uid(10), {
          vidasTotales: 3,
          proximaRegeneracionEn: null,
        }),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    expect((await state())?.vidasTotales).toBe(5);
  });
});

describe('Idempotencia real del inicio/abandono', () => {
  const identity = () => ({
    cuentaId: uid(10),
    sesionId: uid(510),
    metodo: 'POST' as const,
    ruta: '/levels/' + uid(101) + '/attempts',
    clave: randomUUID(),
  });

  it('reproduce respuesta cifrada y detecta otro cuerpo con la misma clave', async () => {
    const id = identity();
    const body = { zonaHoraria: 'America/Mexico_City', extra: [1, 2] };
    const response = { id: uid(8888), estado: 'EN_CURSO' };
    await playerTransaction(10, async (client) => {
      const claim = await idempotency.claim(client, id, body, new Date());
      if (claim.kind !== 'NEW') throw new Error('Se esperaba intención nueva');
      await idempotency.confirm(client, claim.id, 201, response);
    });
    await playerTransaction(10, async (client) => {
      expect(
        await idempotency.claim(
          client,
          id,
          { extra: [1, 2], zonaHoraria: 'America/Mexico_City' },
          new Date(),
        ),
      ).toEqual({ kind: 'REPLAY', codigoHttp: 201, respuesta: response });
      expect(
        await idempotency.claim(
          client,
          id,
          { zonaHoraria: 'Etc/UTC' },
          new Date(),
        ),
      ).toEqual({ kind: 'MISMATCH' });
    });
    const row = (
      await admin.query(
        'SELECT respuesta_cifrada FROM criterika.controles_idempotencia',
      )
    ).rows[0];
    expect(
      (row.respuesta_cifrada as Buffer).includes(Buffer.from(uid(8888))),
    ).toBe(false);
  });

  it('dos intenciones concurrentes con la misma clave producen un único intento', async () => {
    const id = identity();
    const execute = () =>
      playerTransaction(10, async (client) => {
        const claim = await idempotency.claim(client, id, {}, new Date());
        if (claim.kind !== 'NEW') return claim.kind;
        const attempt = await startIn(client, 10, 101, new Date());
        await idempotency.confirm(client, claim.id, 201, {
          id: attempt.attempt.id,
        });
        return 'NEW';
      });
    expect((await Promise.all([execute(), execute()])).sort()).toEqual([
      'NEW',
      'REPLAY',
    ]);
    expect(
      (
        await admin.query(
          "SELECT count(*)::int AS n FROM criterika.intentos_nivel WHERE jugador_id=$1 AND estado='EN_CURSO'",
          [uid(10)],
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it('el rollback elimina también la reserva de idempotencia', async () => {
    const id = identity();
    await expect(
      playerTransaction(10, async (client) => {
        await idempotency.claim(client, id, {}, new Date());
        throw new Error('Rollback controlado');
      }),
    ).rejects.toThrow('Rollback controlado');
    expect(
      (
        await admin.query(
          'SELECT count(*)::int AS n FROM criterika.controles_idempotencia',
        )
      ).rows[0].n,
    ).toBe(0);
  });

  it('expira la caché a las 24 horas conservando el alcance por recurso', async () => {
    const id = identity();
    const now = new Date();
    await playerTransaction(10, async (client) => {
      const claim = await idempotency.claim(client, id, {}, now);
      if (claim.kind !== 'NEW') throw new Error('Se esperaba intención nueva');
      await idempotency.confirm(client, claim.id, 201, { original: true });
    });
    await playerTransaction(10, async (client) => {
      expect(
        (
          await idempotency.claim(
            client,
            { ...id, ruta: '/levels/' + uid(102) + '/attempts' },
            {},
            now,
          )
        ).kind,
      ).toBe('NEW');
      expect(
        (
          await idempotency.claim(
            client,
            id,
            {},
            new Date(now.getTime() + 86_400_000),
          )
        ).kind,
      ).toBe('NEW');
    });
  });

  it('detecta corrupción de la respuesta cifrada', async () => {
    const id = identity();
    await playerTransaction(10, async (client) => {
      const claim = await idempotency.claim(client, id, {}, new Date());
      if (claim.kind !== 'NEW') throw new Error('Se esperaba intención nueva');
      await idempotency.confirm(client, claim.id, 201, { ok: true });
    });
    await admin.query(
      'UPDATE criterika.controles_idempotencia SET respuesta_cifrada=set_byte(respuesta_cifrada,29,get_byte(respuesta_cifrada,29)#1)',
    );
    await expect(
      playerTransaction(10, (client) =>
        idempotency.claim(client, id, {}, new Date()),
      ),
    ).rejects.toThrow('no recuperable');
  });

  it('una clave en proceso devuelve un resultado explícito', async () => {
    const id = identity();
    await playerTransaction(10, (client) =>
      idempotency.claim(client, id, {}, new Date()),
    );
    await playerTransaction(10, async (client) =>
      expect(await idempotency.claim(client, id, {}, new Date())).toEqual({
        kind: 'IN_PROGRESS',
      }),
    );
  });
});
