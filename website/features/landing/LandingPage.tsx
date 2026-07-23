import { BenchmarkPreview } from './components/BenchmarkPreview';
import { FrameworkTargets } from './components/FrameworkTargets';
import { Hero } from './components/Hero';
import { ScorePath } from './components/ScorePath';
import { WhyBoundaries } from './components/WhyBoundaries';

import styles from './LandingPage.module.css';

export function LandingPage() {
  return (
    <main className={styles.main}>
      <Hero />
      <BenchmarkPreview />
      <WhyBoundaries />
      <ScorePath />
      <FrameworkTargets />
    </main>
  );
}
