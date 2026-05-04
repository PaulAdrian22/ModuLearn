// Centralized route paths. Use ROUTES.DASHBOARD instead of '/dashboard'
// in <Link to=...> and navigate(...) calls so a route rename only needs
// one change here.

export const ROUTES = Object.freeze({
  // Public
  LANDING:       '/',
  ABOUT:         '/about',
  LOGIN:         '/login',
  REGISTER:      '/register',

  // Student
  DASHBOARD:           '/dashboard',
  LESSONS:             '/lessons',
  PROGRESS:            '/progress',
  PROFILE:             '/profile',
  INITIAL_ASSESSMENT:  '/initial-assessment',
  MODULE:              (id) => `/module/${id}`,
  ASSESSMENT:          (assessmentId) => `/assessment/${assessmentId}`,
  FINAL_ASSESSMENT:    (moduleId) => `/final-assessment/${moduleId}`,
  SIMULATIONS:         '/simulations',
  SIMULATION:          (id) => `/simulation/${id}`,

  // Admin
  ADMIN_DASHBOARD:           '/admin/dashboard',
  ADMIN_LESSONS:             '/admin/lessons',
  ADMIN_LESSON_ADD:          '/admin/lessons/add',
  ADMIN_LESSON_EDIT:         (id) => `/admin/lessons/edit/${id}`,
  ADMIN_LEARNERS:            '/admin/learners',
  ADMIN_SETTINGS:            '/admin/settings',
  ADMIN_SIMULATIONS:         '/admin/simulations',
  ADMIN_SIMULATION_EDIT:     (id) => `/admin/simulations/${id}`,
});
