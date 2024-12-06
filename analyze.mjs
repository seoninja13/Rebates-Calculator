function transformProgram(program) {
    return {
        trans_title: program.programName,
        trans_type: program.programType,
        trans_summary: program.summary,
        trans_collapsedSummary: program.collapsedSummary,
        trans_amount: program.amount,
        trans_eligibleProjects: program.eligibleProjects,
        trans_eligibleRecipients: program.eligibleRecipients,
        trans_geographicScope: program.geographicScope,
        trans_requirements: program.requirements,
        trans_applicationProcess: program.applicationProcess,
        trans_deadline: program.deadline,
        trans_websiteLink: program.websiteLink,
        trans_contactInfo: program.contactInfo,
        trans_processingTime: program.processingTime,
        trans_category: program.category || program.type?.toLowerCase()
    };
} 