import { useEffect, useMemo, useRef } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Link,
  Eraser,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Subscript,
  Superscript
} from "lucide-react";

const FONT_FAMILIES = [
  "Arial",
  "Times New Roman",
  "Georgia",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Courier New"
];

const FONT_SIZES = [
  { label: "12", value: "2" },
  { label: "14", value: "3" },
  { label: "16", value: "4" },
  { label: "18", value: "5" },
  { label: "24", value: "6" }
];

export function richTextToPlainText(value) {
  const html = String(value ?? "");
  if (html.trim() === "") return "";

  if (typeof document === "undefined") {
    return html
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const temp = document.createElement("div");
  temp.innerHTML = html;
  return (temp.textContent || temp.innerText || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isRichTextEffectivelyEmpty(value) {
  return richTextToPlainText(value) === "";
}

export function normalizeRichTextValue(value) {
  const html = String(value ?? "").trim();
  return isRichTextEffectivelyEmpty(html) ? "" : html;
}

function RichTextEditor({
  value,
  onChange,
  placeholder = "Write here...",
  minHeight = 120,
  compact = false,
  className = ""
}) {
  const editorRef = useRef(null);
  const toolbarButtonClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:border-[#1E3A8A] hover:text-[#1E3A8A]";

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const normalizedValue = String(value ?? "");
    if (editor.innerHTML === normalizedValue) return;
    if (document.activeElement === editor) return;

    editor.innerHTML = normalizedValue;
  }, [value]);

  const isEmpty = useMemo(() => isRichTextEffectivelyEmpty(value), [value]);

  const emitChange = () => {
    onChange?.(editorRef.current?.innerHTML ?? "");
  };

  const runCommand = (command, commandValue = null) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();

    try {
      document.execCommand("styleWithCSS", false, true);
    } catch {
      // ignored: browser may not support this command.
    }

    document.execCommand(command, false, commandValue);
    emitChange();
  };

  const onCreateLink = () => {
    const url = window.prompt("Enter link URL", "https://");
    if (!url) return;
    runCommand("createLink", url.trim());
  };

  const toolbarPadding = compact ? "p-2" : "p-2.5";

  return (
    <div className={`rounded-xl border border-slate-300 bg-white ${className}`}>
      <div className={`flex flex-wrap items-center gap-1 border-b border-slate-200 ${toolbarPadding}`}>
        <button type="button" className={toolbarButtonClass} onClick={() => runCommand("bold")} title="Bold">
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" className={toolbarButtonClass} onClick={() => runCommand("italic")} title="Italic">
          <Italic className="h-4 w-4" />
        </button>
        <button type="button" className={toolbarButtonClass} onClick={() => runCommand("underline")} title="Underline">
          <Underline className="h-4 w-4" />
        </button>
        <button type="button" className={toolbarButtonClass} onClick={() => runCommand("strikeThrough")} title="Strike">
          <Strikethrough className="h-4 w-4" />
        </button>

        <button type="button" className={toolbarButtonClass} onClick={() => runCommand("subscript")} title="Subscript">
          <Subscript className="h-4 w-4" />
        </button>
        <button type="button" className={toolbarButtonClass} onClick={() => runCommand("superscript")} title="Superscript">
          <Superscript className="h-4 w-4" />
        </button>

        <span className="mx-1 h-6 w-px bg-slate-200" />

        <button type="button" className={toolbarButtonClass} onClick={() => runCommand("insertUnorderedList")} title="Bullet List">
          <List className="h-4 w-4" />
        </button>
        <button type="button" className={toolbarButtonClass} onClick={() => runCommand("insertOrderedList")} title="Numbered List">
          <ListOrdered className="h-4 w-4" />
        </button>

        <span className="mx-1 h-6 w-px bg-slate-200" />

        <button type="button" className={toolbarButtonClass} onClick={() => runCommand("justifyLeft")} title="Align Left">
          <AlignLeft className="h-4 w-4" />
        </button>
        <button type="button" className={toolbarButtonClass} onClick={() => runCommand("justifyCenter")} title="Align Center">
          <AlignCenter className="h-4 w-4" />
        </button>
        <button type="button" className={toolbarButtonClass} onClick={() => runCommand("justifyRight")} title="Align Right">
          <AlignRight className="h-4 w-4" />
        </button>

        <span className="mx-1 h-6 w-px bg-slate-200" />

        <select
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-[#1E3A8A]"
          defaultValue={FONT_FAMILIES[0]}
          onChange={(event) => runCommand("fontName", event.target.value)}
          title="Font Family"
        >
          {FONT_FAMILIES.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>

        <select
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-[#1E3A8A]"
          defaultValue={FONT_SIZES[1].value}
          onChange={(event) => runCommand("fontSize", event.target.value)}
          title="Font Size"
        >
          {FONT_SIZES.map((size) => (
            <option key={size.value} value={size.value}>
              {size.label}px
            </option>
          ))}
        </select>

        <input
          type="color"
          className="h-8 w-10 cursor-pointer rounded border border-slate-200 bg-white p-1"
          onChange={(event) => runCommand("foreColor", event.target.value)}
          title="Text Color"
        />

        <button type="button" className={toolbarButtonClass} onClick={onCreateLink} title="Insert Link">
          <Link className="h-4 w-4" />
        </button>

        <button type="button" className={toolbarButtonClass} onClick={() => runCommand("removeFormat")} title="Clear Format">
          <Eraser className="h-4 w-4" />
        </button>
      </div>

      <div className="relative">
        {isEmpty ? (
          <span className="pointer-events-none absolute left-3 top-2 text-sm text-slate-400">{placeholder}</span>
        ) : null}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emitChange}
          className="w-full px-3 py-2 text-sm text-slate-700 outline-none [&_a]:text-sky-700 [&_a]:underline"
          style={{ minHeight }}
        />
      </div>
    </div>
  );
}

export default RichTextEditor;
