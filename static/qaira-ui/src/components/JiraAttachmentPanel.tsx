import { useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { JiraAttachment } from "../types";
import { LoadingState } from "./LoadingState";
import { ToastMessage } from "./ToastMessage";

function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function attachmentKind(attachment: JiraAttachment) {
  if (attachment.mimeType.startsWith("image/")) return "Image";
  if (attachment.mimeType.startsWith("video/")) return "Video";
  if (attachment.mimeType === "application/pdf") return "PDF";
  return "File";
}

async function openAttachment(attachment: JiraAttachment) {
  const blob = await api.attachments.download(attachment.id);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noreferrer";
  anchor.download = attachment.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function JiraAttachmentPanel({
  issueKey,
  canView,
  canUpload,
  canDelete,
  title = "Attachments"
}: {
  issueKey: string;
  canView: boolean;
  canUpload: boolean;
  canDelete: boolean;
  title?: string;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<JiraAttachment | null>(null);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const queryKey = ["jira-attachments", issueKey];
  const attachmentMeta = useQuery({
    queryKey: ["jira-attachment-meta"],
    queryFn: api.attachments.meta,
    enabled: Boolean(canUpload),
    staleTime: 5 * 60_000
  });
  const attachments = useQuery({
    queryKey,
    queryFn: () => api.attachments.list(issueKey),
    enabled: Boolean(issueKey && canView),
    staleTime: 30_000
  });
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      if (attachmentMeta.data?.enabled === false) throw new Error("Attachments are disabled in Jira.");
      if (!files.length || files.some((file) => file.size <= 0)) throw new Error("Choose one or more non-empty files.");
      if (files.length > 10) throw new Error("Upload at most 10 files at a time.");
      const uploadLimit = Number(attachmentMeta.data?.uploadLimit || 0);
      const oversized = uploadLimit > 0 ? files.filter((file) => file.size > uploadLimit) : [];
      if (oversized.length) {
        throw new Error(`${oversized.map((file) => file.name).join(", ")} exceed Jira's ${formatBytes(uploadLimit)} attachment limit.`);
      }
      const selected = files;
      const uploaded: JiraAttachment[] = [];
      const failures: string[] = [];
      for (let offset = 0; offset < selected.length; offset += 2) {
        const results = await Promise.allSettled(selected.slice(offset, offset + 2).map((file) => api.attachments.upload(issueKey, file)));
        results.forEach((result, index) => {
          if (result.status === "fulfilled") uploaded.push(result.value);
          else failures.push(`${selected[offset + index].name}: ${result.reason instanceof Error ? result.reason.message : "upload failed"}`);
        });
      }
      if (failures.length) throw new Error(`${uploaded.length} uploaded; ${failures.length} failed. ${failures.join(" ")}`);
      return uploaded;
    },
    onSuccess: (items) => {
      setMessageTone("success");
      setMessage(`${items.length} attachment${items.length === 1 ? "" : "s"} added to Jira.`);
    },
    onError: (error) => {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to upload attachments.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey })
  });
  const remove = useMutation({
    mutationFn: (attachmentId: string) => api.attachments.delete(attachmentId),
    onSuccess: () => {
      setDeleteCandidate(null);
      setMessageTone("success");
      setMessage("Attachment deleted from Jira.");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to delete the attachment.");
    }
  });
  const view = useMutation({
    mutationFn: openAttachment,
    onError: (error) => {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to open the attachment.");
    }
  });

  if (!canView) return null;

  const chooseFiles = (files: FileList | null) => {
    if (!canUpload || !files?.length) return;
    void upload.mutateAsync(Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    chooseFiles(event.dataTransfer.files);
  };

  return (
    <section className="jira-attachment-panel" aria-label={`${title} for ${issueKey}`}>
      <div className="jira-attachment-head">
        <div>
          <strong>{title}</strong>
          <span>{attachments.data?.length || 0} on {issueKey}</span>
        </div>
        {canUpload && attachmentMeta.data?.enabled !== false ? (
          <button className="primary-button compact" disabled={upload.isPending} onClick={() => fileInputRef.current?.click()} type="button">
            <JiraAttachmentIcon />
            <span>{upload.isPending ? "Uploading…" : "Add files"}</span>
          </button>
        ) : null}
      </div>

      {canUpload && attachmentMeta.data?.enabled !== false ? (
        <div
          className={isDragging ? "jira-attachment-dropzone is-dragging" : "jira-attachment-dropzone"}
          onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <input hidden multiple onChange={(event) => chooseFiles(event.target.files)} ref={fileInputRef} type="file" />
          <JiraAttachmentIcon />
          <span>Drop images, videos, or files here</span>
        </div>
      ) : null}

      {canUpload && attachmentMeta.data?.enabled === false ? <div className="inline-error">Attachments are disabled in Jira.</div> : null}
      {attachmentMeta.error ? <div className="inline-error">{attachmentMeta.error instanceof Error ? attachmentMeta.error.message : "Unable to load Jira attachment settings."}</div> : null}

      {attachments.isLoading ? <LoadingState label="Loading attachments" /> : null}
      {attachments.error ? <div className="inline-error">{attachments.error instanceof Error ? attachments.error.message : "Unable to load attachments."}</div> : null}

      <div className="jira-attachment-grid">
        {(attachments.data || []).map((attachment) => (
          <article className="jira-attachment-card" key={attachment.id}>
            <button className="jira-attachment-preview" disabled={view.isPending} onClick={() => void view.mutateAsync(attachment)} type="button">
              {attachment.thumbnail && attachment.mimeType.startsWith("image/") ? <img alt="" src={attachment.thumbnail} /> : <FileKindIcon kind={attachmentKind(attachment)} />}
            </button>
            <div className="jira-attachment-copy">
              <strong title={attachment.filename}>{attachment.filename}</strong>
              <span>{attachmentKind(attachment)} · {formatBytes(attachment.size)}</span>
              <small>{attachment.author?.displayName || "Jira user"}</small>
            </div>
            <div className="jira-attachment-actions">
              <button className="ghost-button compact" disabled={view.isPending} onClick={() => void view.mutateAsync(attachment)} type="button">Open</button>
              {canDelete ? <button className="ghost-button compact danger" disabled={remove.isPending} onClick={() => setDeleteCandidate(attachment)} type="button">Delete</button> : null}
            </div>
          </article>
        ))}
      </div>
      {!attachments.isLoading && !attachments.data?.length ? <div className="empty-state compact">No attachments yet.</div> : null}

      {deleteCandidate ? (
        <div className="jira-attachment-confirm" role="alert">
          <span>Delete {deleteCandidate.filename} from Jira?</span>
          <div>
            <button className="ghost-button compact" onClick={() => setDeleteCandidate(null)} type="button">Cancel</button>
            <button className="ghost-button compact danger" disabled={remove.isPending} onClick={() => void remove.mutateAsync(deleteCandidate.id)} type="button">Delete</button>
          </div>
        </div>
      ) : null}
      {message ? <ToastMessage message={message} onDismiss={() => setMessage("")} tone={messageTone} /> : null}
    </section>
  );
}

export function JiraAttachmentIcon() {
  return <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="16"><path d="m20.5 11.5-8.7 8.7a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7L9 17.4a2 2 0 1 1-2.8-2.8l8.5-8.5" /></svg>;
}

function FileKindIcon({ kind }: { kind: string }) {
  return <span className="jira-attachment-file-kind"><JiraAttachmentIcon /><strong>{kind}</strong></span>;
}
