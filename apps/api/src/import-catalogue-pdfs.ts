import path from "node:path";
import { connectToDatabase, importCataloguePdfs } from "@onepws/core";

function getArgValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const dirArg = getArgValue("dir");
  const ocrArg = getArgValue("ocrMarkdown");

  const directory = path.resolve(
    dirArg ?? path.join(process.cwd(), "..", "..", "data", "all catalogue")
  );
  const ocrMarkdownPath = path.resolve(
    ocrArg ?? path.join(process.cwd(), "..", "..", "onepws_master_ai_knowledge_base_updated.md")
  );

  await connectToDatabase();
  const result = await importCataloguePdfs({ directory, ocrMarkdownPath });

  console.log(`Catalogue directory: ${directory}`);
  console.log(`OCR markdown: ${ocrMarkdownPath}`);
  console.log(`Imported ${result.chunksImported} chunks from ${result.filesProcessed} PDF(s).\n`);

  for (const file of result.files) {
    const detail = file.skipped
      ? `SKIPPED — ${file.skipped}`
      : `${file.chunks} chunk(s) | native ${file.nativeTextLength} chars | OCR ${file.ocrTextLength} chars`;
    console.log(`- ${file.fileName}: ${detail}`);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
