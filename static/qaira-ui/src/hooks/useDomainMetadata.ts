import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useDomainMetadata() {
  return useQuery({
    queryKey: ["domain-metadata"],
    queryFn: api.metadata.domain,
    staleTime: 10 * 60 * 1000
  });
}
