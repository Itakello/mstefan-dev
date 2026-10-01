export function documentMediaUrl(value: string, origin?: string): string {
  const url = new URL(value, origin);
  const localDocument = origin && url.origin === new URL(origin).origin && url.pathname.startsWith("/api/documents/file/");
  if ((url.protocol !== "https:" && !localDocument) || url.username || url.password) throw new Error("Invalid document URL");
  const parts = url.pathname.split("/");
  if (url.hostname === "github.com" && parts[3] === "blob" && parts.length >= 6) {
    url.hostname = "raw.githubusercontent.com";
    url.pathname = `/${parts.slice(1, 3).concat(parts.slice(4)).join("/")}`;
    url.search = "";
    url.hash = "";
  }
  return url.toString();
}
