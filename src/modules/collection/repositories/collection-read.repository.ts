import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { boundedLimit } from '../../../database/persistence-checks.js';
import { PersistenceInvariantError } from '../../../database/persistence-values.js';
import {
  CARD_FIELDS,
  CARD_SOURCE,
  projectCard,
  type CardRow,
} from './collection-card.reader.js';
@Injectable()
export class PostgresCollectionReadRepository {
  async getOwned(tx: PoolClient, playerId: string, id: string) {
    const { rows } = await tx.query<CardRow>(
      `SELECT ${CARD_FIELDS} ${CARD_SOURCE} AND c.id=$2`,
      [playerId, id],
    );
    return rows[0] ? projectCard(rows[0]) : null;
  }
  async listOwned(
    tx: PoolClient,
    playerId: string,
    limit = 20,
    after?: { cardId: string },
  ) {
    boundedLimit(limit);
    if (after && !(await this.getOwned(tx, playerId, after.cardId)))
      throw new PersistenceInvariantError('Posición de colección inválida.');
    const { rows } = await tx.query<CardRow>(
      `SELECT ${CARD_FIELDS} ${CARD_SOURCE} AND ($2::uuid IS NULL OR c.id>$2::uuid) ORDER BY c.id LIMIT $3`,
      [playerId, after?.cardId ?? null, limit + 1],
    );
    const items = rows.slice(0, limit).map(projectCard);
    return {
      items,
      nextPosition:
        rows.length > limit ? { cardId: items[items.length - 1].id } : null,
    };
  }
}
