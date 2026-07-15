import type { ReactNode } from "react";

type IconProps = {
  size?: number;
  strokeWidth?: number;
};

function IconFrame({
  children,
  size = 16,
  strokeWidth = 1.9
}: {
  children: ReactNode;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  );
}

export function AddIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </IconFrame>
  );
}

export function SelectAllIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <rect height="7" rx="1.5" width="7" x="4" y="4" />
      <path d="m6 7.4 1.2 1.2L9.4 6" />
      <rect height="7" rx="1.5" width="7" x="13" y="4" />
      <path d="m15 7.4 1.2 1.2L18.4 6" />
      <rect height="7" rx="1.5" width="7" x="4" y="13" />
      <path d="m6 16.4 1.2 1.2L9.4 15" />
      <rect height="7" rx="1.5" width="7" x="13" y="13" />
      <path d="m15 16.4 1.2 1.2L18.4 15" />
    </IconFrame>
  );
}

export function ClearSelectionIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <rect height="7" rx="1.5" width="7" x="4" y="4" />
      <rect height="7" rx="1.5" width="7" x="13" y="4" />
      <rect height="7" rx="1.5" width="7" x="4" y="13" />
      <rect height="7" rx="1.5" width="7" x="13" y="13" />
      <path d="M8 8 16 16" />
      <path d="m16 8-8 8" />
    </IconFrame>
  );
}

export function SaveIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M8 4v6h8V4" />
      <path d="M9 20v-6h6v6" />
    </IconFrame>
  );
}

export function UploadIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </IconFrame>
  );
}

export function ImportIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="M12 4v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 20h14" />
    </IconFrame>
  );
}

export function SparkIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="m12 3 1.9 4.9L19 10l-5.1 2.1L12 17l-1.9-4.9L5 10l5.1-2.1L12 3Z" />
    </IconFrame>
  );
}

export function SearchIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </IconFrame>
  );
}

export function FolderIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" />
    </IconFrame>
  );
}

export function IterationIcon({ size = 16 }: IconProps) {
  return (
    <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <path
        d="M6.2 14.7a7.1 7.1 0 0 1 8.7-9.3"
        stroke="#2f7dcc"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
      <path
        d="M14.7 2.9v4.7h-4.6"
        stroke="#2f7dcc"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
      <path
        d="M6 18.6h8.5"
        stroke="#2f7dcc"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
      <circle cx="11.6" cy="12.1" fill="#f28a20" r="3.9" />
      <path
        d="m9.8 12 1.25 1.25 2.35-2.55"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M15.2 16.6h5.1"
        stroke="#f28a20"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
      <path
        d="m18.2 13.7 3 2.9-3 2.9"
        stroke="#f28a20"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

export function UsersIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="M16 20a4 4 0 0 0-8 0" />
      <circle cx="12" cy="11" r="3" />
      <path d="M20 20a3.5 3.5 0 0 0-3-3.4" />
      <path d="M7 16.6A3.5 3.5 0 0 0 4 20" />
    </IconFrame>
  );
}

export function PlugIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="M9 3v6" />
      <path d="M15 3v6" />
      <path d="M7 9h10v2a5 5 0 0 1-5 5 5 5 0 0 1-5-5z" />
      <path d="M12 16v5" />
    </IconFrame>
  );
}

export function MailIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <rect height="14" rx="2" width="18" x="3" y="5" />
      <path d="m4 7 8 6 8-6" />
    </IconFrame>
  );
}

export function MessageIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H11l-4 4v-4H7.5A2.5 2.5 0 0 1 5 12.5z" />
    </IconFrame>
  );
}

export function BugIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="M8 7.5V7a4 4 0 0 1 8 0v.5" />
      <rect height="12" rx="5" width="10" x="7" y="7.5" />
      <path d="M12 11v8" />
      <path d="m8.5 4-2-2" />
      <path d="m15.5 4 2-2" />
      <path d="M4 12h3" />
      <path d="M17 12h3" />
      <path d="m5 17 2.4-1.2" />
      <path d="m18.6 15.8 2.4 1.2" />
      <path d="m5 7.5 2.3 1.2" />
      <path d="m16.7 8.7 2.3-1.2" />
    </IconFrame>
  );
}

export function PlayIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="m8 6 10 6-10 6z" />
    </IconFrame>
  );
}

export function RecordIcon({ size = 16, strokeWidth = 1.9 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <circle cx="12" cy="12" r="9" stroke="#ef0000" strokeWidth={strokeWidth} />
      <circle cx="12" cy="12" fill="#ef0000" r="6.1" stroke="none" />
    </svg>
  );
}

export function PauseIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <rect height="12" rx="1" width="4" x="7" y="6" />
      <rect height="12" rx="1" width="4" x="13" y="6" />
    </IconFrame>
  );
}

export function MoreHorizontalIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <circle cx="5" cy="12" fill="currentColor" r="1.3" stroke="none" />
      <circle cx="12" cy="12" fill="currentColor" r="1.3" stroke="none" />
      <circle cx="19" cy="12" fill="currentColor" r="1.3" stroke="none" />
    </IconFrame>
  );
}

export function MousePointerIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="m5 3 14 9-6.3 1.2 3.5 6.1-3.1 1.8-3.5-6.1L5 19z" />
    </IconFrame>
  );
}

export function CalendarIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <rect height="15" rx="2" width="18" x="3" y="5" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M3 10h18" />
    </IconFrame>
  );
}

export function LayersIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="m12 4 8 4-8 4-8-4z" />
      <path d="m4 12 8 4 8-4" />
      <path d="m4 16 8 4 8-4" />
    </IconFrame>
  );
}

export function GridIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <rect height="6" rx="1.25" width="6" x="4" y="4" />
      <rect height="6" rx="1.25" width="6" x="14" y="4" />
      <rect height="6" rx="1.25" width="6" x="4" y="14" />
      <rect height="6" rx="1.25" width="6" x="14" y="14" />
    </IconFrame>
  );
}

export function ListIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="M9 7h10" />
      <path d="M9 12h10" />
      <path d="M9 17h10" />
      <circle cx="5" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="17" r="1" fill="currentColor" stroke="none" />
    </IconFrame>
  );
}

export function ColumnsIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <rect height="14" rx="2" width="16" x="4" y="5" />
      <path d="M10 5v14" />
      <path d="M16 5v14" />
    </IconFrame>
  );
}

export function PinIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="M9 4h6" />
      <path d="M10 4v4.5L7 12h10l-3-3.5V4" />
      <path d="M12 12v8" />
    </IconFrame>
  );
}

export function SyncIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="M20 7v5h-5" />
      <path d="M4 17v-5h5" />
      <path d="M7.5 8.5A7 7 0 0 1 20 12" />
      <path d="M16.5 15.5A7 7 0 0 1 4 12" />
    </IconFrame>
  );
}

export function ArchiveIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <rect x="4" y="5" width="16" height="5" rx="1.5" />
      <path d="M6 10v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8" />
      <path d="M10 14h4" />
    </IconFrame>
  );
}

export function ActivityIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="M4 12h3l2.2-5 4.3 10 2.1-5H20" />
    </IconFrame>
  );
}

export function GoogleDriveIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="M10 4h4l5 8-2 3h-4l-3-5Z" />
      <path d="M10 4 5 12l2 3h6" />
      <path d="M7 15H5l5 5h4l3-5" />
    </IconFrame>
  );
}

export function GithubIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="M9.2 18.5c-3.5 1-3.5-2-5-2.5" />
      <path d="M14.8 18.5v-3a2.6 2.6 0 0 0-.7-2c2.2-.2 4.5-1.1 4.5-4.9a3.8 3.8 0 0 0-1-2.7 3.5 3.5 0 0 0-.1-2.7s-.9-.3-2.9 1a10.1 10.1 0 0 0-5.2 0c-2-1.3-2.9-1-2.9-1a3.5 3.5 0 0 0-.1 2.7 3.8 3.8 0 0 0-1 2.7c0 3.8 2.3 4.7 4.5 4.9a2.6 2.6 0 0 0-.7 2v3" />
    </IconFrame>
  );
}

export function MoreIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <circle cx="12" cy="6" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="18" r="1.5" />
    </IconFrame>
  );
}

export function DragHandleIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <circle cx="9" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="16" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="16" r="1" fill="currentColor" stroke="none" />
    </IconFrame>
  );
}

export function CopyIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <rect height="11" rx="2" width="11" x="9" y="9" />
      <path d="M15 9V7A2 2 0 0 0 13 5H7A2 2 0 0 0 5 7v6a2 2 0 0 0 2 2h2" />
    </IconFrame>
  );
}

export function PencilIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="m15.5 5.5 3 3" />
      <path d="M4 20h4l10.5-10.5a2.12 2.12 0 0 0-3-3L5 17z" />
    </IconFrame>
  );
}

export function TrashIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="M5 7h14" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="m7.5 7 .8 11.1A1.5 1.5 0 0 0 9.8 19.5h4.4a1.5 1.5 0 0 0 1.5-1.4L16.5 7" />
      <path d="M10 10.5v5" />
      <path d="M14 10.5v5" />
    </IconFrame>
  );
}

export function ExportIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="M12 4v12" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </IconFrame>
  );
}

export function OpenIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="M14 5h5v5" />
      <path d="M10 14 19 5" />
      <path d="M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
    </IconFrame>
  );
}

export function EyeIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.75" />
    </IconFrame>
  );
}

export function MoveIcon({ size, strokeWidth }: IconProps) {
  return (
    <IconFrame size={size} strokeWidth={strokeWidth}>
      <path d="m7 7 5-4 5 4" />
      <path d="m7 17 5 4 5-4" />
      <path d="m17 7 4 5-4 5" />
      <path d="m7 7-4 5 4 5" />
      <path d="M12 3v18" />
      <path d="M3 12h18" />
    </IconFrame>
  );
}
