'use client';

import { formatBytes, formatDuration } from '../measurement/format';
import type { MeasuredJsChunk } from '../measurement/types';
import styles from './ChunkDiagnostics.module.css';

function ChunkList({ chunks }: { chunks: MeasuredJsChunk[] }) {
  return (
    <div className={styles.chunkList}>
      {chunks.map(chunk => (
        <div className={styles.chunkRow} key={chunk.path}>
          <code>{chunk.path}</code>
          <span>
            {chunk.responseStatus === null
              ? 'HTTP status unavailable'
              : `HTTP ${chunk.responseStatus}`}
          </span>
          <span>{formatBytes(chunk.decodedJsByteSize)} decoded JS</span>
          <span>{formatBytes(chunk.encodedJsByteSize)} encoded JS</span>
          <span>{formatDuration(chunk.loadDurationMs)} load duration</span>
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
      {chunks.length === 0 ? <p>{emptyText}</p> : <ChunkList chunks={chunks} />}
    </div>
  );
}
