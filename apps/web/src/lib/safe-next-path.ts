const allowedPaths = new Set([
  "/dang-nhap",
  "/gia-pha",
  "/tra-cuu",
  "/quan-he",
  "/lich-ho",
  "/tu-lieu",
  "/them",
  "/thiet-lap-mfa",
  "/quan-tri",
  "/quan-tri/thanh-vien",
  "/quen-mat-khau"
]);

export function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/gia-pha";

  try {
    const parsed = new URL(value, "http://local.invalid");
    const allowed = allowedPaths.has(parsed.pathname) || parsed.pathname.startsWith("/loi-moi/");
    return allowed ? parsed.pathname + parsed.search : "/gia-pha";
  } catch {
    return "/gia-pha";
  }
}