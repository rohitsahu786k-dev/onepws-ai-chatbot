import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@onepws/config";
import { KnowledgeBaseDocumentModel } from "./models";
import { fetchHtmlPage, normalizeUrl, sameHost } from "./website-crawl";

type ImportOptions = {
  startUrl?: string;
  maxPages?: number;
  chunkSize?: number;
  overlap?: number;
};

type KnowledgeSnippet = {
  title: string;
  sourceUrl: string;
  content: string;
};

type MarkdownImportOptions = {
  files: string[];
  sourcePrefix?: string;
};

type KnowledgeEntry = {
  id?: string;
  brand?: string;
  category?: string;
  question: string;
  answer: string;
  source?: string;
  sourceUrl?: string;
  sourceFile: string;
};

const defaultMaxPages = 80;
const defaultChunkSize = 1200;
const defaultOverlap = 180;
const defaultManualSourcePrefix = "kb://onepws/manual/";

function decodeBasicEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeMarkdownText(value: string) {
  return decodeBasicEntities(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripMarkdownInline(value: string) {
  return normalizeMarkdownText(value.replace(/^\*\*|\*\*$/g, "").replace(/^#+\s*/, "")).replace(/\s+/g, " ");
}

function normalizeQuestionKey(question: string) {
  return question
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function questionKeysForEntry(entry: KnowledgeEntry) {
  const keys = new Set([normalizeQuestionKey(entry.question)]);
  const text = [entry.brand, entry.question, entry.answer].filter(Boolean).join(" ");

  if (/workspace metal solutions|wmspl/i.test(text)) {
    keys.add(normalizeQuestionKey(entry.question.replace(/workspace metal solutions pvt\.?\s*ltd\.?/gi, "WMSPL").replace(/\(WMSPL\)/gi, "")));
    if (/^what is workspace metal solutions pvt\.?\s*ltd\.?/i.test(entry.question)) keys.add(normalizeQuestionKey("What is WMSPL?"));
  }

  return Array.from(keys).filter(Boolean);
}

function sourceFileSlug(filePath: string) {
  return path
    .basename(filePath)
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function entryAnchor(entry: KnowledgeEntry) {
  return (entry.id ?? entry.question)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function hashManualEntry(entry: KnowledgeEntry) {
  return crypto
    .createHash("sha256")
    .update([entry.brand, entry.category, entry.question, entry.answer, entry.sourceUrl].filter(Boolean).join("\n"))
    .digest("hex");
}

function formatKnowledgeEntry(entry: KnowledgeEntry) {
  return [
    entry.brand ? `Brand: ${entry.brand}` : "",
    entry.category ? `Category: ${entry.category}` : "",
    `Question: ${entry.question}`,
    `Answer: ${entry.answer}`,
    entry.source ? `Source: ${entry.source}` : "",
    entry.sourceUrl ? `Source URL: ${entry.sourceUrl}` : "",
    `Imported from: ${path.basename(entry.sourceFile)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function extractSourceUrl(value: string) {
  return value.match(/https?:\/\/[^\s)]+/i)?.[0]?.replace(/[.,;]+$/, "");
}

function parseSimpleQaMarkdown(markdown: string, sourceFile: string) {
  const entries: KnowledgeEntry[] = [];
  const lines = normalizeMarkdownText(markdown).split("\n");
  let current: KnowledgeEntry | null = null;
  let answerLines: string[] = [];
  let answerStarted = false;

  const pushCurrent = () => {
    if (!current) return;
    const answer = normalizeMarkdownText(answerLines.join("\n"));
    if (current.question && answer) {
      entries.push({ ...current, answer });
    }
    current = null;
    answerLines = [];
    answerStarted = false;
  };

  for (const line of lines) {
    const qMatch = line.match(/^\*\*Q(\d+)?\s*:\s*(.+?)\*\*\s*$/i);
    if (qMatch) {
      pushCurrent();
      current = {
        id: qMatch[1] ? `Q${qMatch[1]}` : undefined,
        question: stripMarkdownInline(qMatch[2]),
        answer: "",
        sourceFile,
      };
      continue;
    }

    if (!current) continue;

    const trimmed = line.trim();
    if (answerStarted && (/^-{3,}$/.test(trimmed) || /^#{1,6}\s+/.test(trimmed) || /^\*\[/.test(trimmed))) {
      pushCurrent();
      continue;
    }

    const aMatch = line.match(/^A\s*:\s*(.*)$/i);
    if (aMatch) {
      answerStarted = true;
      answerLines.push(aMatch[1]);
      continue;
    }

    if (answerStarted) answerLines.push(line);
  }

  pushCurrent();
  return entries;
}

function parseKbMarkdown(markdown: string, sourceFile: string) {
  const entries: KnowledgeEntry[] = [];
  const lines = normalizeMarkdownText(markdown).split("\n");
  let brand: string | undefined;
  let current: KnowledgeEntry | null = null;
  let answerLines: string[] = [];
  let inAnswer = false;

  const knownBrandHeadings = new Set(["OnePWS", "PWS Floor", "Workspace Metal Solutions Pvt. Ltd. (WMSPL)", "All Brands"]);

  const pushCurrent = () => {
    if (!current) return;
    const answer = normalizeMarkdownText(answerLines.join("\n"));
    if (current.question && answer) {
      entries.push({ ...current, answer });
    }
    current = null;
    answerLines = [];
    inAnswer = false;
  };

  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+?)\s*$/);
    if (h1Match && knownBrandHeadings.has(h1Match[1])) {
      brand = h1Match[1];
      continue;
    }

    const kbMatch = line.match(/^###\s+(KB\d+)\.\s+(.+?)\s*$/i);
    if (kbMatch) {
      pushCurrent();
      current = {
        id: kbMatch[1],
        brand,
        question: stripMarkdownInline(kbMatch[2]),
        answer: "",
        sourceFile,
      };
      continue;
    }

    if (!current) continue;

    const categoryMatch = line.match(/^\*\*Category:\*\*\s*(.+?)\s*$/i);
    if (categoryMatch) {
      current.category = stripMarkdownInline(categoryMatch[1]);
      continue;
    }

    const answerMatch = line.match(/^\*\*Answer:\*\*\s*(.*)$/i);
    if (answerMatch) {
      inAnswer = true;
      answerLines.push(answerMatch[1]);
      continue;
    }

    const sourceMatch = line.match(/^\*\*Source:\*\*\s*(.+?)\s*$/i);
    if (sourceMatch) {
      inAnswer = false;
      current.source = stripMarkdownInline(sourceMatch[1]);
      current.sourceUrl = extractSourceUrl(current.source);
      continue;
    }

    if (/^-{3,}$/.test(line.trim())) {
      pushCurrent();
      continue;
    }

    if (inAnswer) answerLines.push(line);
  }

  pushCurrent();
  return entries;
}

function parseMarkdownKnowledgeBase(markdown: string, sourceFile: string) {
  return [...parseKbMarkdown(markdown, sourceFile), ...parseSimpleQaMarkdown(markdown, sourceFile)];
}

function dedupeEntries(entries: KnowledgeEntry[]) {
  const deduped = new Map<string, KnowledgeEntry>();

  for (const entry of entries) {
    const questionKey = normalizeQuestionKey(entry.question);
    const contentKey = normalizeQuestionKey(`${entry.question} ${entry.answer}`);
    const key = questionKey || contentKey;
    if (!key) continue;

    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, entry);
      continue;
    }

    const existingScore = existing.answer.length + (existing.sourceUrl ? 500 : 0) + (existing.category ? 100 : 0);
    const entryScore = entry.answer.length + (entry.sourceUrl ? 500 : 0) + (entry.category ? 100 : 0);
    if (entryScore > existingScore) deduped.set(key, entry);
  }

  return Array.from(deduped.values());
}

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

function hashContent(sourceUrl: string, chunkIndex: number, content: string) {
  return crypto.createHash("sha256").update(`${sourceUrl}:${chunkIndex}:${content}`).digest("hex");
}

function hostSourceQuery(host: string) {
  const escapedHost = host.replace(/^www\./, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    sourceUrl: {
      $regex: `^https?://(www\\.)?${escapedHost}(?:[/:]|$)`,
      $options: "i",
    },
  };
}

export async function importWebsiteKnowledgeBase(options: ImportOptions = {}) {
  const startUrl = normalizeUrl(options.startUrl ?? env.ONEPWS_DOMAIN);
  if (!startUrl) throw new Error("Invalid OnePWS website URL");

  const rootHost = new URL(startUrl).hostname;
  const maxPages = options.maxPages ?? defaultMaxPages;
  const chunkSize = options.chunkSize ?? defaultChunkSize;
  const overlap = options.overlap ?? defaultOverlap;
  const queue = [startUrl];
  const visited = new Set<string>();
  const capturedAt = new Date();
  let pageCount = 0;
  let chunkCount = 0;
  const sourceQuery = {
    ...hostSourceQuery(rootHost),
    $or: [{ "metadata.sourceType": "website" }, { "metadata.sourceType": { $exists: false } }],
  };

  await KnowledgeBaseDocumentModel.updateMany(sourceQuery, { $set: { isActive: false } });

  while (queue.length > 0 && visited.size < maxPages) {
    const nextUrl = queue.shift();
    if (!nextUrl || visited.has(nextUrl)) continue;
    visited.add(nextUrl);

    const page = await fetchHtmlPage(nextUrl, rootHost);
    if (!page) continue;
    pageCount += 1;

    for (const link of page.links) {
      if (!visited.has(link) && queue.length + visited.size < maxPages * 2) queue.push(link);
    }

    const chunks = chunkText(page.text, chunkSize, overlap);
    for (const [chunkIndex, content] of chunks.entries()) {
      const contentHash = hashContent(page.url, chunkIndex, content);
      await KnowledgeBaseDocumentModel.updateOne(
        { contentHash },
        {
          $set: {
            sourceUrl: page.url,
            title: page.title,
            chunkIndex,
            content,
            contentHash,
            capturedAt,
            isActive: true,
            metadata: {
              sourceType: "website",
              length: content.length,
            },
          },
        },
        { upsert: true }
      );
      chunkCount += 1;
    }
  }

  await KnowledgeBaseDocumentModel.deleteMany({ ...sourceQuery, isActive: false });

  return {
    startUrl,
    pagesVisited: visited.size,
    pagesCaptured: pageCount,
    chunksCaptured: chunkCount,
  };
}

export async function importMarkdownKnowledgeBase(options: MarkdownImportOptions) {
  const sourcePrefix = options.sourcePrefix ?? defaultManualSourcePrefix;
  const capturedAt = new Date();
  const parsedEntries: KnowledgeEntry[] = [];

  for (const filePath of options.files) {
    const resolvedPath = path.resolve(filePath);
    const markdown = await fs.readFile(resolvedPath, "utf8");
    parsedEntries.push(...parseMarkdownKnowledgeBase(markdown, resolvedPath));
  }

  const entries = dedupeEntries(parsedEntries);
  await KnowledgeBaseDocumentModel.deleteMany({
    $or: [
      { "metadata.sourceType": "manual_markdown" },
      { sourceUrl: { $regex: `^${sourcePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` } },
    ],
  });

  for (const [chunkIndex, entry] of entries.entries()) {
    const sourceUrl = entry.sourceUrl ?? `${sourcePrefix}${sourceFileSlug(entry.sourceFile)}#${entryAnchor(entry)}`;
    const content = formatKnowledgeEntry(entry);
    const contentHash = hashManualEntry(entry);
    const questionKeys = questionKeysForEntry(entry);

    await KnowledgeBaseDocumentModel.updateOne(
      { contentHash },
      {
        $set: {
          sourceUrl,
          title: entry.brand ? `${entry.brand}: ${entry.question}` : entry.question,
          chunkIndex,
          content,
          contentHash,
          capturedAt,
          isActive: true,
          metadata: {
            sourceType: "manual_markdown",
            sourceFile: entry.sourceFile,
            sourceEntryId: entry.id,
            brand: entry.brand,
            category: entry.category,
            question: entry.question,
            questionKey: questionKeys[0],
            questionKeys,
            answerLength: entry.answer.length,
          },
        },
      },
      { upsert: true }
    );
  }

  return {
    filesProcessed: options.files.length,
    entriesParsed: parsedEntries.length,
    duplicatesRemoved: parsedEntries.length - entries.length,
    entriesImported: entries.length,
  };
}

export async function retrieveKnowledgeSnippets(query: string, limit = 4): Promise<KnowledgeSnippet[]> {
  const normalizedQuery = query.trim();
  if (!env.ENABLE_RAG || normalizedQuery.length < 3) return [];

  const questionKey = normalizeQuestionKey(normalizedQuery);
  if (questionKey) {
    const directQuestionResults = await KnowledgeBaseDocumentModel.find({
      isActive: true,
      $or: [{ "metadata.questionKey": questionKey }, { "metadata.questionKeys": questionKey }],
    })
      .limit(limit)
      .select("title sourceUrl content")
      .lean();

    if (directQuestionResults.length > 0) {
      return directQuestionResults.map((item) => ({
        title: item.title,
        sourceUrl: item.sourceUrl,
        content: item.content,
      }));
    }
  }

  const textResults = await KnowledgeBaseDocumentModel.find(
    { $text: { $search: normalizedQuery }, isActive: true },
    { score: { $meta: "textScore" }, title: 1, sourceUrl: 1, content: 1 }
  )
    .sort({ score: { $meta: "textScore" } })
    .limit(limit)
    .lean();

  if (textResults.length > 0) {
    return textResults.map((item) => ({
      title: item.title,
      sourceUrl: item.sourceUrl,
      content: item.content,
    }));
  }

  const terms = normalizedQuery
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((term) => term.length >= 4)
    .slice(0, 8);

  if (terms.length === 0) return [];

  const regex = new RegExp(terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
  const fallbackResults = await KnowledgeBaseDocumentModel.find({ content: regex, isActive: true })
    .limit(limit)
    .select("title sourceUrl content")
    .lean();

  return fallbackResults.map((item) => ({
    title: item.title,
    sourceUrl: item.sourceUrl,
    content: item.content,
  }));
}
