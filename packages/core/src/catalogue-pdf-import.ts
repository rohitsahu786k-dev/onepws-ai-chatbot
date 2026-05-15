import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { KnowledgeBaseDocumentModel } from "./models";

const catalogueSourcePrefix = "kb://onepws/catalogue-pdf/";
const defaultChunkSize = 1200;
const defaultOverlap = 180;
const minUsefulTextLength = 120;

const catalogueDisplayNames: Record<string, string> = {
  "admin-catalog-compressed": "Corporate Interior / Admin Solutions Catalog",
  "atc-catalog-compressed": "ATC Consoles Catalog",
  "auditorium-catalog-compressed": "Auditorium Solutions Catalog",
  "ccr-catalog-compressed": "Control Room Solutions Catalog",
  "cd-catalog": "Control Desk Solutions Catalog",
  "defense-consoles-catalog-compressed": "Defense Consoles Catalog",
  "fitout-catalog-compressed": "Architectural / Fit-Out Solutions Catalog",
  "mot-catalog-v1_1": "Modular Operation Theatre Catalog",
  "xlat-se_compressed": "XLAT SE Product Catalog",
  "xlat_compressed": "XLAT Product Catalog",
};

export type CataloguePdfImportOptions = {
  directory: string;
  /** Optional master KB markdown with `## Appendix: New Catalog OCR Source Notes` */
  ocrMarkdownPath?: string;
  chunkSize?: number;
  overlap?: number;
};

export type CataloguePdfImportResult = {
  filesProcessed: number;
  chunksImported: number;
  files: Array<{
    fileName: string;
    slug: string;
    displayName: string;
    nativeTextLength: number;
    ocrTextLength: number;
    chunks: number;
    skipped?: string;
  }>;
};

function chunkText(text: string, chunkSize: number, overlap: number) {
  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const end = Math.min(text.length, cursor + chunkSize);
    const chunk = text.slice(cursor, end).trim();
    if (chunk.length >= 80) chunks.push(chunk);
    if (end === text.length) break;
    cursor = Math.max(0, end - overlap);
  }

  return chunks;
}

function normalizeCatalogueText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, "\n")
    .trim();
}

function pdfSlug(fileName: string) {
  return fileName
    .replace(/\.pdf$/i, "")
    .replace(/['']/g, "")
    .trim();
}

function hashCatalogueChunk(slug: string, chunkIndex: number, content: string) {
  return crypto.createHash("sha256").update(`${slug}:${chunkIndex}:${content}`).digest("hex");
}

async function extractPdfText(filePath: string) {
  const { PDFParse } = await import("pdf-parse");
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: buffer });
  const parsed = await parser.getText();
  await parser.destroy();
  return normalizeCatalogueText(parsed.text ?? "");
}

export function parseCatalogueOcrAppendix(markdown: string) {
  const sections = new Map<string, string>();
  const appendixStart = markdown.indexOf("## Appendix:");
  if (appendixStart < 0) return sections;

  const appendix = markdown.slice(appendixStart);
  const re = /^### ([a-z0-9_-]+)\s*\n\n```text\n([\s\S]*?)```/gim;
  let match: RegExpExecArray | null;
  while ((match = re.exec(appendix))) {
    sections.set(match[1].toLowerCase(), normalizeCatalogueText(match[2]));
  }
  return sections;
}

function resolveOcrText(slug: string, ocrSections: Map<string, string>) {
  if (ocrSections.has(slug)) return ocrSections.get(slug) ?? "";
  const normalized = slug.replace(/_/g, "-");
  if (ocrSections.has(normalized)) return ocrSections.get(normalized) ?? "";

  for (const [key, value] of ocrSections) {
    if (slug.includes(key) || key.includes(slug)) return value;
  }
  return "";
}

function buildCatalogueDocumentText(displayName: string, nativeText: string, ocrText: string) {
  const parts = [
    `Catalogue: ${displayName}`,
    `Brand: OnePWS`,
    `Source type: Product catalogue PDF`,
  ];

  if (nativeText.length >= minUsefulTextLength) {
    parts.push("", "Extracted PDF text:", nativeText);
  }

  if (ocrText.length >= minUsefulTextLength) {
    parts.push("", "Catalogue OCR reference text:", ocrText);
  }

  return normalizeCatalogueText(parts.join("\n"));
}

export async function importCataloguePdfs(options: CataloguePdfImportOptions): Promise<CataloguePdfImportResult> {
  const directory = path.resolve(options.directory);
  const chunkSize = options.chunkSize ?? defaultChunkSize;
  const overlap = options.overlap ?? defaultOverlap;
  const capturedAt = new Date();

  let ocrSections = new Map<string, string>();
  if (options.ocrMarkdownPath) {
    const markdown = await fs.readFile(path.resolve(options.ocrMarkdownPath), "utf8");
    ocrSections = parseCatalogueOcrAppendix(markdown);
  }

  const entries = await fs.readdir(directory);
  const pdfFiles = entries.filter((name) => /\.pdf$/i.test(name)).sort();

  await KnowledgeBaseDocumentModel.deleteMany({ "metadata.sourceType": "catalogue_pdf" });

  const result: CataloguePdfImportResult = {
    filesProcessed: 0,
    chunksImported: 0,
    files: [],
  };

  let globalChunkIndex = 0;

  for (const fileName of pdfFiles) {
    const slug = pdfSlug(fileName);
    const displayName = catalogueDisplayNames[slug] ?? `${slug.replace(/-/g, " ")} catalogue`;
    const filePath = path.join(directory, fileName);

    const nativeText = await extractPdfText(filePath);
    const ocrText = resolveOcrText(slug, ocrSections);
    const combined = buildCatalogueDocumentText(displayName, nativeText, ocrText);

    const fileReport = {
      fileName,
      slug,
      displayName,
      nativeTextLength: nativeText.length,
      ocrTextLength: ocrText.length,
      chunks: 0,
    };

    let documentText = combined;
    if (documentText.length < minUsefulTextLength) {
      documentText = normalizeCatalogueText(
        [
          `Catalogue: ${displayName}`,
          `Brand: OnePWS`,
          `Source file: ${fileName}`,
          `This product catalogue PDF is primarily image-based with limited machine-readable text.`,
          `Use OnePWS knowledge for specifications, features, certifications, applications, and project guidance related to ${displayName}.`,
        ].join("\n")
      );
    }

    const chunks = chunkText(documentText, chunkSize, overlap);
    for (const [chunkIndex, content] of chunks.entries()) {
      const contentHash = hashCatalogueChunk(slug, chunkIndex, content);
      const sourceUrl = `${catalogueSourcePrefix}${slug}#chunk-${chunkIndex}`;

      await KnowledgeBaseDocumentModel.updateOne(
        { contentHash },
        {
          $set: {
            sourceUrl,
            title: `${displayName} — section ${chunkIndex + 1}`,
            chunkIndex: globalChunkIndex,
            content,
            contentHash,
            capturedAt,
            isActive: true,
            metadata: {
              sourceType: "catalogue_pdf",
              catalogueSlug: slug,
              catalogueFile: fileName,
              displayName,
              localChunkIndex: chunkIndex,
              nativeTextLength: nativeText.length,
              ocrTextLength: ocrText.length,
            },
          },
        },
        { upsert: true }
      );
      globalChunkIndex += 1;
      fileReport.chunks += 1;
    }

    result.filesProcessed += 1;
    result.chunksImported += fileReport.chunks;
    result.files.push(fileReport);
  }

  return result;
}
