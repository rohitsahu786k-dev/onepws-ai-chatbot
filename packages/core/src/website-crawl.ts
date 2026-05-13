import sanitizeHtml from "sanitize-html";

export function normalizeUrl(value: string, base?: string) {
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

export function sameHost(url: string, host: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === host.replace(/^www\./, "");
  } catch {
    return false;
  }
}

export function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanText(match?.[1] ?? "OnePWS Website");
}

export function cleanText(value: string) {
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

export function htmlToText(html: string) {
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

/** Prefer primary page body for text extraction (reduces header/footer/nav noise). */
export function extractPrimaryHtmlFragment(html: string): string {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (main?.[1]) return main[1];
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (article?.[1]) return article[1];
  return html;
}

export function extractLinks(html: string, pageUrl: string, rootHost: string) {
  return Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi))
    .map((match) => normalizeUrl(match[1], pageUrl))
    .filter((url): url is string => !!url)
    .filter((url) => sameHost(url, rootHost))
    .filter((url) => !/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|docx?|xlsx?)$/i.test(new URL(url).pathname));
}

export type FetchedHtmlPage = {
  url: string;
  title: string;
  text: string;
  links: string[];
  html: string;
};

export async function fetchHtmlPage(url: string, rootHost: string): Promise<FetchedHtmlPage | null> {
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
    html,
  };
}
