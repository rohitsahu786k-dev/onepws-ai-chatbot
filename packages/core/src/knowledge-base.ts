import crypto from "node:crypto";
import sanitizeHtml from "sanitize-html";
import { env } from "@onepws/config";
import { KnowledgeBaseDocumentModel } from "./models";

type CrawledPage = {
  url: string;
  title: string;
  text: string;
  links: string[];
};

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

const defaultMaxPages = 80;
const defaultChunkSize = 1200;
const defaultOverlap = 180;

function normalizeUrl(value: string, base?: string) {
  try {
    const url = new URL(value, base);
    url.hash = "";
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function sameHost(url: string, host: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === host.replace(/^www\./, "");
  } catch {
    return false;
  }
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanText(match?.[1] ?? "OnePWS Website");
}

function cleanText(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToText(html: string) {
  const withoutNoise = sanitizeHtml(html, {
    allowedTags: [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "li",
      "ul",
      "ol",
      "table",
      "thead",
      "tbody",
      "tr",
      "td",
      "th",
      "strong",
      "b",
      "em",
      "span",
      "div",
      "br",
    ],
    allowedAttributes: {},
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "noscript", "svg", "img", "video", "audio", "iframe"],
  });

  return cleanText(
    withoutNoise
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|h[1-6]|li|tr|div)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

function extractLinks(html: string, pageUrl: string, rootHost: string) {
  return Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi))
    .map((match) => normalizeUrl(match[1], pageUrl))
    .filter((url): url is string => !!url)
    .filter((url) => sameHost(url, rootHost))
    .filter((url) => !/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|docx?|xlsx?)$/i.test(new URL(url).pathname));
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

async function fetchPage(url: string, rootHost: string): Promise<CrawledPage | null> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "OnePWS-KnowledgeBaseImporter/1.0",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("text/html")) return null;

  const html = await response.text();
  const text = htmlToText(html);
  if (!text) return null;

  return {
    url,
    title: extractTitle(html),
    text,
    links: extractLinks(html, url, rootHost),
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

  await KnowledgeBaseDocumentModel.updateMany({}, { $set: { isActive: false } });

  while (queue.length > 0 && visited.size < maxPages) {
    const nextUrl = queue.shift();
    if (!nextUrl || visited.has(nextUrl)) continue;
    visited.add(nextUrl);

    const page = await fetchPage(nextUrl, rootHost);
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
              length: content.length,
            },
          },
        },
        { upsert: true }
      );
      chunkCount += 1;
    }
  }

  await KnowledgeBaseDocumentModel.deleteMany({ isActive: false });

  return {
    startUrl,
    pagesVisited: visited.size,
    pagesCaptured: pageCount,
    chunksCaptured: chunkCount,
  };
}

export async function retrieveKnowledgeSnippets(query: string, limit = 4): Promise<KnowledgeSnippet[]> {
  const normalizedQuery = query.trim();
  if (!env.ENABLE_RAG || normalizedQuery.length < 3) return [];

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
