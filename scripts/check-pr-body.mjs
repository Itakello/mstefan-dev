const POLICY_MARKER = "<!-- itakello-policy: pr-template@3 -->";
const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u20E3]/u;

// Check source conventions only; rendered and semantic completeness are advisory.
function sourceLines(body) {
  const lines = body.replace(/<!--[^]*?(?:-->|$)/g, "").split(/\r?\n/);
  let fence = null;
  return lines.map((line) => {
    const delimiter = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (delimiter && delimiter[1][0] === fence[0] &&
          delimiter[1].length >= fence.length && !delimiter[2].trim()) fence = null;
      return "";
    }
    if (delimiter) { fence = delimiter[1]; return ""; }
    return line;
  });
}

export function validatePullRequestBody(body, title = "") {
  const errors = [];
  if (!body.includes(POLICY_MARKER)) errors.push(`missing policy marker ${POLICY_MARKER}`);
  if (EMOJI.test(title)) errors.push("pull request title contains emoji");
  const lines = sourceLines(body);
  const headings = lines.flatMap((line, index) => {
    const match = line.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/);
    return match ? [{ index, level: match[1].length, text: (match[2] ?? "").replace(/[ \t]+#+$/, "") }] : [];
  });
  for (const heading of headings) {
    if (EMOJI.test(heading.text)) errors.push("ATX heading contains emoji");
  }
  const tasks = headings.filter(({ text }) => text.trim().toLowerCase() === "task");
  const task = tasks[0];
  if (tasks.length > 1) errors.push("use only one Task section");
  if (task) {
    if (task.level !== 2) errors.push("task section must use a level-two heading");
    if (headings.some(({ index }) => index > task.index)) errors.push("task section must be last");
    if (!/https?:\/\/\S+/.test(lines.slice(task.index + 1).join("\n"))) {
      errors.push("task section must contain a link");
    }
  }
  const headingLines = new Set(headings.map(({ index }) => index));
  const narrative = lines.filter((line, index) =>
    !headingLines.has(index) && (!task || index < task.index)
  ).join("\n").trim();
  if (!narrative) errors.push("pull request narrative is empty");
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = validatePullRequestBody(process.env.PR_BODY ?? "", process.env.PR_TITLE ?? "");
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Pull request source follows PR policy v3.");
  }
}
