/**
 * ABA routing number checksum. Pure and dependency-free so a client component
 * can use it; crypto.ts pulls in Node's crypto and cannot be imported in the
 * browser, which is why this is not defined there.
 */
export function validateRoutingNumber(routing: string): boolean {
  if (!/^\d{9}$/.test(routing)) return false;
  const d = routing.split('').map(Number);
  const checksum =
    (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10;
  return checksum === 0;
}
