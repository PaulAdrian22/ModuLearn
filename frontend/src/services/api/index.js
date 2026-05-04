// Barrel re-export for the api/ domain modules.
//
// Existing pages import from `'../services/api'` — Node resolves that to
// this index.js, so nothing in consumer code has to change.
//
// New code can import directly from a domain module, e.g.
//   `import { modulesApi } from '../services/api/modules';`
// for tighter dependency edges.

export { profileApi }        from './profiles';
export { modulesApi }        from './modules';
export { progressApi }       from './progress';
export { questionsApi }      from './questions';
export { assessmentsApi }    from './assessments';
export { learningSkillsApi } from './learningSkills';
export { simulationsApi }    from './simulations';
export { storageApi }        from './storage';
export { usersApi }          from './users';
export { bktApi }            from './bkt';
export { reportsApi }        from './reports';
export { mediaApi }          from './media';
export { adminApi }          from './admin';
