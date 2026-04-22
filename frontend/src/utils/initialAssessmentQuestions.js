const CORE_SKILLS = [
  'Memorization',
  'Technical Comprehension',
  'Analytical Thinking',
  'Critical Thinking',
  'Problem Solving',
];

const normalizeSkillTag = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'memorization') return 'Memorization';
  if (normalized === 'technical comprehension') return 'Technical Comprehension';
  if (normalized === 'analytical thinking') return 'Analytical Thinking';
  if (normalized === 'critical thinking') return 'Critical Thinking';
  if (normalized === 'problem solving') return 'Problem Solving';

  return null;
};

const isSituationalQuestion = (question = {}) => {
  const typeValue = String(
    question?.questionType || question?.QuestionType || question?.type || ''
  ).trim().toLowerCase();

  return typeValue.includes('situational') || typeValue.includes('sitwasyonal') || typeValue.includes('situwasyonal');
};

const normalizeLessonLanguage = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'taglish' || normalized === 'filipino' || normalized === 'tagalog') {
    return 'Taglish';
  }

  return 'English';
};

const shuffleItems = (items = []) => {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }
  return next;
};

export const buildInitialAssessmentQuestions = (moduleList = [], preferredLanguage = 'English') => {
  const selectedQuestions = [];
  const preferredLessonLanguage = normalizeLessonLanguage(preferredLanguage);

  const groupedByLessonOrder = new Map();

  [...moduleList].forEach((module) => {
    const order = Number(module?.LessonOrder || 0);
    if (!Number.isFinite(order) || order < 1 || order > 7) {
      return;
    }

    if (!groupedByLessonOrder.has(order)) {
      groupedByLessonOrder.set(order, []);
    }

    groupedByLessonOrder.get(order).push(module);
  });

  const coreLessons = [...groupedByLessonOrder.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, lessonVariants]) => {
      const matchedLanguageModule = lessonVariants.find(
        (module) => normalizeLessonLanguage(module?.LessonLanguage) === preferredLessonLanguage
      );

      return matchedLanguageModule || lessonVariants[0];
    })
    .filter(Boolean);

  for (const module of coreLessons) {
    const lessonOrder = Number(module?.LessonOrder || 0);
    const lessonQuestions = Array.isArray(module?.finalQuestions) ? module.finalQuestions : [];
    const situationalQuestions = lessonQuestions
      .filter(isSituationalQuestion)
      .map((question, index) => {
        const optionsSource = Array.isArray(question?.options)
          ? question.options
          : [question?.OptionA, question?.OptionB, question?.OptionC, question?.OptionD];

        const options = optionsSource
          .map((option) => String(option || '').trim())
          .filter(Boolean)
          .slice(0, 4);

        const normalizedSkill = normalizeSkillTag(question?.skill || question?.SkillTag || question?.skillTag);
        const text = String(question?.question || question?.QuestionText || '').trim();

        return {
          ...question,
          id: question?.id || `initial-${lessonOrder}-${index}`,
          question: text,
          options,
          skill: normalizedSkill,
          questionType: 'Situational',
          lessonOrder,
          moduleId: module.ModuleID,
        };
      })
      .filter((question) => question.question && question.options.length >= 2 && question.skill);

    const poolBySkill = new Map(CORE_SKILLS.map((skill) => [skill, []]));
    situationalQuestions.forEach((question) => {
      if (poolBySkill.has(question.skill)) {
        poolBySkill.get(question.skill).push(question);
      }
    });

    const lessonSelection = [];
    const usedKeys = new Set();

    for (const skill of CORE_SKILLS) {
      const candidates = shuffleItems(poolBySkill.get(skill) || []);
      const uniqueCandidate = candidates.find((candidate) => {
        const key = `${candidate.question}::${candidate.options.join('|')}`;
        return !usedKeys.has(key);
      });

      if (!uniqueCandidate) {
        continue;
      }

      const key = `${uniqueCandidate.question}::${uniqueCandidate.options.join('|')}`;
      usedKeys.add(key);
      lessonSelection.push(uniqueCandidate);

      if (lessonSelection.length >= 5) {
        break;
      }
    }

    if (lessonSelection.length < 5) {
      const fallbackPool = shuffleItems(situationalQuestions).filter((candidate) => {
        const key = `${candidate.question}::${candidate.options.join('|')}`;
        return !usedKeys.has(key);
      });

      for (const candidate of fallbackPool) {
        lessonSelection.push(candidate);
        const key = `${candidate.question}::${candidate.options.join('|')}`;
        usedKeys.add(key);

        if (lessonSelection.length >= 5) {
          break;
        }
      }
    }

    selectedQuestions.push(...lessonSelection.slice(0, 5));
  }

  return selectedQuestions.slice(0, 35);
};

export default buildInitialAssessmentQuestions;
