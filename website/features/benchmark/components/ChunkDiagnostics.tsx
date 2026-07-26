'use client';

import { formatBytes, formatDuration } from '../measurement/format';
import type { MeasuredJsChunk } from '../measurement/types';
import { PathDisclosure } from './PathDisclosure';
import styles from './ChunkDiagnostics.module.css';

function ChunkList({
  title,
  chunks
}: {
  title: string;
  chunks: MeasuredJsChunk[];
}) {
  return (
    <div className={styles.chunkList}>
      {chunks.map(chunk => (
        <div className={styles.chunk} key={chunk.path}>
          <div className={styles.resource}>
            <span className={styles.resourceLabel}>Resource</span>
            <PathDisclosure label={title} path={chunk.path} />
          </div>
          <dl className={styles.evidence}>
            <div>
              <dt>HTTP status</dt>
              <dd>
                {chunk.responseStatus === null
                  ? 'Unavailable'
                  : chunk.responseStatus}
              </dd>
            </div>
            <div>
              <dt>Decoded JS</dt>
              <dd>{formatBytes(chunk.decodedJsByteSize)}</dd>
            </div>
            <div>
              <dt>Encoded JS</dt>
              <dd>{formatBytes(chunk.encodedJsByteSize)}</dd>
            </div>
            <div>
              <dt>Load duration</dt>
              <dd>{formatDuration(chunk.loadDurationMs)}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}

export function ChunkDiagnostics({
  title,
  chunks,
  emptyText
}: {
  title: string;
  chunks: MeasuredJsChunk[];
  emptyText: string;
}) {
  return (
    <div className={styles.diagnostics}>
      <h3>{title}</h3>
      {chunks.length === 0 ? (
        <p>{emptyText}</p>
      ) : (
        <ChunkList chunks={chunks} title={title} />
      )}
    </div>
  );
}
