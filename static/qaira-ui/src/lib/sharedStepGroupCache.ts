import type { QueryClient } from "@tanstack/react-query";
import type { SharedStepGroup } from "../types";

function compareSharedGroups(left: SharedStepGroup, right: SharedStepGroup) {
  const leftTimestamp = left.updated_at ? Date.parse(left.updated_at) : 0;
  const rightTimestamp = right.updated_at ? Date.parse(right.updated_at) : 0;

  if (rightTimestamp !== leftTimestamp) {
    return rightTimestamp - leftTimestamp;
  }

  return left.name.localeCompare(right.name);
}

export function upsertSharedStepGroupInCache(queryClient: QueryClient, appTypeId: string, group: SharedStepGroup) {
  if (!appTypeId) {
    return;
  }

  queryClient.setQueryData<SharedStepGroup[]>(["shared-step-groups", appTypeId], (current = []) =>
    [...current.filter((item) => item.id !== group.id), group].sort(compareSharedGroups)
  );
}

export function removeSharedStepGroupFromCache(queryClient: QueryClient, appTypeId: string, groupId: string) {
  if (!appTypeId) {
    return;
  }

  queryClient.setQueryData<SharedStepGroup[]>(["shared-step-groups", appTypeId], (current = []) =>
    current.filter((item) => item.id !== groupId)
  );
}
