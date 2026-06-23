import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CanvasPage } from "@/components/CanvasPage";
import { readCanvasPage, readCanvasPageRegistry } from "@/content/canvas/pages";
import type { CanvasDocument } from "@/content/canvas";

export const dynamic = "force-dynamic";

type PageProps = {
  params?: Promise<{ slug?: string[] }>;
  searchParams?: Promise<{ edit?: string; key?: string }>;
};

function canEdit(searchParams: { edit?: string; key?: string } | undefined) {
  const editRequested = searchParams?.edit === "1";
  const remoteEditAllowed = Boolean(process.env.WEB_BUILDER_EDIT_KEY) && searchParams?.key === process.env.WEB_BUILDER_EDIT_KEY;
  return editRequested && (process.env.NODE_ENV === "development" || remoteEditAllowed);
}

function getPageSlug(slug?: string[]) {
  const pageSlug = slug && slug.length > 1 ? slug.slice(1).join("/") : slug?.join("/") ?? "";
  return pageSlug === "home" ? "" : pageSlug;
}

function isProjectPageRoute(slug?: string[]) {
  return Boolean(slug && slug.length > 1);
}

function blankProjectRouteCanvas(slug?: string[]): CanvasDocument {
  const pageSlug = slug?.[1] === "home" ? "" : slug?.slice(1).join("/") ?? "";
  return {
    slug: pageSlug,
    title: pageSlug || "Home",
    height: 810,
    mobileHeight: 844,
    backgroundColor: "#fafaf7",
    items: [],
  };
}

export async function generateStaticParams() {
  const registry = await readCanvasPageRegistry();
  return registry.map((page) => ({
    slug: page.slug ? page.slug.split("/") : undefined,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  if (isProjectPageRoute(resolvedParams?.slug)) {
    return {};
  }

  const slug = getPageSlug(resolvedParams?.slug);
  const page = await readCanvasPage(slug);

  if (!page) {
    return {};
  }

  return {
    title: page.title || page.slug || "project",
  };
}

export default async function DynamicCanvasPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const editMode = canEdit(resolvedSearchParams);
  if (editMode && isProjectPageRoute(resolvedParams?.slug)) {
    return <CanvasPage canvas={blankProjectRouteCanvas(resolvedParams?.slug)} editMode={editMode} />;
  }

  const slug = getPageSlug(resolvedParams?.slug);
  const canvas = (await readCanvasPage(slug)) ?? (isProjectPageRoute(resolvedParams?.slug) ? await readCanvasPage("") : null);

  if (!canvas) {
    notFound();
  }

  return <CanvasPage canvas={canvas} editMode={editMode} />;
}
