/** Registre des connecteurs, indexé par mode de collecte. Extensible. */
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

export function listConnectors(): SourceConnector[] {
  return [...CONNECTORS];
}
