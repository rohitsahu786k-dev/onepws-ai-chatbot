import { connectToDatabase, importMarkdownKnowledgeBase } from "@onepws/core";

function getArgValues(name: string) {
  const prefix = `--${name}=`;
  return process.argv.filter((arg) => arg.startsWith(prefix)).map((arg) => arg.slice(prefix.length));
}

async function main() {
  const files = getArgValues("file");
  if (files.length === 0) {
    throw new Error('No knowledge-base files provided. Use --file="C:\\path\\to\\knowledge-base.md"');
  }

  await connectToDatabase();
  const result = await importMarkdownKnowledgeBase({ files });

  console.log(
    [
      `Processed ${result.filesProcessed} file(s).`,
      `Parsed ${result.entriesParsed} Q&A entries.`,
      `Removed ${result.duplicatesRemoved} duplicate question(s).`,
      `Imported ${result.entriesImported} active knowledge-base entries.`,
    ].join(" ")
  );

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
