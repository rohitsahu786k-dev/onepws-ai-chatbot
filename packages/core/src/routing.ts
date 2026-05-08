// @ts-nocheck
import { env } from "@onepws/config";
import type { Intent, SolutionCategory } from "@onepws/types";
import { DepartmentModel, PersonMappingModel, RoutingRuleModel } from "./models";

const fallbackByCategory: Partial<Record<SolutionCategory, string | undefined>> = {
  control_room: env.DEPT_CONTROL_ROOM_EMAIL,
  control_room_consoles: env.DEPT_CONSOLES_EMAIL,
  auditorium: env.DEPT_INTERIORS_EMAIL,
  corporate_interiors: env.DEPT_INTERIORS_EMAIL,
  integrated_workspace: env.DEPT_ENTERPRISE_SOLUTIONS_EMAIL,
  raised_access_flooring: env.DEPT_FLOORING_EMAIL,
  false_flooring: env.DEPT_FLOORING_EMAIL,
  modular_operation_theatre: env.DEPT_MODULAR_OT_EMAIL,
  healthcare_infrastructure: env.DEPT_MODULAR_OT_EMAIL,
  clean_room_related: env.DEPT_MODULAR_OT_EMAIL,
  mixed_requirement: env.DEPT_ENTERPRISE_SOLUTIONS_EMAIL,
  unknown: env.FALLBACK_LEAD_EMAIL,
};

export async function resolveRouting(input: {
  content: string;
  intent: Intent;
  solutionCategories: SolutionCategory[];
  departmentRequested?: string;
  personRequested?: string;
}) {
  const primaryCategory = input.solutionCategories[0] ?? "unknown";
  const rules = await RoutingRuleModel.find({ isActive: true }).sort({ priority: 1 }).lean();
  const requestedDepartment = input.departmentRequested?.toLowerCase().trim();
  const requestedPerson = input.personRequested?.toLowerCase().trim();

  if (requestedPerson) {
    const person = await PersonMappingModel.findOne({
      isActive: true,
      $or: [{ fullName: new RegExp(requestedPerson, "i") }, { aliases: new RegExp(requestedPerson, "i") }],
    }).lean();

    if (person) {
      return {
        assignedDepartment: person.departmentSlug,
        assignedPerson: person.fullName,
        targetEmails: [person.email],
        cc: [env.MARKETING_CC_EMAIL].filter(Boolean) as string[],
      };
    }
  }

  if (requestedDepartment) {
    const department = await DepartmentModel.findOne({
      isActive: true,
      $or: [{ slug: requestedDepartment }, { name: new RegExp(requestedDepartment, "i") }],
    }).lean();

    if (department) {
      return {
        assignedDepartment: department.slug,
        assignedPerson: null,
        targetEmails: [department.primaryEmail],
        cc: [...department.ccEmails, env.MARKETING_CC_EMAIL].filter(Boolean) as string[],
      };
    }
  }

  const matchedRule = rules.find((rule) => {
    const keywordsHit = rule.solutionKeywords.some((keyword) => input.content.toLowerCase().includes(keyword.toLowerCase()));
    const intentHit = rule.intents.length === 0 || rule.intents.includes(input.intent);
    return keywordsHit && intentHit;
  });

  if (matchedRule) {
    return {
      assignedDepartment: matchedRule.targetDepartmentSlug,
      assignedPerson: null,
      targetEmails: [matchedRule.targetEmail],
      cc: [...matchedRule.ccEmails, env.MARKETING_CC_EMAIL].filter(Boolean) as string[],
    };
  }

  const fallbackEmail = fallbackByCategory[primaryCategory] ?? env.FALLBACK_LEAD_EMAIL;
  return {
    assignedDepartment: primaryCategory === "unknown" ? "support" : primaryCategory,
    assignedPerson: null,
    targetEmails: [fallbackEmail].filter(Boolean) as string[],
    cc: [env.MARKETING_CC_EMAIL].filter(Boolean) as string[],
  };
}
