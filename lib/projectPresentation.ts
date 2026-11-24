export function isGitHubRepositoryUrl(url: string | undefined) {
  return /^https?:\/\/github\.com\//i.test(url ?? "");
}
