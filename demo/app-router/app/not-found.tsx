/**
 * App Router not-found boundary.
 *
 * This demo intentionally stays with a plain App Router not-found boundary.
 * It does not apply the page-router demo's dev-only transient 404 retry
 * workaround because that helper is coupled to the Pages Router data
 * transport.
 */

export default function NotFound() {
  return (
    <>
      <h1>Page Not Found</h1>
    </>
  );
}
