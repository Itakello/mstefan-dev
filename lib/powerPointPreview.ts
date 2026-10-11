export function presentationPreviewUrl(value: string): string | null {
  try {
    const url = new URL(value, "https://www.mstefan.dev");
    if (!["https://www.mstefan.dev", "https://mstefan.dev"].includes(url.origin)
      || url.username || url.password || url.search || url.hash
      || !/^\/presentations\/[a-z0-9-]+\/index\.html$/.test(url.pathname)) return null;
    return url.pathname;
  } catch { return null; }
}
