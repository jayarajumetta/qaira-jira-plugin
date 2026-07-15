import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import { useCurrentProject } from "./useCurrentProject";

export function useWorkspaceData() {
  const [projectId] = useCurrentProject();
  const scopedQuery = { enabled: Boolean(projectId) };
  const users = useQuery({ queryKey: queryKeys.users(projectId), queryFn: api.users.list, ...scopedQuery });
  const roles = useQuery({ queryKey: queryKeys.roles(projectId), queryFn: api.roles.list, ...scopedQuery });
  const projects = useQuery({ queryKey: queryKeys.projects(), queryFn: api.projects.list });
  const projectMembers = useQuery({ queryKey: queryKeys.projectMembers(projectId), queryFn: () => api.projectMembers.list({ project_id: projectId }), ...scopedQuery });
  const appTypes = useQuery({ queryKey: [...queryKeys.appTypesAll(), projectId], queryFn: () => api.appTypes.list({ project_id: projectId }), ...scopedQuery });
  const requirements = useQuery({ queryKey: queryKeys.requirements(projectId), queryFn: () => api.requirements.list({ project_id: projectId }), ...scopedQuery });
  const issues = useQuery({ queryKey: queryKeys.issues(projectId), queryFn: () => api.issues.list({ project_id: projectId, projection: "detail" }), ...scopedQuery });
  const testSuites = useQuery({ queryKey: queryKeys.testSuites(projectId), queryFn: () => api.testSuites.list(), ...scopedQuery });
  const testCases = useQuery({
    queryKey: queryKeys.testCases(projectId),
    queryFn: () => api.testCases.list({ projection: "detail", page_size: 100 }),
    ...scopedQuery
  });
  const executions = useQuery({ queryKey: queryKeys.executions(projectId), queryFn: () => api.executions.list({ project_id: projectId }), ...scopedQuery });
  const executionResults = useQuery({ queryKey: queryKeys.executionResults(projectId), queryFn: () => api.executionResults.list(), ...scopedQuery });

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
