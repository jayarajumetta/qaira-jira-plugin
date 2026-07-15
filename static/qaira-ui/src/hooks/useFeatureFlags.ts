import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import { useCurrentProject } from "./useCurrentProject";

const FEATURE_FLAGS_STALE_TIME_MS = 60 * 1000;

export function useFeatureFlags(enabled = true) {
  const [projectId] = useCurrentProject();
  return useQuery({
    queryKey: queryKeys.featureFlags(projectId),
    queryFn: api.featureFlags.snapshot,
    enabled: enabled && Boolean(projectId),
    retry: 1,
    staleTime: FEATURE_FLAGS_STALE_TIME_MS
  });
}
