// learning_skills was dropped in migration 20260428000300 — this stub
// keeps the export so legacy callers don't crash. Migrate them to
// bktApi.knowledgeStates() for skill-level analytics.
export const learningSkillsApi = {
  async analytics() {
    return [];
  },
};
