const formatDisplayId = (value: string) => value.replace(/^RC([_-]?)/i, "Story$1");

export function DisplayIdBadge({
  value,
  href,
  title
}: {
  value: string;
  href?: string | null;
  title?: string;
}) {
  const content = <code>{formatDisplayId(value)}</code>;

  if (href) {
    return (
      <a
        className="display-id-badge display-id-badge--link"
        href={href}
        onClick={(event) => event.stopPropagation()}
        rel="noreferrer"
        target="_blank"
        title={title || `Open ${formatDisplayId(value)} in Jira`}
      >
        {content}
      </a>
    );
  }

  return (
    <span className="display-id-badge">
      {content}
    </span>
  );
}
