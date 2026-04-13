const shuffleArray = (items = []) => {
  const shuffled = [...items];

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[i]];
  }

  return shuffled;
};

const padQuestionOptions = (options = []) => {
  const paddedOptions = options.slice(0, 4).map((option) => String(option ?? '').trim());
  while (paddedOptions.length < 4) {
    paddedOptions.push('');
  }
  return paddedOptions;
};

const extractChoicesByLabelPattern = (value = '', regex, mapLabelToIndex) => {
  const source = String(value || '');
  const matches = Array.from(source.matchAll(regex));
  if (matches.length < 2) return [];

  const choicesByIndex = ['', '', '', ''];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const label = String(match?.[1] || '');
    const choiceIndex = mapLabelToIndex(label);

    if (choiceIndex < 0 || choiceIndex > 3) {
      continue;
    }

    const start = (match.index ?? 0) + String(match[0] || '').length;
    const end = index < matches.length - 1
      ? (matches[index + 1].index ?? source.length)
      : source.length;

    const content = source
      .slice(start, end)
      .replace(/\s+/g, ' ')
      .trim();

    if (content && !choicesByIndex[choiceIndex]) {
      choicesByIndex[choiceIndex] = content;
    }
  }

  return choicesByIndex.filter((choice) => choice.trim().length > 0).length >= 2
    ? choicesByIndex
    : [];
};

const extractChoicesFromInlineLabels = (value = '') => {
  const mergedText = String(value || '').replace(/\r/g, '\n');
  const expandedLabelText = mergedText
    .replace(/([^\s\n])([A-Da-d][).:-]\s*)/g, '$1 $2')
    .replace(/([^\s\n])([1-4][).:-]\s*)/g, '$1 $2');

  const letterChoices = extractChoicesByLabelPattern(
    expandedLabelText,
    /(?:^|[\s\n])([A-Da-d])[).:-]\s*/g,
    (label) => label.toLowerCase().charCodeAt(0) - 97
  );
  if (letterChoices.length >= 2) {
    return letterChoices;
  }

  const numberedChoices = extractChoicesByLabelPattern(
    expandedLabelText,
    /(?:^|[\s\n])([1-4])[).:-]\s*/g,
    (label) => Number.parseInt(label, 10) - 1
  );
  if (numberedChoices.length >= 2) {
    return numberedChoices;
  }

  const looseLetterMatches = expandedLabelText.match(/(?:^|[\s\n])[A-Da-d]\s+/g) || [];
  const lowerText = expandedLabelText.toLowerCase();
  const hasSequentialLooseLetters = /(?:^|[\s\n])a\s+/.test(lowerText)
    && /(?:^|[\s\n])b\s+/.test(lowerText)
    && /(?:^|[\s\n])c\s+/.test(lowerText);

  if (looseLetterMatches.length >= 3 && hasSequentialLooseLetters) {
    const looseLetterChoices = extractChoicesByLabelPattern(
      expandedLabelText,
      /(?:^|[\s\n])([A-Da-d])\s+/g,
      (label) => label.toLowerCase().charCodeAt(0) - 97
    );
    if (looseLetterChoices.length >= 2) {
      return looseLetterChoices;
    }
  }

  return [];
};

const normalizeQuestionOptionList = (optionsInput = []) => {
  const optionList = Array.isArray(optionsInput) ? optionsInput : [optionsInput];
  const asStrings = optionList.map((option) => String(option ?? ''));
  const mergedText = asStrings.join('\n').trim();

  if (!mergedText) {
    return padQuestionOptions([]);
  }

  const labeledChoices = extractChoicesFromInlineLabels(mergedText);
  if (labeledChoices.length >= 2) {
    return padQuestionOptions(labeledChoices);
  }

  const nonEmptyOptions = asStrings.filter((option) => option.trim().length > 0);
  if (nonEmptyOptions.length >= 2 && nonEmptyOptions.length <= 4) {
    return padQuestionOptions(asStrings);
  }

  const lineChoices = mergedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lineChoices.length >= 2) {
    return padQuestionOptions(lineChoices);
  }

  const delimitedChoices = mergedText
    .split(/\s*\|\s*|\s*;\s*/)
    .map((choice) => choice.trim())
    .filter(Boolean);
  if (delimitedChoices.length >= 2) {
    return padQuestionOptions(delimitedChoices);
  }

  const commaChoices = mergedText
    .split(/\s*,\s*/)
    .map((choice) => choice.trim())
    .filter(Boolean);
  if (!/\r?\n/.test(mergedText) && commaChoices.length >= 2 && commaChoices.length <= 4) {
    return padQuestionOptions(commaChoices);
  }

  return padQuestionOptions(asStrings);
};

const getCorrectAnswerIndex = (question = {}) => {
  if (Number.isInteger(question.correctAnswer)) {
    return question.correctAnswer;
  }

  if (typeof question.correctAnswer === 'string') {
    const parsedIndex = Number.parseInt(question.correctAnswer, 10);
    if (Number.isInteger(parsedIndex)) {
      return parsedIndex;
    }
  }

  return -1;
};

const resolveCorrectAnswerText = (question = {}, sourceOptions) => {
  if (typeof question.correctAnswerText === 'string') {
    return question.correctAnswerText;
  }

  const options = Array.isArray(sourceOptions)
    ? sourceOptions
    : Array.isArray(question.options)
      ? question.options
      : [];

  const correctAnswerIndex = getCorrectAnswerIndex(question);
  if (correctAnswerIndex >= 0) {
    return options[correctAnswerIndex] || '';
  }

  return typeof question.correctAnswer === 'string' ? question.correctAnswer : '';
};

const shuffleQuestionChoices = (question = {}) => {
  const options = Array.isArray(question.options) ? [...question.options] : [];
  const correctAnswerText = resolveCorrectAnswerText(question, options);
  const shuffledOptions = shuffleArray(options);
  const shuffledCorrectAnswerIndex = shuffledOptions.findIndex((option) => option === correctAnswerText);

  return {
    ...question,
    options: shuffledOptions,
    correctAnswer: shuffledCorrectAnswerIndex >= 0 ? shuffledCorrectAnswerIndex : getCorrectAnswerIndex(question),
    correctAnswerText,
  };
};

const shuffleQuestionChoicesList = (questions = []) => {
  if (!Array.isArray(questions)) {
    return [];
  }

  return questions.map((question) => shuffleQuestionChoices(question));
};

export {
  normalizeQuestionOptionList,
  shuffleArray,
  resolveCorrectAnswerText,
  shuffleQuestionChoices,
  shuffleQuestionChoicesList,
};
