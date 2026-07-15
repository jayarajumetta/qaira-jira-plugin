import type { ChangeEvent } from "react";
import type { Project } from "../types";

type ProjectDropdownProps = {
  projects: Project[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  emptyLabel?: string;
  disabled?: boolean;
};

export function ProjectDropdown({
  projects,
  value,
  onChange,
  ariaLabel,
  emptyLabel = "No projects available",
  disabled = false
}: ProjectDropdownProps) {
  const selectedValue = projects.some((project) => String(project.id) === String(value)) ? String(value) : "";

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(event.target.value);
  };

  return (
    <div className="project-dropdown">
      <select
        aria-label={ariaLabel}
        className="project-dropdown-trigger"
        disabled={disabled || !projects.length}
        onChange={handleChange}
        value={selectedValue}
      >
        {!selectedValue ? (
          <option disabled value="">
            {emptyLabel}
          </option>
        ) : null}
        {projects.map((project) => (
          <option key={project.id} value={String(project.id)}>
            {project.name}
          </option>
        ))}
      </select>
    </div>
  );
}
