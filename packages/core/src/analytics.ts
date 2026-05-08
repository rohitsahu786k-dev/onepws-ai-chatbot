import { AuditLogModel, ChatSessionModel, EmailLogModel, JobLogModel, LeadModel, MessageModel } from "./models";

export async function getAnalyticsOverview() {
  const [
    totalLeads,
    totalSessions,
    totalQualifiedLeads,
    totalRoutedLeads,
    hotWarmCold,
    bySolution,
    byDepartment,
    languageDistribution,
    topPages,
    topSources,
    emailSuccess,
    leadsByDay,
    recentHotLeads,
    recentMessages,
    recentEmailLogs,
    recentJobLogs,
    recentAudits,
  ] = await Promise.all([
    LeadModel.countDocuments(),
    ChatSessionModel.countDocuments(),
    LeadModel.countDocuments({ status: { $in: ["qualified", "submitted", "routed"] } }),
    LeadModel.countDocuments({ assignedDepartment: { $nin: [null, "", undefined] } }),
    LeadModel.aggregate([{ $group: { _id: "$leadTemperature", count: { $sum: 1 } } }]),
    LeadModel.aggregate([{ $group: { _id: "$solutionCategory", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    LeadModel.aggregate([{ $group: { _id: "$assignedDepartment", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    LeadModel.aggregate([{ $group: { _id: "$language", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    ChatSessionModel.aggregate([{ $group: { _id: "$pageUrl", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 8 }]),
    ChatSessionModel.aggregate([{ $group: { _id: "$utmSource", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 8 }]),
    EmailLogModel.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    LeadModel.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14),
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    LeadModel.find({ leadTemperature: "hot" }).sort({ createdAt: -1 }).limit(6).select("leadId fullName company solutionCategory leadScore assignedDepartment createdAt").lean(),
    MessageModel.find().sort({ createdAt: -1 }).limit(4).select("sessionId senderType content createdAt").lean(),
    EmailLogModel.find().sort({ createdAt: -1 }).limit(4).select("type status leadId createdAt").lean(),
    JobLogModel.find().sort({ createdAt: -1 }).limit(4).select("jobType status createdAt").lean(),
    AuditLogModel.find().sort({ createdAt: -1 }).limit(4).select("action entityType createdAt").lean(),
  ]);

  const leadCaptureRate = totalSessions === 0 ? 0 : Math.round((totalLeads / totalSessions) * 100);

  return {
    totalLeads,
    totalSessions,
    totalQualifiedLeads,
    totalRoutedLeads,
    leadCaptureRate,
    leadTemperatureDistribution: hotWarmCold,
    leadsBySolutionCategory: bySolution,
    leadsByDepartment: byDepartment,
    languageDistribution,
    topLandingPages: topPages,
    topSources,
    emailSuccessRate: emailSuccess,
    leadsByDay,
    recentHotLeads,
    recentActivity: [
      ...recentMessages.map((item) => ({ type: "message", label: `${item.senderType} message`, meta: item.sessionId, createdAt: item.createdAt })),
      ...recentEmailLogs.map((item) => ({ type: "email", label: `${item.type} ${item.status}`, meta: item.leadId, createdAt: item.createdAt })),
      ...recentJobLogs.map((item) => ({ type: "job", label: `${item.jobType} ${item.status}`, meta: "", createdAt: item.createdAt })),
      ...recentAudits.map((item) => ({ type: "audit", label: item.action, meta: item.entityType, createdAt: item.createdAt })),
    ]
      .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
      .slice(0, 8),
  };
}
