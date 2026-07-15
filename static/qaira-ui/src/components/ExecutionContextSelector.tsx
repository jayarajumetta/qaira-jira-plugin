import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FormField } from "./FormField";
import { InfoTooltip } from "./InfoTooltip";
import { api } from "../lib/api";
import { countGeneratedTestDataFields, materializeTestDataRows } from "../lib/testDataGenerators";
import type { TestConfiguration, TestDataSet, TestEnvironment } from "../types";

type ExecutionContextSelectorProps = {
  projectId: string;
  appTypeId: string;
  selectedEnvironmentId: string;
  selectedConfigurationId: string;
  selectedDataSetId: string;
  onEnvironmentChange: (value: string) => void;
  onConfigurationChange: (value: string) => void;
  onDataSetChange: (value: string) => void;
  prefillFirstAvailable?: boolean;
};

function filterScopedResources<T extends { app_type_id: string | null }>(items: T[], appTypeId: string) {
  if (!appTypeId) {
    return items.filter((item) => !item.app_type_id);
  }

  return items;
}

export function ExecutionContextSelector({
  projectId,
  appTypeId,
  selectedEnvironmentId,
  selectedConfigurationId,
  selectedDataSetId,
  onEnvironmentChange,
  onConfigurationChange,
  onDataSetChange,
  prefillFirstAvailable = false
}: ExecutionContextSelectorProps) {
  const environmentPrefillScopeRef = useRef("");
  const configurationPrefillScopeRef = useRef("");
  const dataSetPrefillScopeRef = useRef("");
  const [dataPreviewRevision, setDataPreviewRevision] = useState(0);
  const environmentsQuery = useQuery({
    queryKey: ["test-environments", projectId, appTypeId],
    queryFn: () => api.testEnvironments.list({ project_id: projectId, app_type_id: appTypeId || undefined }),
    enabled: Boolean(projectId)
  });
  const configurationsQuery = useQuery({
    queryKey: ["test-configurations", projectId, appTypeId],
    queryFn: () => api.testConfigurations.list({ project_id: projectId, app_type_id: appTypeId || undefined }),
    enabled: Boolean(projectId)
  });
  const dataSetsQuery = useQuery({
    queryKey: ["test-data-sets", projectId, appTypeId],
    queryFn: () => api.testDataSets.list({ project_id: projectId, app_type_id: appTypeId || undefined }),
    enabled: Boolean(projectId)
  });

  const environments = useMemo(
    () => filterScopedResources(environmentsQuery.data || [], appTypeId),
    [appTypeId, environmentsQuery.data]
  );
  const configurations = useMemo(
    () => filterScopedResources(configurationsQuery.data || [], appTypeId),
    [appTypeId, configurationsQuery.data]
  );
  const dataSets = useMemo(
    () => filterScopedResources(dataSetsQuery.data || [], appTypeId),
    [appTypeId, dataSetsQuery.data]
  );
  const selectedDataSet = useMemo(
    () => dataSets.find((dataSet) => dataSet.id === selectedDataSetId) || null,
    [dataSets, selectedDataSetId]
  );
  const generatedFieldCount = useMemo(
    () => countGeneratedTestDataFields(selectedDataSet?.rows || []),
    [selectedDataSet]
  );
  const generatedPreviewRows = useMemo(
    () => materializeTestDataRows(selectedDataSet?.rows || []),
    [dataPreviewRevision, selectedDataSet]
  );
  const environmentPrefillScopeKey = useMemo(
    () => `${projectId}:${appTypeId}:${environments.map((item) => item.id).join(",")}`,
    [appTypeId, environments, projectId]
  );
  const configurationPrefillScopeKey = useMemo(
    () => `${projectId}:${appTypeId}:${configurations.map((item) => item.id).join(",")}`,
    [appTypeId, configurations, projectId]
  );
  const dataSetPrefillScopeKey = useMemo(
    () => `${projectId}:${appTypeId}:${dataSets.map((item) => item.id).join(",")}`,
    [appTypeId, dataSets, projectId]
  );

  const isLoading = environmentsQuery.isLoading || configurationsQuery.isLoading || dataSetsQuery.isLoading;
  const hasAnyContext = Boolean(environments.length || configurations.length || dataSets.length);

  useEffect(() => {
    if (selectedEnvironmentId && !environments.some((item) => item.id === selectedEnvironmentId)) {
      onEnvironmentChange("");
    }
  }, [environments, onEnvironmentChange, selectedEnvironmentId]);

  useEffect(() => {
    if (selectedConfigurationId && !configurations.some((item) => item.id === selectedConfigurationId)) {
      onConfigurationChange("");
    }
  }, [configurations, onConfigurationChange, selectedConfigurationId]);

  useEffect(() => {
    if (selectedDataSetId && !dataSets.some((item) => item.id === selectedDataSetId)) {
      onDataSetChange("");
    }
  }, [dataSets, onDataSetChange, selectedDataSetId]);

  useEffect(() => {
    if (!prefillFirstAvailable || selectedEnvironmentId || !environments.length) {
      return;
    }

    if (environmentPrefillScopeRef.current === environmentPrefillScopeKey) {
      return;
    }

    environmentPrefillScopeRef.current = environmentPrefillScopeKey;
    onEnvironmentChange(environments[0].id);
  }, [environmentPrefillScopeKey, environments, onEnvironmentChange, prefillFirstAvailable, selectedEnvironmentId]);

  useEffect(() => {
    if (!prefillFirstAvailable || selectedConfigurationId || !configurations.length) {
      return;
    }

    if (configurationPrefillScopeRef.current === configurationPrefillScopeKey) {
      return;
    }

    configurationPrefillScopeRef.current = configurationPrefillScopeKey;
    onConfigurationChange(configurations[0].id);
  }, [configurationPrefillScopeKey, configurations, onConfigurationChange, prefillFirstAvailable, selectedConfigurationId]);

  useEffect(() => {
    if (!prefillFirstAvailable || selectedDataSetId || !dataSets.length) {
      return;
    }

    if (dataSetPrefillScopeRef.current === dataSetPrefillScopeKey) {
      return;
    }

    dataSetPrefillScopeRef.current = dataSetPrefillScopeKey;
    onDataSetChange(dataSets[0].id);
  }, [dataSetPrefillScopeKey, dataSets, onDataSetChange, prefillFirstAvailable, selectedDataSetId]);

  return (
    <div className="execution-context-block">
      <div className="execution-context-grid">
        <ExecutionContextField
          items={environments}
          label="Test environment"
          onChange={onEnvironmentChange}
          placeholder="No test environment"
          selectedId={selectedEnvironmentId}
        />
        <ExecutionContextField
          items={configurations}
          label="Test configuration"
          onChange={onConfigurationChange}
          placeholder="No test configuration"
          selectedId={selectedConfigurationId}
        />
        <ExecutionContextField
          items={dataSets}
          label="Test data"
          onChange={onDataSetChange}
          placeholder="No test data"
          selectedId={selectedDataSetId}
        />
      </div>

      {selectedDataSet && generatedFieldCount ? (
        <section className="execution-generated-data-preview">
          <div className="execution-generated-data-preview-header">
            <div>
              <div className="execution-generated-data-title-row">
                <strong>Generated test data sample</strong>
                <InfoTooltip
                  content={`${generatedFieldCount} dynamic field${generatedFieldCount === 1 ? "" : "s"}. Fresh values are generated and retained when every run or rerun is created.`}
                  label="Generated test data information"
                />
              </div>
            </div>
            <button className="ghost-button" onClick={() => setDataPreviewRevision((current) => current + 1)} type="button">
              Refresh sample
            </button>
          </div>
          <div className="execution-generated-data-preview-rows">
            {generatedPreviewRows.slice(0, 2).map((row, index) => (
              <article key={`execution-data-preview-${index}`}>
                {Object.entries(row).map(([key, value]) => (
                  <span key={key}>
                    <strong>{key}</strong>
                    <code>{value || "-"}</code>
                  </span>
                ))}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {projectId && !isLoading && !hasAnyContext ? (
        <div className="empty-state compact">No environment, configuration, or test data resources are available for this scope yet.</div>
      ) : null}
    </div>
  );
}

function ExecutionContextField<T extends TestEnvironment | TestConfiguration | TestDataSet>({
  label,
  items,
  selectedId,
  placeholder,
  onChange
}: {
  label: string;
  items: T[];
  selectedId: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormField label={label}>
      <select value={selectedId} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} {item.app_type_id ? "· Scoped" : "· Shared"}
          </option>
        ))}
      </select>
    </FormField>
  );
}
