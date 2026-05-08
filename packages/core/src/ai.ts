import OpenAI from "openai";
import type { ChatAttachment, ChatPipelineResult, Intent, LeadFields, SolutionCategory } from "@onepws/types";
import { env } from "@onepws/config";
import {
  classifyIntent,
  classifySolutionCategories,
  computeLeadScore,
  detectLanguage,
  leadMissingFields,
  leadTemperatureFromScore,
  sameLanguageReply,
} from "@onepws/utils";
import { retrieveKnowledgeSnippets } from "./knowledge-base";

const openai = env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL,
    })
  : null;

type PreparedAttachment = {
  name: string;
  mimeType: string;
  kind: "image" | "document";
  extractedText?: string;
  dataUrl?: string;
};

function extractFieldsFromText(content: string): LeadFields {
  const email = content.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phone = content.match(/(?:\+91|0)?[6-9]\d{9}/)?.[0];
  const companyMatch = content.match(/\b(?:from|at|company is)\b\s+([A-Za-z0-9 &.-]{2,})/i);
  const nameMatch = content.match(/(?:i am|my name is|this is)\s+([A-Za-z ]{2,})/i);

  return {
    email,
    phone,
    company: companyMatch?.[1]?.trim(),
    fullName: nameMatch?.[1]?.trim(),
    requirementSummary: content,
    businessNeed: content,
    timeline: content.match(/(\d+\s*(day|days|week|weeks|month|months))/i)?.[1],
    budget: content.match(/(?:budget|cost|quote)[^.,;\n]*/i)?.[0],
    urgency: /(urgent|asap|immediately|priority)/i.test(content) ? "urgent" : undefined,
    departmentRequested: content.match(/(?:sales|technical|interiors|flooring|support|marketing)/i)?.[0],
  };
}

function isContactOnlyMessage(content: string) {
  const normalized = content.trim();
  if (!normalized) return false;
  if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(normalized)) return true;
  if (/^(?:\+91|0)?[6-9]\d{9}$/.test(normalized.replace(/\s+/g, ""))) return true;
  if (/^[A-Za-z][A-Za-z .'-]{1,60}$/.test(normalized) && normalized.split(/\s+/).length <= 4) return true;
  return false;
}

function contextualFieldsFromText(content: string, existingLead?: Partial<LeadFields>): LeadFields {
  const normalized = content.trim();
  const fields: LeadFields = {};
  if (!existingLead?.fullName && /^[A-Za-z][A-Za-z .'-]{1,60}$/.test(normalized) && normalized.split(/\s+/).length <= 4) {
    fields.fullName = normalized;
  }
  if (!existingLead?.company) {
    const company = normalized.match(/(?:company|organisation|organization|firm)\s*(?:is|:)?\s*([A-Za-z0-9 &.,'-]{2,80})/i)?.[1];
    if (company) fields.company = company.trim();
  }
  return fields;
}

function compactFields(fields: LeadFields | null | undefined): LeadFields {
  if (!fields) return {};
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== "")) as LeadFields;
}

function decodeAttachmentData(attachment: ChatAttachment) {
  const [, payload = attachment.data] = attachment.data.split(",", 2);
  return Buffer.from(payload, "base64");
}

async function prepareAttachments(attachments: ChatAttachment[] | undefined) {
  if (!attachments?.length) return [];

  const prepared = await Promise.all(
    attachments.slice(0, 4).map(async (attachment): Promise<PreparedAttachment> => {
      if (attachment.mimeType.startsWith("image/")) {
        return {
          name: attachment.name,
          mimeType: attachment.mimeType,
          kind: "image",
          dataUrl: attachment.data.startsWith("data:") ? attachment.data : `data:${attachment.mimeType};base64,${attachment.data}`,
        };
      }

      if (attachment.mimeType === "application/pdf") {
        const pdfModule = await import("pdf-parse");
        const pdfParse = (pdfModule as { default?: (buffer: Buffer) => Promise<{ text: string }> }).default ?? (pdfModule as unknown as (buffer: Buffer) => Promise<{ text: string }>);
        const parsed = await pdfParse(decodeAttachmentData(attachment));
        return {
          name: attachment.name,
          mimeType: attachment.mimeType,
          kind: "document",
          extractedText: parsed.text.trim().slice(0, 12000),
        };
      }

      const text = decodeAttachmentData(attachment).toString("utf8");
      return {
        name: attachment.name,
        mimeType: attachment.mimeType,
        kind: "document",
        extractedText: text.trim().slice(0, 12000),
      };
    })
  );

  return prepared.filter((attachment) => attachment.dataUrl || attachment.extractedText);
}

async function aiEnhance(content: string, language: string) {
  if (!openai && env.OLLAMA_GENERATE_URL) {
    const prompt = [
      "You extract lead fields for a OnePWS enterprise pre-sales chatbot.",
      "Return only strict JSON.",
      "Allowed keys: fullName,email,phone,company,designation,city,country,projectLocation,industry,projectType,budget,timeline,preferredContactMode,preferredContactTime,urgency,departmentRequested,personRequested,requirementSummary.",
      `Language: ${language}`,
      `Message: ${content}`,
    ].join("\n");

    const response = await fetch(env.OLLAMA_GENERATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OLLAMA_MODEL,
        prompt,
        stream: false,
        format: "json",
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { response?: string };
    try {
      return payload.response ? (JSON.parse(payload.response) as LeadFields) : null;
    } catch {
      return null;
    }
  }

  if (!openai) return null;

  const response = await openai.responses.create({
    model: env.OPENAI_EXTRACTION_MODEL,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "Extract lead fields for a OnePWS enterprise pre-sales chatbot. Return only valid JSON with keys fullName,email,phone,company,designation,city,country,projectLocation,industry,projectType,budget,timeline,preferredContactMode,preferredContactTime,urgency,departmentRequested,personRequested,requirementSummary.",
          },
        ],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: `Language: ${language}\nMessage: ${content}` }],
      },
    ],
  });

  const raw = response.output_text?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LeadFields;
  } catch {
    return null;
  }
}

async function buildKnowledgeReply(input: {
  content: string;
  language: string;
  missingFields: string[];
  intent: Intent;
  categories: SolutionCategory[];
  fields: LeadFields;
  shouldSubmitLead: boolean;
  contactOnlyMessage: boolean;
  attachments: PreparedAttachment[];
}) {
  const snippets = await retrieveKnowledgeSnippets(input.content);
  if (!openai) {
    return null;
  }

  const followUpQuestion = shouldAskLeadFollowUp(input)
    ? nextConversationalQuestion(input.missingFields[0], input.language)
    : undefined;
  const leadContext = [
    input.fields.fullName ? `Name: ${input.fields.fullName}` : "",
    input.fields.company ? `Company: ${input.fields.company}` : "",
    input.fields.email ? `Email: ${input.fields.email}` : "",
    input.fields.phone ? `Phone: ${input.fields.phone}` : "",
    input.fields.requirementSummary ? `Requirement: ${input.fields.requirementSummary}` : "",
    input.fields.projectLocation ? `Location: ${input.fields.projectLocation}` : "",
    input.fields.timeline ? `Timeline: ${input.fields.timeline}` : "",
  ].filter(Boolean);

  const response = await openai.responses.create({
    model: env.OPENAI_MODEL,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: [
              "You are the official OnePWS company AI assistant.",
              "Your first job is to answer the visitor's latest question clearly, like a helpful company expert.",
              "Use the supplied OnePWS website knowledge snippets when they are relevant.",
              "If attachments are provided, analyze them before answering.",
              "If the snippets do not contain a specific fact, do not invent exact prices, certifications, dimensions, delivery timelines, or guarantees.",
              "Do not keep saying the enquiry is captured or ready for the team.",
              "Do not force a lead form. Capture lead details silently from conversation.",
              "Ask at most one short follow-up question only when the visitor shows project/buying intent.",
              "For general information questions, answer only; do not ask for name, phone, or email.",
              "Keep replies crisp, persuasive, and sales-aware.",
              "Default to 2 short sentences, or 3 only when needed.",
              "Stay under 70 words unless the user explicitly asks for detail.",
              "Lead with the value or outcome, not background explanation.",
              "When asking for details, ask one concrete thing and make it easy to answer with choices such as timeline, location, project type, or callback preference.",
              "Avoid interview-style back-and-forth. Prefer guided, form-like next steps in wording.",
              "Use bullets only when the user asks for features, comparisons, or steps.",
              "Sound premium, consultative, and confident.",
              "Avoid long paragraphs and avoid repeating the user's wording.",
              `Reply language: ${input.language}.`,
            ].join("\n"),
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              `Visitor message: ${input.content}`,
              `Intent: ${input.intent}`,
              `Detected solution categories: ${input.categories.join(", ")}`,
              input.contactOnlyMessage ? "The latest visitor message appears to be contact/detail information, not a new product question." : "",
              leadContext.length ? `Known visitor/project details:\n${leadContext.join("\n")}` : "Known visitor/project details: none yet.",
              snippets.length
                ? ["OnePWS website knowledge snippets:", ...snippets.map((snippet, index) => `[${index + 1}] ${snippet.title} (${snippet.sourceUrl})\n${snippet.content}`)].join("\n\n")
                : "No exact website snippet matched. Answer from the general OnePWS solution areas only and be transparent if details are not available.",
              input.attachments.length
                ? [
                    "Attachment context:",
                    ...input.attachments.map((attachment, index) =>
                      attachment.kind === "image"
                        ? `[${index + 1}] Image: ${attachment.name} (${attachment.mimeType})`
                        : `[${index + 1}] Document: ${attachment.name} (${attachment.mimeType})\n${attachment.extractedText}`
                    ),
                  ].join("\n\n")
                : "No attachments provided.",
              followUpQuestion ? `Optional single follow-up question to include after answering: ${followUpQuestion}` : "Do not ask for lead/contact details in this reply.",
            ].join("\n\n"),
          },
          ...input.attachments
            .filter((attachment) => attachment.kind === "image" && attachment.dataUrl)
            .map((attachment) => ({
              type: "input_image" as const,
              image_url: attachment.dataUrl!,
              detail: "auto" as const,
            })),
        ],
      },
    ],
  });

  return response.output_text?.trim() || null;
}

function hasBuyingIntent(content: string, intent: Intent) {
  const normalized = content.toLowerCase();
  if (["sales_enquiry", "consultation_request", "layout_request", "department_connect", "person_connect"].includes(intent)) return true;
  return /\b(need|require|quote|price|cost|proposal|callback|call me|contact me|site visit|project|setup|install|installation|buy|purchase)\b/i.test(normalized);
}

function shouldAskLeadFollowUp(input: {
  content: string;
  intent: Intent;
  missingFields: string[];
  fields: LeadFields;
  shouldSubmitLead: boolean;
  contactOnlyMessage: boolean;
}) {
  if (input.shouldSubmitLead || input.missingFields.length === 0) return false;
  if (input.contactOnlyMessage) return false;
  return hasBuyingIntent(input.content, input.intent);
}

function formatCategory(category: SolutionCategory) {
  return category.replace(/_/g, " ");
}

function fieldLabel(field: string) {
  const labels: Record<string, string> = {
    fullName: "name",
    email: "email address",
    phone: "phone number",
    requirementSummary: "project requirement",
    projectLocation: "project location",
    timeline: "expected timeline",
  };
  return labels[field] ?? field.replace(/([A-Z])/g, " $1").toLowerCase();
}

function nextConversationalQuestion(field: string | undefined, language: string) {
  if (!field) {
    return sameLanguageReply(
      language,
      "What project location or timeline should I note for the team?",
      "Project location ya timeline kya note karun?",
      "Project location ya timeline kya note karun?"
    );
  }

  const english: Record<string, string> = {
    fullName: "May I have your name so I can attach it to this enquiry?",
    email: "Which email should the OnePWS team use for the follow-up?",
    phone: "Could you share your phone number for a quick callback?",
    requirementSummary: "Could you describe the project requirement in one or two lines?",
    projectLocation: "Where is the project located?",
    timeline: "What timeline are you planning for this project?",
  };
  const hinglish: Record<string, string> = {
    fullName: "Aapka naam note kar lun?",
    email: "Follow-up ke liye kaunsa email use karein?",
    phone: "Quick callback ke liye phone number share kar dijiye.",
    requirementSummary: "Requirement one or two lines me bata dijiye.",
    projectLocation: "Project location kahan hai?",
    timeline: "Project ki expected timeline kya hai?",
  };

  const fallback = `Could you share your ${fieldLabel(field)}?`;
  return sameLanguageReply(language, english[field] ?? fallback, hinglish[field] ?? fallback, hinglish[field] ?? fallback);
}

function solutionGuidance(category: SolutionCategory) {
  const replies: Partial<Record<SolutionCategory, string>> = {
    control_room:
      "For control room projects, OnePWS can support command center layouts, operator workflow, monitoring walls, ergonomics, and project coordination.",
    control_room_consoles:
      "For control room consoles, OnePWS can discuss operator desks, console layouts, cable management, equipment placement, and ergonomic control room furniture.",
    auditorium:
      "For auditorium or conference spaces, OnePWS can help with interior planning, seating-focused layouts, finishes, and project execution requirements.",
    corporate_interiors:
      "For corporate interiors, OnePWS can support workspace planning, interior execution, furniture coordination, and integrated workplace requirements.",
    integrated_workspace:
      "For integrated workspaces, OnePWS can connect interiors, consoles, flooring, and infrastructure planning into a single project conversation.",
    raised_access_flooring:
      "For raised access flooring, OnePWS can discuss access-floor systems for service routing, load needs, finish options, and site execution planning.",
    false_flooring:
      "For false flooring, OnePWS can guide you on flooring requirements, project area, service access needs, and execution timelines.",
    modular_operation_theatre:
      "For modular OT projects, OnePWS can support operation theatre infrastructure, clean-room-related needs, finishes, and project coordination.",
    healthcare_infrastructure:
      "For healthcare infrastructure, OnePWS can help with hospital interiors, modular OT-related spaces, clean-room-linked needs, and execution planning.",
    clean_room_related:
      "For clean-room-related requirements, OnePWS can discuss controlled-space infrastructure needs, healthcare use cases, finishes, and project scope.",
    mixed_requirement:
      "Your requirement touches multiple OnePWS solution areas, so the best next step is to capture the project scope and route it to the right internal team.",
  };

  return replies[category] ?? "OnePWS can help with control rooms, consoles, auditoriums, interiors, flooring, healthcare infrastructure, and modular OT projects.";
}

function buildHeuristicReply(input: {
  content: string;
  language: string;
  intent: Intent;
  categories: SolutionCategory[];
  missingFields: string[];
  shouldSubmitLead: boolean;
}) {
  if (input.shouldSubmitLead) {
    return sameLanguageReply(
      input.language,
      "Thanks. I have enough information to route this to the relevant OnePWS team. You can also share your preferred callback time if there is one.",
      "Thanks. Mere paas is enquiry ko relevant OnePWS team tak route karne ke liye enough details hain. Agar preferred callback time hai to share kar sakte hain.",
      "Thanks. Mere paas enough details hain is enquiry ko relevant OnePWS team tak route karne ke liye. Aap preferred callback time bhi share kar sakte hain."
    );
  }

  const category = input.categories[0] ?? "unknown";
  const normalized = input.content.toLowerCase().trim();
  const isGreeting = /^(hi|hello|hey|namaste|hii)\b/.test(normalized);
  const intro = isGreeting
    ? "Hello. I can help you with OnePWS project enquiries."
    : input.intent === "support_request"
      ? "I can help capture your support requirement and route it to the OnePWS team."
      : solutionGuidance(category);
  const categoryLine = category !== "unknown" && category !== "mixed_requirement" ? ` I have noted this under ${formatCategory(category)}.` : "";
  const nextQuestion = ` ${nextConversationalQuestion(input.missingFields[0], input.language)}`;

  return sameLanguageReply(input.language, `${intro}${categoryLine}${nextQuestion}`, `${intro}${categoryLine}${nextQuestion}`, `${intro}${categoryLine}${nextQuestion}`);
}

export async function runChatPipeline(input: {
  content: string;
  existingLead?: Partial<LeadFields>;
  attachments?: ChatAttachment[];
}): Promise<ChatPipelineResult> {
  const detectedLanguage = detectLanguage(input.content);
  const intent = classifyIntent(input.content);
  const contactOnlyMessage = isContactOnlyMessage(input.content);
  const detectedCategories = classifySolutionCategories(input.content);
  const categories =
    contactOnlyMessage && input.existingLead?.solutionCategories?.length
      ? input.existingLead.solutionCategories
      : contactOnlyMessage && input.existingLead?.solutionCategory
        ? [input.existingLead.solutionCategory]
        : detectedCategories;
  const heuristicFields = compactFields(extractFieldsFromText(input.content));
  const contextualFields = compactFields(contextualFieldsFromText(input.content, input.existingLead));
  const aiFields = compactFields(await aiEnhance(input.content, detectedLanguage));
  const preparedAttachments = await prepareAttachments(input.attachments);
  const fields = {
    ...input.existingLead,
    ...heuristicFields,
    ...contextualFields,
    ...aiFields,
    requirementSummary:
      contactOnlyMessage && input.existingLead?.requirementSummary
        ? input.existingLead.requirementSummary
        : aiFields?.requirementSummary ?? heuristicFields.requirementSummary ?? input.existingLead?.requirementSummary,
    businessNeed:
      contactOnlyMessage && input.existingLead?.businessNeed
        ? input.existingLead.businessNeed
        : aiFields?.businessNeed ?? heuristicFields.businessNeed ?? input.existingLead?.businessNeed,
    solutionCategory: categories[0],
    solutionCategories: categories,
    language: detectedLanguage,
  };

  const leadScore = computeLeadScore(fields, intent, categories);
  const leadTemperature = leadTemperatureFromScore(leadScore);
  const missingFields = leadMissingFields(fields, intent);
  const shouldSubmitLead = missingFields.length <= 1 && !!(fields.email || fields.phone);

  const nextQuestion = missingFields[0] ? nextConversationalQuestion(missingFields[0], detectedLanguage) : undefined;

  const summary = `Intent: ${intent}. Solutions: ${categories.join(", ")}. Need: ${fields.requirementSummary ?? input.content}`;
  const conclusion = shouldSubmitLead ? "Lead is qualified for internal routing." : `Lead is still missing: ${missingFields.join(", ")}`;

  const assistantReply = buildHeuristicReply({
    content: input.content,
    language: detectedLanguage,
    intent,
    categories,
    missingFields,
    shouldSubmitLead,
  });
  const knowledgeReply = await buildKnowledgeReply({
    content: input.content,
    language: detectedLanguage,
    missingFields,
    intent,
    categories,
    fields,
    shouldSubmitLead,
    contactOnlyMessage,
    attachments: preparedAttachments,
  });

  return {
    assistantReply: knowledgeReply ?? assistantReply,
    extraction: {
      ...fields,
      intent,
      detectedLanguage,
      missingFields,
      leadScore,
      leadTemperature,
      summary,
      conclusion,
      shouldSubmitLead,
      nextQuestion,
    },
  };
}
