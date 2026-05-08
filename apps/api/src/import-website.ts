import { env } from "@onepws/config";
import { connectToDatabase, importWebsiteKnowledgeBase } from "@onepws/core";

function getArgValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  await connectToDatabase();
  const result = await importWebsiteKnowledgeBase({
    startUrl: getArgValue("url") ?? env.ONEPWS_DOMAIN,
    maxPages: Number(getArgValue("maxPages") ?? 80),
  });

  console.log(
    `Imported ${result.chunksCaptured} knowledge chunks from ${result.pagesCaptured} pages (${result.pagesVisited} URLs visited) starting at ${result.startUrl}`
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
