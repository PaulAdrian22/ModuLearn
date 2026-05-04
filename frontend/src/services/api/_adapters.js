// Shape adapters used across the api/ modules.
//
// Why these exist: the new schema uses snake_case columns (id, is_unlocked,
// module_id, ...) but every page in the codebase reads PascalCase legacy
// fields (UserID, Is_Unlocked, ModuleID, ...). Each adapter returns the row
// with BOTH shapes so we don't have to touch ~25 page components.
//
// Long-term, callers should migrate to the snake_case fields and we drop
// the aliases. Until then, both shapes are part of the public API contract.

export const adaptModule = (m) => m && {
  ...m,
  ModuleID:        m.id,
  ModuleTitle:     m.title,
  Description:     m.description,
  LessonOrder:     m.lesson_order,
  Tesda_Reference: m.tesda_reference,
  Is_Unlocked:     m.is_unlocked,
  Is_Completed:    m.is_completed,
  LessonTime:      m.lesson_time,
  Difficulty:      m.difficulty,
  LessonLanguage:  m.lesson_language,
};

export const adaptProgress = (p) => p && {
  ...p,
  ProgressID:     p.id,
  UserID:         p.user_id,
  ModuleID:       p.module_id,
  CompletionRate: p.completion_rate,
  DateStarted:    p.date_started,
  DateCompletion: p.date_completion,
  module:         p.modules ? adaptModule(p.modules) : undefined,
};

export const adaptSimulation = (s) => s && {
  ...s,
  SimulationID:    s.id,
  ModuleID:        s.module_id,
  SimulationTitle: s.title,
  Description:     s.description,
  ActivityType:    s.activity_type,
  MaxScore:        s.max_score,
  TimeLimit:       s.time_limit,
  Instructions:    s.instructions,
  SimulationOrder: s.simulation_order,
  Is_Locked:       s.is_locked,
  ZoneData:        s.zone_data,
  progress: (s.simulation_progress?.[0]) && {
    ...s.simulation_progress[0],
    Score:            s.simulation_progress[0].score,
    Attempts:         s.simulation_progress[0].attempts,
    TimeSpent:        s.simulation_progress[0].time_spent,
    CompletionStatus: s.simulation_progress[0].completion_status,
  },
};

export const adaptAssessment = (a) => a && {
  ...a,
  AssessmentID:    a.id,
  UserID:          a.user_id,
  ModuleID:        a.module_id,
  AssessmentType:  a.type,
  DateTaken:       a.date_taken,
  TotalScore:      a.total_score,
  ResultStatus:    a.result_status,
  RetakeCount:     a.retake_count,
};

// Accepts either a normalized row OR an editor-jsonb object (which uses
// camelCase field names like questionText, correctAnswer).
export const adaptQuestion = (q) => q && {
  ...q,
  QuestionID:    q.id ?? q.questionId ?? q.question_id,
  ModuleID:      q.module_id ?? q.moduleId,
  QuestionText:  q.question_text ?? q.questionText,
  CorrectAnswer: q.correct_answer ?? q.correctAnswer,
  SkillTag:      q.skill_tag ?? q.skill ?? q.skillTag,
  QuestionType:  q.question_type ?? q.questionType ?? q.type,
};

// Profile rows: map for admin listings that read learner.UserID / .Name / .Role.
export const adaptProfileRow = (p) => p && {
  ...p,
  UserID:          p.id,
  Name:            p.name,
  Role:            p.role,
  AvatarType:      p.avatar_type,
  DefaultAvatar:   p.default_avatar,
  ProfilePicture:  p.profile_picture,
};
