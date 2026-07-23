'use client';

import Link from 'next/link';

import { QUICK_START_PATH } from '../../../lib/site/config';
import styles from './Hero.module.css';

export function Hero() {
  return (
    <section className={styles.hero}>
      <div className={styles.content}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Build-time route splitting for Next.js</p>
          <h1>Catch-all routing without catch-all bundles.</h1>
          <p className={styles.lede}>
            Catch-all routes put many pages behind one module. The bundler
            follows every reachable import, so the route chunk can grow with the
            accumulated component graph. Splitter analyzes page needs at build
            time and gives Next.js page-specific bundle boundaries.
            <strong> Light pages stay light. Heavy pages pay their own cost.</strong>
          </p>
          <div className={styles.actions}>
            <Link className={styles.primaryAction} href="/benchmark">
              Run the benchmark
            </Link>
            <Link className={styles.secondaryAction} href={QUICK_START_PATH}>
              How to use
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
