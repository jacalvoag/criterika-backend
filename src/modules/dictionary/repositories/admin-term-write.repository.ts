import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { requireAdministrativeRead } from '../../../database/administrative-read.js';
import { termInput, termVersion, type TermDraft } from './admin-term.input.js';
import { loadAdminTerm } from './admin-term-read.repository.js';
@Injectable()
export class PostgresAdminTermWriteRepository {
  async create(tx: PoolClient, value: TermDraft) {
    const input = termInput(value);
    await requireAdministrativeRead(tx);
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO criterika.terminos(nombre_borrador,categoria_borrador,definicion_borrador,ejemplo_borrador,fuente_borrador)
   VALUES($1,$2,$3,$4,$5) RETURNING id`,
      [
        input.nombre,
        input.categoria,
        input.definicion,
        input.ejemplo,
        input.fuenteUrl ?? null,
      ],
    );
    return loadAdminTerm(tx, rows[0].id);
  }
  private async locked(tx: PoolClient, id: string, version: bigint) {
    termVersion(version);
    await requireAdministrativeRead(tx);
    await tx.query('SELECT id FROM criterika.terminos WHERE id=$1 FOR UPDATE', [
      id,
    ]);
    const term = await loadAdminTerm(tx, id);
    return !term
      ? ({ kind: 'not_found' } as const)
      : term.version !== version
        ? ({ kind: 'version_conflict' } as const)
        : ({ kind: 'locked', term } as const);
  }
  async patch(
    tx: PoolClient,
    id: string,
    version: bigint,
    value: Partial<TermDraft>,
  ) {
    const input = termInput(value, true),
      current = await this.locked(tx, id, version);
    if (current.kind !== 'locked') return current;
    await tx.query(
      `UPDATE criterika.terminos SET nombre_borrador=COALESCE($2,nombre_borrador),categoria_borrador=COALESCE($3,categoria_borrador),
   definicion_borrador=COALESCE($4,definicion_borrador),ejemplo_borrador=COALESCE($5,ejemplo_borrador),
   fuente_borrador=CASE WHEN $6 THEN $7 ELSE fuente_borrador END,version=version+1 WHERE id=$1`,
      [
        id,
        input.nombre ?? null,
        input.categoria ?? null,
        input.definicion ?? null,
        input.ejemplo ?? null,
        Object.hasOwn(input, 'fuenteUrl'),
        input.fuenteUrl ?? null,
      ],
    );
    return { kind: 'saved', term: (await loadAdminTerm(tx, id))! } as const;
  }
  async publish(tx: PoolClient, id: string, version: bigint) {
    const current = await this.locked(tx, id, version);
    if (current.kind !== 'locked') return current;
    termInput({
      nombre: current.term.nombre,
      categoria: current.term.categoria,
      definicion: current.term.definicion,
      ejemplo: current.term.ejemplo,
      fuenteUrl: current.term.fuenteUrl,
    });
    await tx.query(
      `UPDATE criterika.terminos SET nombre_publicado=nombre_borrador,categoria_publicada=categoria_borrador,definicion_publicada=definicion_borrador,
   ejemplo_publicado=ejemplo_borrador,fuente_publicada=fuente_borrador,estado=CASE WHEN estado='BORRADOR' THEN 'PUBLICADO' ELSE estado END,version=version+1 WHERE id=$1`,
      [id],
    );
    return { kind: 'saved', term: (await loadAdminTerm(tx, id))! } as const;
  }
  async setEnabled(
    tx: PoolClient,
    id: string,
    version: bigint,
    enabled: boolean,
  ) {
    const current = await this.locked(tx, id, version);
    if (current.kind !== 'locked') return current;
    if (typeof enabled !== 'boolean' || current.term.estado === 'BORRADOR')
      return { kind: 'state_conflict' } as const;
    await tx.query(
      'UPDATE criterika.terminos SET estado=$2,version=version+1 WHERE id=$1',
      [id, enabled ? 'PUBLICADO' : 'DESHABILITADO'],
    );
    return { kind: 'saved', term: (await loadAdminTerm(tx, id))! } as const;
  }
  async remove(tx: PoolClient, id: string, version: bigint) {
    const current = await this.locked(tx, id, version);
    if (current.kind !== 'locked') return current;
    const used = await tx.query<{ used: boolean }>(
      `SELECT nombre_publicado IS NOT NULL OR EXISTS(SELECT 1 FROM criterika.nivel_terminos_borrador WHERE termino_id=$1)
   OR EXISTS(SELECT 1 FROM criterika.revision_terminos WHERE termino_id=$1) OR EXISTS(SELECT 1 FROM criterika.terminos_intento WHERE termino_id=$1)
   OR EXISTS(SELECT 1 FROM criterika.terminos_desbloqueados WHERE termino_id=$1) AS used FROM criterika.terminos WHERE id=$1`,
      [id],
    );
    if (used.rows[0].used) return { kind: 'in_use' } as const;
    await tx.query('DELETE FROM criterika.terminos WHERE id=$1', [id]);
    return { kind: 'deleted' } as const;
  }
}
