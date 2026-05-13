import fs from "node:fs/promises";
import path from "node:path";
import { generateMarkdownKnowledgeBaseMarkdown } from "@onepws/core";

function getArgValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const outArg = getArgValue("out");
  const maxPages = Number(getArgValue("maxPagesPerSite") ?? 90);
  const resolvedOut = path.resolve(outArg ?? path.join(process.cwd(), "data", "onepws_full_chatbot_knowledge_base.md"));

  const { markdown, stats } = await generateMarkdownKnowledgeBaseMarkdown({
    maxPagesPerSite: Number.isFinite(maxPages) ? maxPages : 90,
  });

  await fs.mkdir(path.dirname(resolvedOut), { recursive: true });
  await fs.writeFile(resolvedOut, markdown, "utf8");

  console.log(
    [
      `Wrote ${resolvedOut}`,
      `${stats.totalEntries} Q&A entries from ${stats.pagesTotal} pages.`,
      JSON.stringify(stats.pagesPerSite),
    ].join("\n")
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
