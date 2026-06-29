export const normalizeLessonTime = (value) => {
  let parsed = value;

  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = null;
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { hours: 0, minutes: 30 };
  }

  const hours = Number(parsed.hours);
  const minutes = Number(parsed.minutes);

  return {
    hours: Number.isFinite(hours) ? Math.max(0, Math.floor(hours)) : 0,
    minutes: Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0,
  };
};

export const getLessonTimeTotalMinutes = (value) => {
  const { hours, minutes } = normalizeLessonTime(value);
  return hours * 60 + minutes;
};

export const formatLessonTime = (value) => {
  const totalMinutes = getLessonTimeTotalMinutes(value);

  if (totalMinutes <= 0) {
    return '0 Minutes';
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'Hour' : 'Hours'}`);
  }

  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'Minute' : 'Minutes'}`);
  }

  return parts.join(' ');
};
