import fs from "node:fs";

const INPUT = "d:/onepws/onepws-chatbot/onepws_master_ai_knowledge_base_updated.md";
const OUTPUT = INPUT;

const TEMPLATE_PREFIXES = [
  /^what answer should the chatbot give for:\s*/i,
  /^how should the ai reply if a visitor asks,\s*"/i,
  /^customer query:\s*/i,
  /^website chatbot faq:\s*/i,
  /^onepws sales chatbot question:\s*/i,
  /^lead asks:\s*/i,
  /^prospect asks:\s*/i,
  /^training variant\s*-\s*/i,
  /^can you explain:\s*/i,
  /^can you explain\s+/i,
  /^tell me about\s+/i,
  /^what should i know about\s+/i,
  /^give details on\s+/i,
  /^give details about\s+/i,
  /^how would you describe\s+/i,
  /^what information is available about\s+/i,
  /^how should i describe\s+/i,
];

function norm(q) {
  return q
    .toLowerCase()
    .replace(/["'?!.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTemplates(question) {
  let q = question.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of TEMPLATE_PREFIXES) {
      if (re.test(q)) {
        q = q.replace(re, "").replace(/^["']|["']$/g, "").trim();
        changed = true;
      }
    }
  }
  return q;
}

function isBrokenTemplateQuestion(question) {
  const stripped = stripTemplates(question);
  if (!stripped || stripped === question) return false;
  return !/^(how|what|which|who|where|when|why|can|does|is|are|do|tell|give)\b/i.test(stripped);
}

function matchesExisting(stripped, keptNormKeys) {
  const s = norm(stripped);
  if (!s || s.length < 12) return false;
  for (const k of keptNormKeys) {
    if (k === s) return true;
    if (k.length >= 20 && s.length >= 12 && (k.includes(s) || s.includes(k))) return true;
  }
  return false;
}

function parseQaEntries(markdown) {
  const appendixSplit = markdown.split(/\n## Appendix:/);
  const main = appendixSplit[0];
  const appendix = appendixSplit.length > 1 ? `## Appendix:${appendixSplit[1]}` : "";

  const firstQa = main.search(/^### Timeline Q1\./m);
  const preamble = firstQa >= 0 ? main.slice(0, firstQa) : main;

  const blockRe =
    /^### ((?:Q\d+|Timeline Q\d+))\.\s+(.+?)\n\n\*\*Answer:\*\*\s+([\s\S]*?)(?:\n\n\*\*Source family:\*\*\s+(.+?))?(?=\n\n### |\n## |\n# |$)/gm;

  const entries = [];
  let m;
  while ((m = blockRe.exec(main))) {
    entries.push({
      id: m[1],
      question: m[2].trim(),
      answer: m[3].trim(),
      source: m[4]?.trim() ?? "",
      index: m.index,
    });
  }

  const altStart = main.indexOf("## Alternative Training Question Phrasings");
  for (const entry of entries) {
    entry.inAltSection = altStart >= 0 && entry.index >= altStart;
    entry.isTimeline = entry.id.startsWith("Timeline");
  }

  return { preamble, entries, appendix };
}

function shouldDrop(entry, keptNormKeys) {
  const n = norm(entry.question);
  const stripped = stripTemplates(entry.question);

  if (entry.isTimeline && entry.id === "Timeline Q19" && /what was confes/i.test(entry.question)) {
    return "duplicate confes timeline entry";
  }

  if (
    !entry.isTimeline &&
    /^Q(2[4-9]|3[0-9]|4[0-2])$/.test(entry.id) &&
    /^what happened in \d{4} at onepws/.test(n)
  ) {
    return "timeline duplicate in master section";
  }

  if (
    entry.isTimeline &&
    entry.id === "Timeline Q20" &&
    /correct 2026 onepws transition/.test(n)
  ) {
    return "duplicate 2026 transition timeline entry";
  }

  if (isBrokenTemplateQuestion(entry.question)) {
    return "broken template phrasing";
  }

  if (stripped !== entry.question && matchesExisting(stripped, keptNormKeys)) {
    return "template variant of existing question";
  }

  if (keptNormKeys.has(n)) {
    return "exact duplicate question";
  }

  return null;
}

function formatEntry(id, entry) {
  const lines = [`### ${id}. ${entry.question}`, "", `**Answer:** ${entry.answer}`];
  if (entry.source) lines.push("", `**Source family:** ${entry.source}`);
  return `${lines.join("\n")}\n\n`;
}

function cleanup() {
  const markdown = fs.readFileSync(INPUT, "utf8");
  const { preamble, entries, appendix } = parseQaEntries(markdown);

  const kept = [];
  const dropped = [];
  const keptNormKeys = new Set();

  for (const entry of entries.filter((e) => e.isTimeline)) {
    const reason = shouldDrop(entry, keptNormKeys);
    if (reason) {
      dropped.push({ ...entry, reason });
      continue;
    }
    keptNormKeys.add(norm(entry.question));
    kept.push(entry);
  }

  for (const entry of entries.filter((e) => !e.isTimeline)) {
    const reason = shouldDrop(entry, keptNormKeys);
    if (reason) {
      dropped.push({ ...entry, reason });
      continue;
    }
    const n = norm(entry.question);
    keptNormKeys.add(n);
    const stripped = norm(stripTemplates(entry.question));
    if (stripped) keptNormKeys.add(stripped);
    kept.push(entry);
  }

  const timelineOut = kept.filter((e) => e.isTimeline);
  const masterOut = kept.filter((e) => !e.isTimeline && !e.inAltSection);
  const altOut = kept.filter((e) => !e.isTimeline && e.inAltSection);

  let out = preamble;
  timelineOut.forEach((entry, i) => {
    out += formatEntry(`Timeline Q${i + 1}`, entry);
  });

  out += "\n## A to Z Questions and Answers\n\n";
  out +=
    "Verified OnePWS questions and answers across company profile, milestones, products, certifications, and project guidance.\n\n";

  masterOut.forEach((entry, i) => {
    out += formatEntry(`Q${i + 1}`, entry);
  });

  if (altOut.length > 0) {
    out += "\n## Alternative Training Question Phrasings\n\n";
    out +=
      "Additional visitor-style phrasings for stronger intent matching (unique questions only).\n\n";
    altOut.forEach((entry, i) => {
      out += formatEntry(`Q${masterOut.length + i + 1}`, entry);
    });
  }

  out += `\n${appendix}`;

  fs.writeFileSync(OUTPUT, out, "utf8");

  console.log(
    JSON.stringify(
      {
        inputQuestions: entries.length,
        kept: kept.length,
        dropped: dropped.length,
        timeline: timelineOut.length,
        master: masterOut.length,
        alt: altOut.length,
        dropReasons: dropped.reduce((acc, d) => {
          acc[d.reason] = (acc[d.reason] ?? 0) + 1;
          return acc;
        }, {}),
      },
      null,
      2
    )
  );
}

cleanup();
