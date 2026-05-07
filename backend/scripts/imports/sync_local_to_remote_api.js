const LOCAL_API_BASE = process.env.LOCAL_API_BASE || 'http://localhost:5000/api';
const REMOTE_API_BASE = process.env.REMOTE_API_BASE || 'https://modulearn-api-260412162638.azurewebsites.net/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@modulearn.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const normalizeLanguage = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'taglish' || normalized === 'filipino' || normalized === 'tagalog') {
    return 'Taglish';
  }
  return 'English';
};

const toBool = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }

  return false;
};

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let parsed;

  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    const errorMessage = typeof parsed === 'object' && parsed !== null
      ? JSON.stringify(parsed)
      : String(parsed || response.statusText);
    throw new Error(`${response.status} ${response.statusText} -> ${errorMessage}`);
  }

  return parsed;
};

const login = async (apiBase) => {
  const payload = { email: ADMIN_EMAIL, password: ADMIN_PASSWORD };
  const data = await requestJson(`${apiBase}/auth/login`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!data || !data.token) {
    throw new Error(`Login succeeded but token missing for ${apiBase}`);
  }

  return data.token;
};

const authedGet = async (apiBase, token, path) => {
  return requestJson(`${apiBase}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

const authedPost = async (apiBase, token, path, body) => {
  return requestJson(`${apiBase}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
};

const authedPut = async (apiBase, token, path, body) => {
  return requestJson(`${apiBase}${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
};

const buildUpdatePayload = (localModule) => {
  const payload = {
    ModuleTitle: localModule.ModuleTitle,
    Description: localModule.Description,
    LessonOrder: localModule.LessonOrder,
    Tesda_Reference: localModule.Tesda_Reference,
    LessonTime: localModule.LessonTime,
    Difficulty: localModule.Difficulty,
    sections: localModule.sections,
    diagnosticQuestions: localModule.diagnosticQuestions,
    reviewQuestions: localModule.reviewQuestions,
    finalQuestions: localModule.finalQuestions,
    finalInstruction: localModule.finalInstruction,
    roadmapStages: localModule.roadmapStages,
  };

  if (localModule.LessonLanguage) {
    payload.LessonLanguage = localModule.LessonLanguage;
  }

  return payload;
};

const main = async () => {
  console.log('Logging in to local and remote APIs...');
  const localToken = await login(LOCAL_API_BASE);
  const remoteToken = await login(REMOTE_API_BASE);

  console.log('Fetching module lists...');
  const localAdminModules = await authedGet(LOCAL_API_BASE, localToken, '/admin/modules');
  const remoteAdminModules = await authedGet(REMOTE_API_BASE, remoteToken, '/admin/modules');

  const remoteByLessonOrder = new Map();
  const remoteByOrderLanguage = new Map();

  for (const moduleRow of remoteAdminModules) {
    if (toBool(moduleRow.Is_Deleted)) continue;

    const lessonOrder = Number(moduleRow.LessonOrder);
    const language = normalizeLanguage(moduleRow.LessonLanguage);
    const orderKey = lessonOrder;
    const orderLanguageKey = `${lessonOrder}|${language}`;

    if (!remoteByLessonOrder.has(orderKey)) {
      remoteByLessonOrder.set(orderKey, []);
    }
    if (!remoteByOrderLanguage.has(orderLanguageKey)) {
      remoteByOrderLanguage.set(orderLanguageKey, []);
    }

    remoteByLessonOrder.get(orderKey).push(moduleRow);
    remoteByOrderLanguage.get(orderLanguageKey).push(moduleRow);
  }

  for (const [key, list] of remoteByLessonOrder.entries()) {
    list.sort((a, b) => Number(a.ModuleID) - Number(b.ModuleID));
    remoteByLessonOrder.set(key, list);
  }

  for (const [key, list] of remoteByOrderLanguage.entries()) {
    list.sort((a, b) => Number(a.ModuleID) - Number(b.ModuleID));
    remoteByOrderLanguage.set(key, list);
  }

  const localSorted = [...localAdminModules].sort(
    (a, b) => Number(a.LessonOrder || 0) - Number(b.LessonOrder || 0)
  );

  let updatedCount = 0;
  let createdCount = 0;
  const usedRemoteModuleIds = new Set();

  for (const localSummary of localSorted) {
    const lessonOrder = Number(localSummary.LessonOrder);
    const lessonLanguage = normalizeLanguage(localSummary.LessonLanguage);

    // Pull full local payload from public module endpoint where JSON fields are already parsed.
    const localDetail = await authedGet(LOCAL_API_BASE, localToken, `/modules/${localSummary.ModuleID}`);

    const orderLanguageKey = `${lessonOrder}|${lessonLanguage}`;
    const exactLanguageCandidates = (remoteByOrderLanguage.get(orderLanguageKey) || [])
      .filter((row) => !usedRemoteModuleIds.has(Number(row.ModuleID)));

    const orderCandidates = (remoteByLessonOrder.get(lessonOrder) || [])
      .filter((row) => !usedRemoteModuleIds.has(Number(row.ModuleID)));

    let target = exactLanguageCandidates[0] || orderCandidates[0];

    if (!target) {
      const createPayload = buildUpdatePayload(localDetail);
      await authedPost(REMOTE_API_BASE, remoteToken, '/admin/modules', createPayload);

      // Refresh remote mapping for this lesson order and language after create.
      const refreshedRemoteModules = await authedGet(REMOTE_API_BASE, remoteToken, '/admin/modules');

      const refreshedForOrder = refreshedRemoteModules
        .filter((row) => !toBool(row.Is_Deleted) && Number(row.LessonOrder) === lessonOrder)
        .sort((a, b) => Number(a.ModuleID) - Number(b.ModuleID));

      const refreshedForOrderLanguage = refreshedRemoteModules
        .filter((row) => {
          return !toBool(row.Is_Deleted)
            && Number(row.LessonOrder) === lessonOrder
            && normalizeLanguage(row.LessonLanguage) === lessonLanguage;
        })
        .sort((a, b) => Number(a.ModuleID) - Number(b.ModuleID));

      if (!refreshedForOrder.length) {
        throw new Error(`Module create reported success but lesson order ${lessonOrder} not found on remote.`);
      }

      target = refreshedForOrderLanguage[0] || refreshedForOrder[0];
      remoteByLessonOrder.set(lessonOrder, refreshedForOrder);
      remoteByOrderLanguage.set(orderLanguageKey, refreshedForOrderLanguage);
      createdCount += 1;
      console.log(`Created remote module for lesson order ${lessonOrder} (${lessonLanguage}) (ModuleID=${target.ModuleID}).`);
    }

    // Ensure record is editable and active.
    await authedPut(REMOTE_API_BASE, remoteToken, `/admin/modules/${target.ModuleID}/restore`, {});
    await authedPut(REMOTE_API_BASE, remoteToken, `/admin/modules/${target.ModuleID}/completion`, {
      isCompleted: false,
    });

    const updatePayload = buildUpdatePayload(localDetail);
    await authedPut(REMOTE_API_BASE, remoteToken, `/admin/modules/${target.ModuleID}`, updatePayload);

    // Restore lock/completion flags to match local state.
    await authedPut(REMOTE_API_BASE, remoteToken, `/admin/modules/${target.ModuleID}/lock-state`, {
      isUnlocked: toBool(localSummary.Is_Unlocked),
    });

    await authedPut(REMOTE_API_BASE, remoteToken, `/admin/modules/${target.ModuleID}/completion`, {
      isCompleted: toBool(localSummary.Is_Completed),
    });

    usedRemoteModuleIds.add(Number(target.ModuleID));
    updatedCount += 1;
    console.log(`Synced lesson order ${lessonOrder} (${lessonLanguage}) -> remote ModuleID=${target.ModuleID}`);
  }

  console.log(`Sync finished. Updated=${updatedCount}, Created=${createdCount}`);
};

main().catch((error) => {
  console.error('Sync failed:', error.message);
  process.exit(1);
});
