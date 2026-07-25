const POLICY_MARKER = "<!-- itakello-policy: pr-template@2 -->";

const REQUIRED_SEMANTICS = new Map([
  ["why", ["why", "problem", "purpose", "context"]],
  ["outcome", ["outcome", "what changed", "result"]],
  ["boundaries", ["boundaries", "scope", "risks and boundaries", "risk"]],
  ["proof", ["verification", "proof", "testing"]],
]);

function normalizeHeading(value) {
  return value
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function visibleText(value) {
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?(?:details|summary)>/gi, "")
    .replace(/^\s*[-*+]\s*$/gm, "")
    .trim();
}

function isPlaceholder(value) {
  const withoutListMarker = value.replace(/^\s*[-*+]\s+/gm, "").trim();
  return /^(?:n\/a|not applicable|tbd|todo)$/i.test(withoutListMarker);
}

function sections(body) {
  const matches = [...body.matchAll(/^##\s+(.+?)\s*$/gm)];

  return matches.map((match, index) => ({
    heading: normalizeHeading(match[1]),
    content: body.slice(
      match.index + match[0].length,
      matches[index + 1]?.index ?? body.length,
    ),
  }));
}

export function validatePullRequestBody(body) {
  const errors = [];

  if (!body.includes(POLICY_MARKER)) {
    errors.push(`missing policy marker ${POLICY_MARKER}`);
  }

  const parsedSections = sections(body);

  for (const section of parsedSections) {
    const content = visibleText(section.content);

    if (!content) {
      errors.push(`section "${section.heading}" is empty; remove it or add content`);
    } else if (isPlaceholder(content)) {
      errors.push(`section "${section.heading}" contains a placeholder`);
    }
  }

  for (const [meaning, aliases] of REQUIRED_SEMANTICS) {
    const section = parsedSections.find(({ heading }) => aliases.includes(heading));

    if (!section) {
      errors.push(`missing ${meaning} section`);
    } else if (!visibleText(section.content)) {
      errors.push(`${meaning} section has no narrative`);
    }
  }

  return errors;
}

function main() {
  const errors = validatePullRequestBody(process.env.PR_BODY ?? "");

  if (errors.length > 0) {
    console.error("Pull request body does not follow PR policy v2:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Pull request body follows PR policy v2.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
