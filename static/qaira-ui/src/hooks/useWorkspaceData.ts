import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { asArray } from "../lib/collectionGuards";
import { queryKeys } from "../lib/queryKeys";
import { useCurrentProject } from "./useCurrentProject";

type WorkspaceResource =
  | "users"
  | "roles"
  | "projects"
  | "projectMembers"
  | "appTypes"
  | "requirements"
  | "issues"
  | "testSuites"
  | "testCases"
  | "executions"
  | "executionResults";

type WorkspaceDataOptions = Partial<Record<WorkspaceResource, boolean>> & {
  issuesProjection?: "summary" | "detail";
  testCasesProjection?: "summary" | "detail";
};

const WORKSPACE_QUERY_STALE_TIME_MS = 30_000;
const WORKSPACE_SUMMARY_PAGE_SIZE = 100;

export function useWorkspaceData(options: WorkspaceDataOptions = {}) {
  const [projectId] = useCurrentProject();
  const requested = (resource: WorkspaceResource) => options[resource] !== false;
  const scoped = (resource: WorkspaceResource) => Boolean(projectId) && requested(resource);
  const common = { staleTime: WORKSPACE_QUERY_STALE_TIME_MS };
  const users = useQuery({ queryKey: queryKeys.users(projectId), queryFn: async () => asArray(await api.users.list()), enabled: scoped("users"), ...common });
  const roles = useQuery({ queryKey: queryKeys.roles(projectId), queryFn: async () => asArray(await api.roles.list()), enabled: scoped("roles"), ...common });
  const projects = useQuery({ queryKey: queryKeys.projects(), queryFn: async () => asArray(await api.projects.list()), enabled: requested("projects"), ...common });
  const projectMembers = useQuery({ queryKey: queryKeys.projectMembers(projectId), queryFn: async () => asArray(await api.projectMembers.list({ project_id: projectId })), enabled: scoped("projectMembers"), ...common });
  const appTypes = useQuery({ queryKey: queryKeys.appTypes(projectId), queryFn: async () => asArray(await api.appTypes.list({ project_id: projectId })), enabled: scoped("appTypes"), ...common });
  const requirements = useQuery({
    queryKey: queryKeys.requirements(projectId),
    queryFn: async () => asArray(await api.requirements.list({
      project_id: projectId,
      page_size: WORKSPACE_SUMMARY_PAGE_SIZE,
      projection: "summary"
    })),
    enabled: scoped("requirements"),
    ...common
  });
  const issuesProjection = options.issuesProjection || "detail";
  const issues = useQuery({
    queryKey: [...queryKeys.issues(projectId), issuesProjection],
    queryFn: async () => asArray(await api.issues.list({
      project_id: projectId,
      page_size: WORKSPACE_SUMMARY_PAGE_SIZE,
      projection: issuesProjection
    })),
    enabled: scoped("issues"),
    ...common
  });
  const testSuites = useQuery({ queryKey: queryKeys.testSuites(projectId), queryFn: async () => asArray(await api.testSuites.list()), enabled: scoped("testSuites"), ...common });
  const testCasesProjection = options.testCasesProjection || "detail";
  const testCases = useQuery({
    queryKey: [...queryKeys.testCases(projectId), testCasesProjection],
    queryFn: async () => asArray(await api.testCases.list({ projection: testCasesProjection, page_size: WORKSPACE_SUMMARY_PAGE_SIZE })),
    enabled: scoped("testCases"),
    ...common
  });
  const executions = useQuery({ queryKey: queryKeys.executions(projectId), queryFn: async () => asArray(await api.executions.list({ project_id: projectId })), enabled: scoped("executions"), ...common });
  const executionResults = useQuery({ queryKey: queryKeys.executionResults(projectId), queryFn: async () => asArray(await api.executionResults.list()), enabled: scoped("executionResults"), ...common });

  return {
    users,
    roles,
    projects,
    projectMembers,
    appTypes,
    requirements,
    issues,
    testSuites,
    testCases,
    executions,
    executionResults
  };
}
