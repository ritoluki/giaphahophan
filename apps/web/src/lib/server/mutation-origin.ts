/** The public origin is deployment configuration, never a forwarded client header. */
export function isAllowedMutationOrigin(origin: string | null, appUrl: string | undefined): boolean {
  if (!origin || !appUrl) return false;
  try {
    const configured = new URL(appUrl);
    if (!['http:', 'https:'].includes(configured.protocol) || configured.username || configured.password) return false;
    return origin === configured.origin;
  } catch { return false; }
}
