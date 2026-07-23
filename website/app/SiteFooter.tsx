import { BLOG_URL, GITHUB_URL, LINKEDIN_URL } from '../lib/site/config';
import styles from './SiteFooter.module.css';

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.primary}>
          <div className={styles.brand}>
            <span aria-hidden="true" className={styles.brandMark}>
              <svg viewBox="0 0 24 24">
                <rect width="24" height="24" rx="5.25" />
                <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5Z" />
                <path d="m16 8-14 14M17.5 15H9" />
              </svg>
            </span>
            <div>
              <strong>Next Slug Splitter</strong>
              <p>Build-time route splitting for Next.js.</p>
            </div>
          </div>

          <nav aria-label="Footer" className={styles.links}>
            <a href={BLOG_URL} rel="noreferrer" target="_blank">
              <svg
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
              >
                <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5Z" />
                <path d="M4 5.5v12M8 7h8M8 11h8M8 15h5" />
              </svg>
              Blog
            </a>
            <a href={GITHUB_URL} rel="noreferrer" target="_blank">
              <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.25c-5.38 0-9.75 4.37-9.75 9.75 0 4.3 2.79 7.95 6.66 9.24.49.09.67-.21.67-.47v-1.82c-2.71.59-3.29-1.16-3.29-1.16-.44-1.13-1.08-1.43-1.08-1.43-.89-.61.07-.6.07-.6.98.07 1.5 1.01 1.5 1.01.87 1.49 2.28 1.06 2.84.81.09-.63.34-1.06.62-1.31-2.16-.25-4.44-1.08-4.44-4.82 0-1.06.38-1.93 1.01-2.61-.1-.25-.44-1.24.1-2.58 0 0 .82-.26 2.68 1a9.29 9.29 0 0 1 4.88 0c1.86-1.26 2.68-1 2.68-1 .54 1.34.2 2.33.1 2.58.63.68 1.01 1.55 1.01 2.61 0 3.75-2.28 4.57-4.45 4.82.35.3.66.9.66 1.81v2.69c0 .26.18.57.67.47A9.76 9.76 0 0 0 21.75 12c0-5.38-4.37-9.75-9.75-9.75Z" />
              </svg>
              GitHub
            </a>
            <a href={LINKEDIN_URL} rel="noreferrer" target="_blank">
              <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
                <path d="M0 1.146C0 .513.526 0 1.175 0h21.65C23.474 0 24 .513 24 1.146v21.708C24 23.487 23.474 24 22.825 24H1.175C.526 24 0 23.487 0 22.854V1.146Zm7.278 19.2V9.169H3.565v11.177h3.713ZM5.422 7.64a2.152 2.152 0 1 0 0-4.304 2.152 2.152 0 0 0 0 4.304Zm7.306 12.706V14.11c0-1.643.31-3.233 2.348-3.233 2.01 0 2.034 1.881 2.034 3.337v6.132h3.713v-6.915c0-3.395-.731-6.002-4.692-6.002-1.902 0-3.177 1.045-3.7 2.036h-.05V7.74H8.82v12.606h3.908Z" />
              </svg>
              LinkedIn
            </a>
          </nav>
        </div>

        <div className={styles.meta}>
          <span>A Project Millipede project</span>
          <span>Open source · Next.js 16.2+</span>
        </div>
      </div>
    </footer>
  );
}
