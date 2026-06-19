import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CanvasPage } from "@/components/CanvasPage";
import { readCanvasPage, readCanvasPageRegistry } from "@/content/canvas/pages";

export const dynamic = "force-dynamic";

type PageProps = {
  params?: Promise<{ slug?: string[] }>;
  searchParams?: Promise<{ edit?: string }>;
};

export async function generateStaticParams() {
  const registry = await readCanvasPageRegistry();
  return registry.map((page) => ({
    slug: page.slug ? page.slug.split("/") : undefined,
  }));
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const slug = resolvedParams?.slug?.join("/") ?? "";
  const page = await readCanvasPage(slug);

  if (!page) {
    return {};
  }

  const editMode = process.env.NODE_ENV === "development" && resolvedSearchParams?.edit === "1";

  return {
    title: editMode ? `Editing ${page.slug || "home"}` : page.title,
  };
}

export default async function DynamicCanvasPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const slug = resolvedParams?.slug?.join("/") ?? "";
  const canvas = await readCanvasPage(slug);

  if (!canvas) {
    notFound();
  }

  const editMode = process.env.NODE_ENV === "development" && resolvedSearchParams?.edit === "1";
  return <CanvasPage canvas={canvas} editMode={editMode} />;
}
