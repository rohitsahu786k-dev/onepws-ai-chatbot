import dayjs from "dayjs";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Intent, LeadFields, LeadTemperature, SolutionCategory } from "@onepws/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const solutionKeywordMap: Record<SolutionCategory, string[]> = {
  control_room: ["control room", "command center", "nocc", "socc"],
  control_room_consoles: ["console", "consoles", "operator desk", "control room console"],
  auditorium: ["auditorium", "conference hall", "lecture hall"],
  corporate_interiors: ["interior", "interiors", "office interior", "corporate interior"],
  integrated_workspace: ["workspace", "integrated workspace", "office setup"],
  raised_access_flooring: ["raised access flooring", "raised floor", "access floor"],
  false_flooring: ["false flooring", "false floor"],
  modular_operation_theatre: ["modular ot", "operation theatre", "operating theatre", "ot"],
  healthcare_infrastructure: ["healthcare infrastructure", "hospital infrastructure", "hospital project"],
  clean_room_related: ["clean room", "cleanroom", "sterile room"],
  general_consultation: ["consultation", "planning", "layout"],
  mixed_requirement: [],
  unknown: [],
};

export function detectLanguage(text: string) {
  const normalized = text.toLowerCase();
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  if (/\b(hai|karna|chahiye|hum|aap|kya|kaise|zarurat)\b/.test(normalized)) return "hinglish";
  return "en";
}

export function classifyIntent(text: string): Intent {
  const normalized = text.toLowerCase();
  if (/\b(connect|talk to|speak to|contact)\b/.test(normalized) && /\b(team|department|sales|technical)\b/.test(normalized)) {
    return "department_connect";
  }
  if (/\b(connect me to|speak with)\b/.test(normalized) && /\b(mr|mrs|ms|manager|person|salesperson)\b/.test(normalized)) {
    return "person_connect";
  }
  if (/\b(layout|planning|design consultation)\b/.test(normalized)) return "layout_request";
  if (/\b(consult|consultation|callback)\b/.test(normalized)) return "consultation_request";
  if (/\b(price|cost|quote|proposal|need|require|setup)\b/.test(normalized)) return "sales_enquiry";
  if (/\b(support|service|issue|problem)\b/.test(normalized)) return "support_request";
  if (/\b(what do you do|solutions|offer|about onepws)\b/.test(normalized)) return "general_information";
  return "product_enquiry";
}

export function classifySolutionCategories(text: string): SolutionCategory[] {
  const normalized = text.toLowerCase();
  const matches = Object.entries(solutionKeywordMap)
    .filter(([category]) => !["mixed_requirement", "unknown", "general_consultation"].includes(category))
    .filter(([, keywords]) => keywords.some((keyword) => normalized.includes(keyword)))
    .map(([category]) => category as SolutionCategory);

  if (matches.length === 0 && solutionKeywordMap.general_consultation.some((keyword) => normalized.includes(keyword))) {
    return ["general_consultation"];
  }
  if (matches.length === 0) return ["unknown"];
  if (matches.length > 1) return ["mixed_requirement"];
  return matches;
}

export function computeLeadScore(fields: LeadFields, intent: Intent, categories: SolutionCategory[]) {
  let score = 0;
  if (fields.requirementSummary || fields.businessNeed) score += 20;
  if (fields.email) score += 15;
  if (fields.phone) score += 15;
  if (fields.company) score += 10;
  if (fields.timeline) score += 10;
  if (fields.budget) score += 10;
  if (fields.personRequested || fields.departmentRequested) score += 5;
  if (fields.urgency && /urgent|asap|immediate|priority/i.test(fields.urgency)) score += 10;
  if (categories.includes("mixed_requirement")) score += 10;
  if (intent === "sales_enquiry" || intent === "consultation_request") score += 10;
  return Math.min(100, score);
}

export function leadTemperatureFromScore(score: number): LeadTemperature {
  if (score >= 80) return "hot";
  if (score >= 50) return "warm";
  return "cold";
}

export function normalizePhone(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/[^\d+]/g, "");
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "N/A";
  return dayjs(value).format("DD MMM YYYY, hh:mm A");
}

export function leadMissingFields(fields: LeadFields, intent: Intent) {
  const base = ["fullName", "email", "phone", "requirementSummary"] as const;
  const consultExtras = intent === "consultation_request" || intent === "layout_request" ? ["projectLocation", "timeline"] : [];
  return [...base, ...consultExtras].filter((field) => !fields[field as keyof LeadFields]);
}

export function sameLanguageReply(language: string, english: string, hindi: string, hinglish: string) {
  if (language === "hi") return hindi;
  if (language === "hinglish") return hinglish;
  return english;
}
