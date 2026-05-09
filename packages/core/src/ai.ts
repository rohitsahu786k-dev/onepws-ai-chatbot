import { OpenAI } from "openai";
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
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: decodeAttachmentData(attachment) });
        const parsed = await parser.getText();
        await parser.destroy();
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
              "You are the official OnePWS AI Assistant.",
              "Act like an AI Technical Sales and Support Consultant for control room solutions, not a casual chatbot or generic assistant.",
              "Your first job is to answer the visitor's latest question clearly, like a helpful OnePWS technical consultant.",
              "Use the supplied OnePWS website knowledge snippets when they are relevant, but do not limit yourself to them for general technical guidance.",
              "If attachments are provided, analyze them before answering.",
              "Use general industry knowledge for planning, comparison, troubleshooting, and design guidance when the knowledge snippets do not cover the topic.",
              "For OnePWS-specific facts, do not invent exact prices, certifications, dimensions, delivery timelines, client names, guarantees, or stock availability.",
              "If a OnePWS-specific fact is unavailable, say so briefly, then still give useful general guidance and offer to connect the right OnePWS team.",
              "Do not keep saying the enquiry is captured or ready for the team.",
              "Do not force a lead form. Capture lead details silently from conversation.",
              "Ask at most one short follow-up question only when the visitor shows project/buying intent.",
              "For general information questions, answer only; do not ask for name, phone, or email.",
              "Keep replies crisp, persuasive, and sales-aware.",
              "Default to 2 short sentences, or 3 only when needed.",
              "Stay under 70 words unless the user explicitly asks for detail.",
              "Lead with the value or outcome, not background explanation.",
              "Use a smart rhythm: direct answer, practical recommendation, then one useful next step when appropriate.",
              "Recommend solution direction from general control-room, workspace, flooring, interiors, or healthcare infrastructure expertise; reserve exact OnePWS model claims for knowledge-supported facts.",
              "When asking for details, ask one concrete thing and make it easy to answer with choices such as timeline, location, project type, or callback preference.",
              "Avoid interview-style back-and-forth. Prefer guided, form-like next steps in wording.",
              "Use bullets only when the user asks for features, comparisons, or steps.",
              "Sound premium, consultative, confident, and warm without becoming chatty.",
              "For Hinglish, use natural Roman Hinglish that feels helpful and professional.",
              "Avoid emojis, slang, overfriendly tone, and robotic boilerplate.",
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
                : "No exact website snippet matched. Give a smart answer using general industry knowledge and OnePWS solution-area context. Be transparent only for OnePWS-specific facts that are not available.",
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

function solutionGuidance(category: SolutionCategory, language: string) {
  const english: Partial<Record<SolutionCategory, string>> = {
    control_room:
      "For a control room, the smart starting point is operator workflow, video-wall visibility, 24/7 ergonomics, cable routing, and future expansion.",
    control_room_consoles:
      "For control room consoles, focus on operator count, monitor layout, cable access, equipment heat, and long-shift comfort before finalizing furniture.",
    auditorium:
      "For auditorium or conference spaces, the right plan balances seating sightlines, acoustics, finishes, lighting, and execution sequencing.",
    corporate_interiors:
      "For corporate interiors, OnePWS can shape the workspace around team flow, furniture coordination, finishes, and site execution priorities.",
    integrated_workspace:
      "For integrated workspaces, the best approach is to align interiors, consoles, flooring, services, and infrastructure in one coordinated scope.",
    raised_access_flooring:
      "For raised access flooring, check service routing, load requirements, finished floor height, panel finish, and maintenance access early.",
    false_flooring:
      "For false flooring, the key decisions are service access, load rating, height, finish, room usage, and installation timeline.",
    modular_operation_theatre:
      "For modular OT projects, planning should cover clean workflow, wall and ceiling finishes, service panels, HVAC coordination, and execution hygiene.",
    healthcare_infrastructure:
      "For healthcare infrastructure, the scope usually needs clean finishes, workflow planning, MEP coordination, and reliable execution control.",
    clean_room_related:
      "For clean-room requirements, define classification target, pressure needs, material finishes, HVAC coordination, and validation expectations first.",
    mixed_requirement:
      "This touches multiple OnePWS solution areas, so the best move is to map the scope once and route each part to the right specialist.",
  };

  const hinglish: Partial<Record<SolutionCategory, string>> = {
    control_room:
      "Control room ke liye smart starting point operator workflow, video-wall visibility, 24/7 ergonomics, cable routing, aur future expansion hota hai.",
    control_room_consoles:
      "Control room consoles me pehle operator count, monitor layout, cable access, equipment heat, aur long-shift comfort clear karna best hota hai.",
    auditorium:
      "Auditorium ya conference space me seating sightlines, acoustics, finishes, lighting, aur execution sequencing ko balance karna zaruri hota hai.",
    corporate_interiors:
      "Corporate interiors me OnePWS workspace ko team flow, furniture coordination, finishes, aur site execution ke around plan kar sakta hai.",
    integrated_workspace:
      "Integrated workspace me interiors, consoles, flooring, services, aur infrastructure ko ek coordinated scope me align karna best hota hai.",
    raised_access_flooring:
      "Raised access flooring me service routing, load requirement, finished floor height, panel finish, aur maintenance access pehle check karna chahiye.",
    false_flooring:
      "False flooring me key decisions service access, load rating, height, finish, room usage, aur installation timeline hote hain.",
    modular_operation_theatre:
      "Modular OT me clean workflow, wall-ceiling finishes, service panels, HVAC coordination, aur execution hygiene ko saath plan karna hota hai.",
    healthcare_infrastructure:
      "Healthcare infrastructure me clean finishes, workflow planning, MEP coordination, aur reliable execution control sabse important hote hain.",
    clean_room_related:
      "Clean-room requirement me classification target, pressure needs, material finishes, HVAC coordination, aur validation expectations pehle define karna best hai.",
    mixed_requirement:
      "Ye requirement multiple OnePWS areas touch kar rahi hai, isliye scope ko ek baar map karke right specialist tak route karna best rahega.",
  };

  const defaultEnglish =
    "OnePWS can help with control rooms, consoles, auditoriums, interiors, flooring, healthcare infrastructure, and modular OT projects.";
  const defaultHinglish =
    "OnePWS control rooms, consoles, auditoriums, interiors, flooring, healthcare infrastructure, aur modular OT projects me help kar sakta hai.";

  return sameLanguageReply(language, english[category] ?? defaultEnglish, hinglish[category] ?? defaultHinglish, hinglish[category] ?? defaultHinglish);
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
    ? sameLanguageReply(
        input.language,
        "Hello. Tell me what you are planning, and I will guide you with the right OnePWS solution direction.",
        "Hello. Aap jo plan kar rahe hain bataiye, main aapko right OnePWS solution direction suggest kar dunga.",
        "Hello. Aap jo plan kar rahe hain bataiye, main right OnePWS solution direction suggest kar dunga."
      )
    : input.intent === "support_request"
      ? sameLanguageReply(
          input.language,
          "I can help narrow down the issue and route it to the right OnePWS support team.",
          "Main issue ko narrow down karke right OnePWS support team tak route karne me help kar sakta hun.",
          "Main issue ko narrow down karke right OnePWS support team tak route karne me help kar sakta hun."
        )
      : solutionGuidance(category, input.language);
  const categoryLine = category !== "unknown" && category !== "mixed_requirement" ? ` I have noted this under ${formatCategory(category)}.` : "";
  const nextQuestion =
    hasBuyingIntent(input.content, input.intent) && input.missingFields.length > 0 ? ` ${nextConversationalQuestion(input.missingFields[0], input.language)}` : "";

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
