import { type CSSProperties, type ElementType, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useCurrentProject } from "../hooks/useCurrentProject";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { api } from "../lib/api";
import { areFeatureFlagsEnabled } from "../lib/featureFlags";
import { hasPermission } from "../lib/permissions";

type RichTextEditorProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  autoFocus?: boolean;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  onAiRephrase?: (html: string, plainText: string) => Promise<string | void> | string | void;
  aiRephraseTitle?: string;
  aiRephraseContext?: {
    entityType?: string;
    entityTitle?: string;
    fieldLabel?: string;
  };
  "aria-label"?: string;
};

type RichTextContentProps = {
  value?: string | null;
  fallback?: string;
  className?: string;
  as?: ElementType;
  title?: string;
};

const ALLOWED_TAGS = new Set(["a", "b", "blockquote", "br", "code", "div", "em", "h3", "i", "li", "ol", "p", "s", "span", "strike", "strong", "u", "ul"]);
const DROPPED_TAGS = new Set(["script", "style", "iframe", "object", "embed", "link", "meta"]);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (["http:", "https:", "mailto:"].includes(parsed.protocol)) {
      return parsed.href;
    }
  } catch {
    return "";
  }

  return "";
}

function applyInlineMarkdown(value: string) {
  const escaped = escapeHtml(value);

  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)]\((https?:\/\/[^)\s]+|mailto:[^)]+)\)/g, (_match, text: string, url: string) => {
      const safeUrl = sanitizeUrl(url);
      return safeUrl ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer">${text}</a>` : text;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

function markdownToHtml(value: string) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];
  let paragraph: string[] = [];

  const flushList = () => {
    if (!listType || !listItems.length) {
      listType = null;
      listItems = [];
      return;
    }

    blocks.push(`<${listType}>${listItems.map((item) => `<li>${applyInlineMarkdown(item)}</li>`).join("")}</${listType}>`);
    listType = null;
    listItems = [];
  };

  const flushParagraph = () => {
    if (!paragraph.length) {
      return;
    }

    blocks.push(`<p>${paragraph.map(applyInlineMarkdown).join("<br>")}</p>`);
    paragraph = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(`<h3>${applyInlineMarkdown(heading[1])}</h3>`);
      return;
    }

    const quote = trimmed.match(/^>\s+(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote>${applyInlineMarkdown(quote[1])}</blockquote>`);
      return;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(unordered[1]);
      return;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(ordered[1]);
      return;
    }

    flushList();
    paragraph.push(trimmed);
  });

  flushParagraph();
  flushList();

  return blocks.join("");
}

function isLikelyHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function decodeEscapedHtmlMarkup(value: string) {
  if (!/&lt;\/?[a-z][\s\S]*?&gt;/i.test(value)) {
    return value;
  }

  if (typeof document === "undefined") {
    return value
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;/g, "'")
      .replace(/&amp;/gi, "&");
  }

  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

export function sanitizeRichTextHtml(value: string) {
  const normalizedValue = decodeEscapedHtmlMarkup(value);

  if (!normalizedValue.trim()) {
    return "";
  }

  if (typeof document === "undefined") {
    return escapeHtml(
      normalizedValue
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
  }

  const template = document.createElement("template");
  template.innerHTML = isLikelyHtml(normalizedValue) ? normalizedValue : markdownToHtml(normalizedValue);

  const cleanNode = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.textContent || "");
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();

    if (DROPPED_TAGS.has(tagName)) {
      return null;
    }

    if (!ALLOWED_TAGS.has(tagName)) {
      const fragment = document.createDocumentFragment();
      Array.from(element.childNodes).forEach((child) => {
        const cleanChild = cleanNode(child);
        if (cleanChild) {
          fragment.appendChild(cleanChild);
        }
      });
      return fragment;
    }

    const cleanElement = document.createElement(tagName);
    if (tagName === "a") {
      const safeHref = sanitizeUrl(element.getAttribute("href") || "");
      if (safeHref) {
        cleanElement.setAttribute("href", safeHref);
        cleanElement.setAttribute("target", "_blank");
        cleanElement.setAttribute("rel", "noreferrer");
      }
    }

    Array.from(element.childNodes).forEach((child) => {
      const cleanChild = cleanNode(child);
      if (cleanChild) {
        cleanElement.appendChild(cleanChild);
      }
    });

    return cleanElement;
  };

  const container = document.createElement("div");
  Array.from(template.content.childNodes).forEach((child) => {
    const cleanChild = cleanNode(child);
    if (cleanChild) {
      container.appendChild(cleanChild);
    }
  });

  return container.innerHTML;
}

export function normalizeRichTextHtml(value?: string | null) {
  return value ? sanitizeRichTextHtml(value) : "";
}

export function richTextToPlainText(value?: string | null) {
  if (!value) {
    return "";
  }

  if (typeof document === "undefined") {
    return decodeEscapedHtmlMarkup(value)
      .replace(/<[^>]+>/g, " ")
      .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
      .replace(/[*_`#>]/g, "")
      .replace(/^\s*[-\d.]+\s+/gm, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const container = document.createElement("div");
  container.innerHTML = normalizeRichTextHtml(value);
  return (container.textContent || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSelectionInside(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) {
    return false;
  }

  const node = selection.anchorNode;
  return Boolean(node && root.contains(node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode));
}

export function RichTextContent({ value, fallback = "", className = "", as: Component = "div", title }: RichTextContentProps) {
  const html = useMemo(() => normalizeRichTextHtml(value) || escapeHtml(fallback), [fallback, value]);

  if (!html) {
    return null;
  }

  return (
    <Component
      className={["rich-text-content", className].filter(Boolean).join(" ")}
      dangerouslySetInnerHTML={{ __html: html }}
      title={title}
    />
  );
}

export function RichTextEditor({
  id,
  value,
  onChange,
  rows = 4,
  placeholder,
  autoFocus,
  required,
  disabled,
  className = "",
  onAiRephrase,
  aiRephraseTitle = "Rephrase description with AI",
  aiRephraseContext,
  "aria-label": ariaLabel
}: RichTextEditorProps) {
  const { session } = useAuth();
  const [projectId] = useCurrentProject();
  const featureFlagsQuery = useFeatureFlags(Boolean(session));
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastHtmlRef = useRef("");
  const [isRephrasing, setIsRephrasing] = useState(false);
  const isEmpty = !richTextToPlainText(value);
  const canUseDefaultAiRephrase = Boolean(projectId)
    && hasPermission(session, "content.ai")
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.ai.content_rephrase"]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const nextHtml = normalizeRichTextHtml(value);
    if (document.activeElement === editor && nextHtml === lastHtmlRef.current) {
      return;
    }

    if (editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml;
    }
    lastHtmlRef.current = nextHtml;
  }, [value]);

  useEffect(() => {
    if (autoFocus && editorRef.current) {
      editorRef.current.focus();
    }
  }, [autoFocus]);

  const emitChange = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const text = (editor.textContent || "").replace(/\u00a0/g, " ").trim();
    const nextHtml = text ? sanitizeRichTextHtml(editor.innerHTML) : "";
    lastHtmlRef.current = nextHtml;
    onChange(nextHtml);
  }, [onChange]);

  const runCommand = useCallback((command: string, commandValue?: string) => {
    if (disabled) {
      return;
    }

    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.focus();
    document.execCommand(command, false, commandValue);
    emitChange();
  }, [disabled, emitChange]);

  const insertHtml = useCallback((html: string) => {
    const editor = editorRef.current;
    if (!editor || disabled) {
      return;
    }

    editor.focus();
    document.execCommand("insertHTML", false, html);
    emitChange();
  }, [disabled, emitChange]);

  const wrapSelectionWithCode = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || disabled) {
      return;
    }

    editor.focus();
    if (!isSelectionInside(editor)) {
      insertHtml("<code>code</code>");
      return;
    }

    const selection = window.getSelection();
    const selectedText = selection?.toString() || "code";
    insertHtml(`<code>${escapeHtml(selectedText)}</code>`);
  }, [disabled, insertHtml]);

  const createLink = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || disabled) {
      return;
    }

    editor.focus();
    const selection = window.getSelection();
    const selectedText = selection?.toString() || "link";
    const url = window.prompt("Link URL", "https://");
    if (url === null) {
      return;
    }

    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) {
      return;
    }

    if (selection?.rangeCount && !selection.isCollapsed && isSelectionInside(editor)) {
      document.execCommand("createLink", false, safeUrl);
      emitChange();
      return;
    }

    insertHtml(`<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer">${escapeHtml(selectedText)}</a>`);
  }, [disabled, emitChange, insertHtml]);

  const handleAiRephrase = useCallback(async () => {
    if (disabled || isRephrasing) {
      return;
    }

    const editor = editorRef.current;
    const currentHtml = normalizeRichTextHtml(editor?.innerHTML || value);
    const plainText = richTextToPlainText(currentHtml);

    if (!plainText) {
      return;
    }

    setIsRephrasing(true);
    try {
      const aiValue = onAiRephrase
        ? await onAiRephrase(currentHtml, plainText)
        : (await api.ai.rephraseRichText({
            project_id: projectId,
            content: plainText,
            content_html: currentHtml,
            entity_type: aiRephraseContext?.entityType || "rich-text authoring field",
            entity_title: aiRephraseContext?.entityTitle,
            field_label: aiRephraseContext?.fieldLabel || aiRephraseTitle.replace(/^Rephrase\s+/i, "").replace(/\s+with AI$/i, ""),
            aria_label: ariaLabel
          })).content;
      const nextValue = typeof aiValue === "string" ? aiValue : "";
      if (nextValue) {
        const nextHtml = sanitizeRichTextHtml(nextValue);
        lastHtmlRef.current = nextHtml;
        onChange(nextHtml);
        if (editor) {
          editor.innerHTML = nextHtml;
        }
      }
    } catch (error) {
      console.warn("Rich text AI rephrase failed; the original content was preserved.", error);
    } finally {
      setIsRephrasing(false);
    }
  }, [aiRephraseContext?.entityTitle, aiRephraseContext?.entityType, aiRephraseContext?.fieldLabel, aiRephraseTitle, ariaLabel, disabled, isRephrasing, onAiRephrase, onChange, projectId, value]);

  const controls: Array<{ group: "format" | "insert" | "list" | "ai"; label: ReactNode; title: string; action: () => void; disabled?: boolean }> = [
    { group: "format", label: <strong className="rich-text-tool-glyph">B</strong>, title: "Bold", action: () => runCommand("bold") },
    { group: "format", label: <em className="rich-text-tool-glyph">I</em>, title: "Italic", action: () => runCommand("italic") },
    { group: "format", label: <span className="rich-text-tool-glyph rich-text-tool-glyph--strike">S</span>, title: "Strikethrough", action: () => runCommand("strikeThrough") },
    { group: "format", label: <span className="rich-text-tool-glyph rich-text-tool-glyph--underline">U</span>, title: "Underline", action: () => runCommand("underline") },
    { group: "insert", label: <RichTextLinkIcon />, title: "Link", action: createLink },
    { group: "insert", label: <RichTextCodeIcon />, title: "Inline code", action: wrapSelectionWithCode },
    { group: "list", label: <RichTextBulletedListIcon />, title: "Bulleted list", action: () => runCommand("insertUnorderedList") },
    { group: "list", label: <RichTextNumberedListIcon />, title: "Numbered list", action: () => runCommand("insertOrderedList") },
    { group: "list", label: <RichTextIndentIcon />, title: "Indent list item", action: () => runCommand("indent") },
    { group: "ai", label: <RichTextAiRephraseIcon />, title: aiRephraseTitle, action: handleAiRephrase, disabled: isEmpty || isRephrasing || (!onAiRephrase && !canUseDefaultAiRephrase) }
  ];

  const editorStyle = {
    "--rich-text-editor-min-height": `${Math.max(3.4, rows * 1.45 + 0.95)}rem`
  } as CSSProperties;

  return (
    <div className={["rich-text-editor", className].filter(Boolean).join(" ")}>
      <div className="rich-text-editor-toolbar" aria-label="Rich text tools">
        {controls.map((control, index) => (
          <span className="rich-text-tool-slot" key={control.title}>
            {index > 0 && controls[index - 1].group !== control.group ? <span aria-hidden="true" className="rich-text-tool-divider" /> : null}
            <button
              aria-label={control.title}
              className={["rich-text-tool-button", control.group === "ai" ? "rich-text-tool-button--ai" : "", isRephrasing && control.group === "ai" ? "is-loading" : ""].filter(Boolean).join(" ")}
              disabled={disabled || control.disabled}
              onClick={control.action}
              onMouseDown={(event) => event.preventDefault()}
              title={control.title}
              type="button"
            >
              {control.label}
            </button>
          </span>
        ))}
      </div>
      <div
        aria-label={ariaLabel}
        aria-multiline="true"
        aria-required={required || undefined}
        className="rich-text-editor-surface"
        contentEditable={!disabled}
        data-empty={isEmpty ? "true" : "false"}
        data-placeholder={placeholder || ""}
        id={id}
        onBlur={emitChange}
        onInput={emitChange}
        ref={editorRef}
        role="textbox"
        style={editorStyle}
        suppressContentEditableWarning
      />
    </div>
  );
}

function RichTextToolSvg({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" fill="none" height="19" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="19">
      {children}
    </svg>
  );
}

function RichTextLinkIcon() {
  return (
    <RichTextToolSvg>
      <path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
      <path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" />
    </RichTextToolSvg>
  );
}

function RichTextCodeIcon() {
  return (
    <RichTextToolSvg>
      <path d="m8 8-4 4 4 4" />
      <path d="m16 8 4 4-4 4" />
      <path d="m14 5-4 14" />
    </RichTextToolSvg>
  );
}

function RichTextBulletedListIcon() {
  return (
    <RichTextToolSvg>
      <path d="M9 7h11" />
      <path d="M9 12h11" />
      <path d="M9 17h11" />
      <path d="M4 7h.01" />
      <path d="M4 12h.01" />
      <path d="M4 17h.01" />
    </RichTextToolSvg>
  );
}

function RichTextNumberedListIcon() {
  return (
    <RichTextToolSvg>
      <path d="M10 7h10" />
      <path d="M10 12h10" />
      <path d="M10 17h10" />
      <path d="M4 6h1v4" />
      <path d="M4 10h2" />
      <path d="M4 14.5a1.5 1.5 0 0 1 3 0c0 .7-.5 1.1-1.2 1.6L4 17.5h3" />
    </RichTextToolSvg>
  );
}

function RichTextIndentIcon() {
  return (
    <RichTextToolSvg>
      <path d="M11 7h9" />
      <path d="M11 12h9" />
      <path d="M11 17h9" />
      <path d="m4 8 3 4-3 4" />
    </RichTextToolSvg>
  );
}

export function RichTextAiRephraseIcon() {
  return (
    <RichTextToolSvg>
      <path d="m14.5 4.5 5 5" />
      <path d="m4 20 4.25-1.25L19.5 7.5l-3-3L5.25 15.75Z" />
      <path d="m13 6 3 3" />
      <path d="M5 4.5 6 7l2.5 1L6 9 5 11.5 4 9 1.5 8 4 7Z" />
      <path d="M19 14.5 20 17l2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1Z" />
    </RichTextToolSvg>
  );
}
