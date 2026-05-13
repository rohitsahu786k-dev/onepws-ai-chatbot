import { extractPrimaryHtmlFragment, fetchHtmlPage, htmlToText, normalizeUrl, sameHost } from "./website-crawl";

export type MarkdownKbSite = {
  startUrl: string;
  brandHeading: string;
  /** Short name used in "What is …?" on the homepage */
  brandShortName: string;
};

const defaultSites: MarkdownKbSite[] = [
  { startUrl: "https://onepws.com", brandHeading: "OnePWS", brandShortName: "OnePWS" },
  { startUrl: "https://pwsfloor.com", brandHeading: "PWS Floor", brandShortName: "PWS Floor" },
  {
    startUrl: "https://wmspl.co.in",
    brandHeading: "Workspace Metal Solutions Pvt. Ltd. (WMSPL)",
    brandShortName: "Workspace Metal Solutions Pvt. Ltd.",
  },
];

function stripNoise(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
}

function extractSections(html: string): { heading: string; body: string }[] {
  const cleaned = stripNoise(extractPrimaryHtmlFragment(html));
  const segments = cleaned.split(/(?=<h[23]\b)/i);
  const out: { heading: string; body: string }[] = [];

  for (const seg of segments) {
    const m = seg.match(/^<h([23])[^>]*>([\s\S]*?)<\/h\1>([\s\S]*)$/i);
    if (m) {
      const heading = htmlToText(m[2]).slice(0, 220);
      const body = htmlToText(m[3]).trim();
      if (heading.length >= 2 && body.length >= 40) out.push({ heading, body });
    }
  }

  return out;
}

function truncate(text: string, max: number) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

/** Reduce header/nav repetition when <main> is missing (common on WordPress). */
function stripLeadingChrome(text: string, pageTitle: string) {
  let t = text.replace(/\s+/g, " ").trim();
  t = t.replace(/\s*Skip to content\s*/i, " ").trim();

  const pt = pageTitle.replace(/\s+/g, " ").trim();
  if (pt.length >= 10) {
    const escaped = pt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`^${escaped}\\s*`, "i"), "").trim();
  }

  const sf = t.search(/\bSearch for:\s*/i);
  if (sf >= 0 && sf < 2200) {
    t = t.slice(sf).replace(/\bSearch for:\s*\S*\s*/i, "").trim();
  }

  if (/^Name Unlimited Possibilities\b/i.test(t)) {
    t = `ONE ${t}`;
  }

  return t.trim();
}

function escapeMarkdownLine(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function pageLabel(title: string, url: string) {
  try {
    const path = new URL(url).pathname || "/";
    const base = title.trim() || path;
    if (path !== "/" && path.length > 1) return `${base} (${path})`;
    return base;
  } catch {
    return title.trim() || url;
  }
}

function categoryForSectionHeading(heading: string): "Section Detail" | "FAQ" {
  return heading.trim().endsWith("?") ? "FAQ" : "Section Detail";
}

async function crawlSitePages(startUrl: string, maxPages: number) {
  const normalized = normalizeUrl(startUrl);
  if (!normalized) throw new Error(`Invalid start URL: ${startUrl}`);

  const rootHost = new URL(normalized).hostname;
  const queue = [normalized];
  const visited = new Set<string>();
  const pages: Awaited<ReturnType<typeof fetchHtmlPage>>[] = [];

  while (queue.length > 0 && visited.size < maxPages) {
    const nextUrl = queue.shift();
    if (!nextUrl || visited.has(nextUrl)) continue;
    visited.add(nextUrl);

    const page = await fetchHtmlPage(nextUrl, rootHost);
    if (!page) continue;
    pages.push(page);

    for (const link of page.links) {
      if (!visited.has(link) && queue.length + visited.size < maxPages * 3) queue.push(link);
    }
  }

  return pages.filter((p): p is NonNullable<typeof p> => p !== null);
}

export type GenerateMarkdownKbOptions = {
  sites?: MarkdownKbSite[];
  maxPagesPerSite?: number;
  generatedAt?: Date;
};

export async function generateMarkdownKnowledgeBaseMarkdown(options: GenerateMarkdownKbOptions = {}) {
  const sites = options.sites ?? defaultSites;
  const maxPagesPerSite = options.maxPagesPerSite ?? 90;
  const generatedAt = options.generatedAt ?? new Date();
  const isoDate = generatedAt.toISOString().slice(0, 10);

  let kbIndex = 0;
  const blocks: string[] = [];

  const pushEntry = (brand: string, question: string, category: string, answer: string, sourceTitle: string, sourceUrl: string) => {
    kbIndex += 1;
    const id = `KB${String(kbIndex).padStart(4, "0")}`;
    const sourceLine = `${sourceTitle} — ${sourceUrl}`;
    blocks.push(`### ${id}. ${question}`);
    blocks.push(`**Category:** ${category}`);
    blocks.push("");
    blocks.push(`**Answer:** ${escapeMarkdownLine(answer)}`);
    blocks.push("");
    blocks.push(`**Source:** ${escapeMarkdownLine(sourceLine)}`);
    blocks.push("");
    blocks.push("---");
    blocks.push("");
  };

  let pagesTotal = 0;
  const pagesPerSite: Record<string, number> = {};

  for (const site of sites) {
    const pages = await crawlSitePages(site.startUrl, maxPagesPerSite);
    pagesPerSite[site.brandHeading] = pages.length;
    pagesTotal += pages.length;

    blocks.push(`# ${site.brandHeading}`);
    blocks.push("");

    const homeUrl = normalizeUrl(site.startUrl);
    const homePage = pages.find((p) => p && normalizeUrl(p.url) === homeUrl);

    const primaryText = (p: { html: string; text: string; title: string }) => {
      const raw = htmlToText(extractPrimaryHtmlFragment(p.html));
      const cleaned = stripLeadingChrome(raw, p.title);
      const t = cleaned.length >= 80 ? cleaned : stripLeadingChrome(p.text, p.title);
      return t.length >= 80 ? t : p.text;
    };

    if (homePage && primaryText(homePage).length >= 80) {
      pushEntry(
        site.brandHeading,
        `What is ${site.brandShortName}?`,
        "Company Overview",
        truncate(primaryText(homePage), 1200),
        homePage.title,
        homePage.url
      );
    }

    for (const page of pages) {
      if (!page) continue;

      const label = pageLabel(page.title, page.url);
      const sourceTitle = page.title.trim() || label;
      const bodyText = primaryText(page);

      pushEntry(
        site.brandHeading,
        `Where can I find information about ${label}?`,
        "Navigation",
        `The content for ${label} is available at: ${page.url}`,
        sourceTitle,
        page.url
      );

      pushEntry(
        site.brandHeading,
        `What is ${label} about?`,
        "Page Summary",
        truncate(bodyText, 1400),
        sourceTitle,
        page.url
      );

      pushEntry(
        site.brandHeading,
        `Give me a short summary of ${label}?`,
        "Page Summary",
        truncate(bodyText, 650),
        sourceTitle,
        page.url
      );

      const sections = extractSections(page.html);
      for (const section of sections) {
        const cat = categoryForSectionHeading(section.heading);
        pushEntry(
          site.brandHeading,
          `What does ${label} say about ${section.heading}?`,
          cat,
          truncate(section.body, 1600),
          sourceTitle,
          page.url
        );

        if (cat === "FAQ") {
          pushEntry(site.brandHeading, section.heading, "FAQ", truncate(section.body, 1600), sourceTitle, page.url);
        }
      }
    }
  }

  const header = [
    "# Complete AI Chatbot Knowledge Base for OnePWS, PWS Floor, and WMSPL",
    "",
    `Generated by crawling the official public websites on ${isoDate}. Entries follow the structure expected by \`importMarkdownKnowledgeBase\` (brand headings, KB IDs, Category, Answer, Source).`,
    "",
    "## Chatbot Operating Rules",
    "",
    "- Answer in clear, professional English unless the user asks for another language.",
    "- Use the Q&A answer as the source of truth. Do not invent specifications, prices, certifications, timelines, or legal claims.",
    "- For project-specific engineering, architectural, healthcare, medical, safety, or contractual decisions, ask the user to contact the company team.",
    "- When the user wants a quote, collect contact details, location, required solution, dimensions/quantity, application, timeline, drawings/specifications, and installation needs.",
    "- If an answer is not present in this knowledge base, say the information is not confirmed and request escalation to the company team.",
    "",
    "## Source Summary",
    "",
    `- Crawled sites: ${sites.map((s) => s.startUrl).join(", ")}`,
    `- Approximate HTML pages captured: ${pagesTotal}`,
    `- Total Q&A entries: ${kbIndex}`,
    ...sites.map((s) => `- ${s.brandHeading}: ${pagesPerSite[s.brandHeading] ?? 0} pages processed`),
    "",
    "## Knowledge Base Q&A",
    "",
  ].join("\n");

  return {
    markdown: `${header}${blocks.join("\n")}`,
    stats: {
      pagesPerSite,
      pagesTotal,
      totalEntries: kbIndex,
      generatedAt: isoDate,
    },
  };
}
