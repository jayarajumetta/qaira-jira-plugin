export const queryKeys = {
  appTypesAll: () => ["app-types"] as const,
  executionResults: (projectId = "") => ["execution-results", projectId] as const,
  executions: (projectId = "") => ["executions", projectId] as const,
  featureFlags: (projectId = "") => ["feature-flags", projectId] as const,
  integrations: {
    all: () => ["integrations"] as const,
    scoped: (...scope: string[]) => ["integrations", ...scope] as const
  },
  issues: (projectId = "") => ["issues", projectId] as const,
  projectMembers: (projectId = "") => ["project-members", projectId] as const,
  projects: () => ["projects"] as const,
  appTypes: (projectId: string) => ["app-types", projectId] as const,
  requirements: (projectId = "") => ["requirements", projectId] as const,
  roles: (projectId = "") => ["roles", projectId] as const,
  settings: {
    apiKeys: () => ["settings", "api-keys"] as const,
    workspacePreferences: () => ["settings", "workspace-preferences"] as const
  },
  testCases: (projectId = "") => ["test-cases", projectId] as const,
  testSuites: (projectId = "") => ["test-suites", projectId] as const,
  users: (projectId = "") => ["users", projectId] as const
};
