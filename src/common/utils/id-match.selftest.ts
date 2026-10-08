import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { idMatchPlugin } from './id-match.plugin';

/** `ID_MATCH_PLUGIN=off` disables the B0 plugin (diagnostics / before-after comparison only). Default: ON. */
export const idMatchEnabled = () => String(process.env.ID_MATCH_PLUGIN || 'on').toLowerCase() !== 'off';

/** connectionFactory for MongooseModule.forRoot: registers the plugin before any model is compiled. */
export function idMatchConnectionFactory(connection: Connection): Connection {
  if (idMatchEnabled()) connection.plugin(idMatchPlugin as any);
  return connection;
}

/**
 * Counts id-like paths that compiled to Mixed (B0). @nestjs/mongoose turns `type: Types.ObjectId` into `type: {}` so the
 * original declaration is gone; a Mixed path counts as an id path when it has a `ref` or its name ends in Id / Ids.
 */
export function countMixedIdPaths(models: Record<string, { schema: any }>): { models: number; mixedIdPaths: number } {
  let mixedIdPaths = 0;
  const names = Object.keys(models);
  for (const n of names) {
    models[n].schema.eachPath((p: string, t: any) => {
      if (t?.instance === 'Mixed' && (t?.options?.ref || /Ids?$/.test(p))) mixedIdPaths++;
    });
  }
  return { models: names.length, mixedIdPaths };
}

/** Logs once at startup (no secrets): plugin state and the number of Mixed-typed id paths. */
@Injectable()
export class IdMatchSelfTest implements OnApplicationBootstrap {
  private readonly log = new Logger('IdMatch');
  constructor(@InjectConnection() private readonly connection: Connection) {}
  onApplicationBootstrap() {
    try {
      const { models, mixedIdPaths } = countMixedIdPaths(this.connection.models as any);
      this.log.log(
        `B0 id-match plugin ${idMatchEnabled() ? 'ENABLED' : 'DISABLED (ID_MATCH_PLUGIN=off)'}; ` +
        `${mixedIdPaths} Mixed-typed id paths across ${models} models` +
        (idMatchEnabled() ? ' (queries on them match string AND ObjectId)' : ' (queries on them match ONE representation only)'),
      );
    } catch (e: any) {
      this.log.warn(`self-test failed: ${e?.message}`);
    }
  }
}
