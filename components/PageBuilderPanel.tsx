"use client";

import { useEffect, useMemo, useState } from "react";
import type { CanvasPageRegistryEntry } from "@/content/canvas";

type PageBuilderPanelProps = {
  currentSlug: string;
  pagesOverride?: CanvasPageRegistryEntry[];
  onSelectPage?: (slug: string) => void;
  getPageHref?: (slug: string) => string;
  onCreatePage?: (title: string, slug: string) => void;
  onDuplicatePage?: (title?: string, slug?: string) => void;
  onUpdatePage?: (oldSlug: string, title: string, slug: string) => void;
  onDeletePage?: (slug: string) => void;
};

function displayPath(slug: string) {
  return slug ? `/${slug}` : "/";
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function PageBuilderPanel({ currentSlug, pagesOverride, onSelectPage, getPageHref, onCreatePage, onDuplicatePage, onUpdatePage, onDeletePage }: PageBuilderPanelProps) {
  const [pages, setPages] = useState<CanvasPageRegistryEntry[]>([]);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingOldSlug, setEditingOldSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [status, setStatus] = useState("");
  const [collapsed, setCollapsed] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [titleRequired, setTitleRequired] = useState(false);
  const [slugRequired, setSlugRequired] = useState(false);

  const currentPage = useMemo(() => pages.find((page) => page.slug === currentSlug), [currentSlug, pages]);
  const currentPath = displayPath(currentSlug);
  const copyTitlePlaceholder = `${currentPage?.title || currentSlug || "Home"} Copy`;
  const copySlugPlaceholder = `${slugify(currentPage?.title || currentSlug || "home")}-copy`;
  const protectedPage = currentSlug === "";
  const editingProtectedPage = mode === "edit" && editingOldSlug === "";

  useEffect(() => {
    if (pagesOverride) {
      setPages(pagesOverride);
      return;
    }

    let active = true;

    fetch("/api/dev-pages/list")
      .then((response) => response.json())
      .then((data: { pages?: CanvasPageRegistryEntry[] }) => {
        if (active) {
          setPages(data.pages ?? []);
        }
      })
      .catch(() => setStatus("could not load pages"));

    return () => {
      active = false;
    };
  }, [pagesOverride]);

  function updateTitle(nextTitle: string) {
    setTitle(nextTitle);
    setTitleRequired(false);

    if (!slugTouched) {
      setSlug(slugify(nextTitle));
      setSlugRequired(false);
    }
  }

  function updateSlug(nextSlug: string) {
    if (editingProtectedPage) {
      return;
    }

    setSlugTouched(true);
    setSlug(slugify(nextSlug));
    setSlugRequired(false);
  }

  async function createPage() {
    const nextTitle = title.trim();
    const nextSlug = slug.trim();

    if (!nextTitle) {
      setTitleRequired(true);
      setStatus("");
      return;
    }

    if (!nextSlug) {
      setSlugRequired(true);
      setStatus("");
      return;
    }

    setStatus("creating");

    if (onCreatePage) {
      onCreatePage(nextTitle, nextSlug);
      cancelEdit();
      return;
    }

    const response = await fetch("/api/dev-pages/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: nextTitle, slug: nextSlug }),
    });
    const data = (await response.json()) as { url?: string; error?: string };

    if (!response.ok || !data.url) {
      setStatus(data.error ?? "page failed");
      return;
    }

    window.location.href = `${data.url}&background=1`;
  }

  async function duplicatePage() {
    setStatus("duplicating");

    if (onDuplicatePage) {
      onDuplicatePage(title.trim() || undefined, slug.trim() || undefined);
      cancelEdit();
      return;
    }

    const response = await fetch("/api/dev-pages/duplicate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromSlug: currentSlug, title: title.trim() || undefined, slug: slug.trim() || undefined }),
    });
    const data = (await response.json()) as { url?: string; error?: string };

    if (!response.ok || !data.url) {
      setStatus(data.error ?? "duplicate failed");
      return;
    }

    window.location.href = data.url;
  }

  async function updatePage() {
    const nextTitle = title.trim();
    const nextSlug = editingProtectedPage ? editingOldSlug : slug.trim();

    if (!nextTitle) {
      setTitleRequired(true);
      setStatus("");
      return;
    }

    if (!nextSlug && editingOldSlug !== "" && !editingProtectedPage) {
      setSlugRequired(true);
      setStatus("");
      return;
    }

    setStatus("updating");

    if (onUpdatePage) {
      onUpdatePage(editingOldSlug, nextTitle, nextSlug);
      cancelEdit();
      return;
    }

    const response = await fetch("/api/dev-pages/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldSlug: editingOldSlug, title: nextTitle, slug: nextSlug }),
    });
    const data = (await response.json()) as { url?: string; error?: string };

    if (!response.ok || !data.url) {
      setStatus(data.error ?? "update failed");
      return;
    }

    window.location.href = data.url;
  }

  function editCurrentPage(page: CanvasPageRegistryEntry) {
    setMode("edit");
    setEditingOldSlug(page.slug);
    setTitle(page.title);
    setSlug(page.slug);
    setSlugTouched(false);
    setStatus("");
    setTitleRequired(false);
    setSlugRequired(false);
    setConfirmDelete(false);
  }

  function cancelEdit() {
    setMode("create");
    setEditingOldSlug("");
    setTitle("");
    setSlug("");
    setSlugTouched(false);
    setStatus("");
    setTitleRequired(false);
    setSlugRequired(false);
  }

  async function deletePage() {
    if (protectedPage) {
      setStatus("Protected page cannot be deleted.");
      setConfirmDelete(false);
      return;
    }

    setStatus("deleting");

    if (onDeletePage) {
      onDeletePage(currentSlug);
      setConfirmDelete(false);
      return;
    }

    const response = await fetch("/api/dev-pages/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: currentSlug }),
    });
    const data = (await response.json()) as { url?: string; error?: string };

    if (!response.ok || !data.url) {
      setStatus(data.error ?? "delete failed");
      return;
    }

    window.location.href = data.url;
  }

  if (collapsed) {
    return (
      <button type="button" className="page-builder-collapsed" onClick={() => setCollapsed(false)}>
        PAGES / {currentPath}
      </button>
    );
  }

  return (
    <aside className="page-builder-panel">
      <div className="page-builder-topline">
        <button type="button" className="canvas-inspector-collapse-button" onClick={() => setCollapsed(true)}>
          Collapse
        </button>
      </div>

      <div className="page-builder-list">
        {pages.map((page) => (
          <a
            key={page.file}
            className={`page-builder-row ${page.slug === currentSlug ? "is-active" : ""}`}
            href={getPageHref ? getPageHref(page.slug) : `${displayPath(page.slug)}?edit=1`}
            onClick={(event) => {
              if (onSelectPage) {
                event.preventDefault();
                onSelectPage(page.slug);
                return;
              }

              if (page.slug !== currentSlug) {
                return;
              }

              event.preventDefault();
              editCurrentPage(page);
            }}
          >
            <span>{page.title}</span>
            <span>{displayPath(page.slug)}</span>
          </a>
        ))}
      </div>

      <div className="canvas-editor-section">
        <label className="canvas-field">
          Title
          <input value={title} placeholder={titleRequired ? "title required" : copyTitlePlaceholder} onChange={(event) => updateTitle(event.target.value)} />
        </label>
        <label className="canvas-field">
          Slug
          <input
            value={editingProtectedPage ? "" : slug}
            placeholder={editingProtectedPage ? "protected slug" : slugRequired ? "slug required" : copySlugPlaceholder}
            disabled={editingProtectedPage}
            onChange={(event) => updateSlug(event.target.value)}
          />
        </label>
        <div className="page-builder-actions">
          {mode === "edit" ? (
            <>
              <button type="button" className="canvas-tool-button page-builder-button" onClick={updatePage}>
                Update
              </button>
              <button type="button" className="canvas-tool-button page-builder-button" onClick={cancelEdit}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" className="canvas-tool-button page-builder-button" onClick={createPage}>
                Create
              </button>
              <button type="button" className="canvas-tool-button page-builder-button" onClick={duplicatePage}>
                Duplicate
              </button>
            </>
          )}
        </div>
      </div>

      <div className="canvas-editor-section">
        {confirmDelete ? (
          <div className="page-builder-actions">
            <button type="button" className="canvas-tool-button page-builder-button" onClick={deletePage}>
              Confirm
            </button>
            <button type="button" className="canvas-tool-button page-builder-button" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="canvas-tool-button page-builder-button"
            onClick={() => {
              if (protectedPage) {
                setStatus("Protected page cannot be deleted.");
                return;
              }

              setConfirmDelete(true);
              setStatus("");
            }}
          >
            Delete Page
          </button>
        )}
      </div>

      {status ? <div className="page-builder-status">{status}</div> : null}
    </aside>
  );
}
