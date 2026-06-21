/** Registre des connecteurs, indexé par mode de collecte. Extensible. */
import type { CollectionMode } from '../../domain/types';
import type { SourceConnector } from './types';
import { manualImportConnector } from './manualImport';
import {
  savedSearchUrlConnector,
  authorizedApiConnectorStub,
} from './savedSearchUrl';

const CONNECTORS: SourceConnector[] = [
  manualImportConnector,
  savedSearchUrlConnector,
  authorizedApiConnectorStub,
];

const BY_MODE = new Map<CollectionMode, SourceConnector>(
  CONNECTORS.map(c => [c.mode, c])
);

export function getConnector(
  mode: CollectionMode
): SourceConnector | undefined {
  return BY_MODE.get(mode);
}

export function listConnectors(): SourceConnector[] {
  return [...CONNECTORS];
}
