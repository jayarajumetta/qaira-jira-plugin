import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
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

export function useWorkspaceData(options: WorkspaceDataOptions = {}) {
  const [projectId] = useCurrentProject();
  const requested = (resource: WorkspaceResource) => options[resource] !== false;
  const scoped = (resource: WorkspaceResource) => Boolean(projectId) && requested(resource);
  const common = { staleTime: WORKSPACE_QUERY_STALE_TIME_MS };
  const users = useQuery({ queryKey: queryKeys.users(projectId), queryFn: api.users.list, enabled: scoped("users"), ...common });
  const roles = useQuery({ queryKey: queryKeys.roles(projectId), queryFn: api.roles.list, enabled: scoped("roles"), ...common });
  const projects = useQuery({ queryKey: queryKeys.projects(), queryFn: api.projects.list, enabled: requested("projects"), ...common });
  const projectMembers = useQuery({ queryKey: queryKeys.projectMembers(projectId), queryFn: () => api.projectMembers.list({ project_id: projectId }), enabled: scoped("projectMembers"), ...common });
  const appTypes = useQuery({ queryKey: queryKeys.appTypes(projectId), queryFn: () => api.appTypes.list({ project_id: projectId }), enabled: scoped("appTypes"), ...common });
  const requirements = useQuery({ queryKey: queryKeys.requirements(projectId), queryFn: () => api.requirements.list({ project_id: projectId }), enabled: scoped("requirements"), ...common });
  const issuesProjection = options.issuesProjection || "detail";
  const issues = useQuery({
    queryKey: [...queryKeys.issues(projectId), issuesProjection],
    queryFn: () => api.issues.list({ project_id: projectId, projection: issuesProjection }),
    enabled: scoped("issues"),
    ...common
  });
  const testSuites = useQuery({ queryKey: queryKeys.testSuites(projectId), queryFn: () => api.testSuites.list(), enabled: scoped("testSuites"), ...common });
  const testCasesProjection = options.testCasesProjection || "detail";
  const testCases = useQuery({
    queryKey: [...queryKeys.testCases(projectId), testCasesProjection],
    queryFn: () => api.testCases.list({ projection: testCasesProjection, page_size: 100 }),
    enabled: scoped("testCases"),
    ...common
  });
  const executions = useQuery({ queryKey: queryKeys.executions(projectId), queryFn: () => api.executions.list({ project_id: projectId }), enabled: scoped("executions"), ...common });
  const executionResults = useQuery({ queryKey: queryKeys.executionResults(projectId), queryFn: () => api.executionResults.list(), enabled: scoped("executionResults"), ...common });

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
