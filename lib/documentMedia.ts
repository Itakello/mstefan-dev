export function documentMediaUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid document URL");
  const parts = url.pathname.split("/");
  if (url.hostname === "github.com" && parts[3] === "blob" && parts.length >= 6) {
    url.hostname = "raw.githubusercontent.com";
    url.pathname = `/${parts.slice(1, 3).concat(parts.slice(4)).join("/")}`;
    url.search = "";
    url.hash = "";
  }
  return url.toString();
}
