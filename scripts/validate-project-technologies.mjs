import { readFileSync } from "node:fs";

const filePath = ".github/project-technologies.json";
const allowedKeys = new Set(["schemaVersion", "technologies"]);

let manifest;

try {
  manifest = JSON.parse(readFileSync(filePath, "utf8"));
} catch (error) {
  throw new Error(`Could not read ${filePath}: ${error.message}`);
}

if (manifest === null || Array.isArray(manifest) || typeof manifest !== "object") {
  throw new Error("Project technology manifest must be a JSON object.");
}

const unexpectedKeys = Object.keys(manifest).filter((key) => !allowedKeys.has(key));
if (unexpectedKeys.length > 0) {
  throw new Error(`Unexpected manifest fields: ${unexpectedKeys.join(", ")}.`);
}

if (manifest.schemaVersion !== 1) {
  throw new Error("schemaVersion must be 1.");
}

if (!Array.isArray(manifest.technologies) || manifest.technologies.length === 0) {
  throw new Error("technologies must be a non-empty array.");
}

const normalized = manifest.technologies.map((technology, index) => {
  if (typeof technology !== "string" || technology.trim() !== technology || technology === "") {
    throw new Error(`technologies[${index}] must be a non-empty, trimmed string.`);
  }

  return technology.toLocaleLowerCase("en-US");
});

const duplicate = normalized.find((technology, index) => normalized.indexOf(technology) !== index);
if (duplicate) {
  throw new Error(`Duplicate technology name: ${duplicate}.`);
}

console.log(`Validated ${manifest.technologies.length} curated project technologies.`);
