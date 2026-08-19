import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PolicyArticle } from "@/components/policies/policy-article";
import { PolicyTocList, ProviderCard } from "@/components/policies/policy-toc";
import { PageContainer } from "@/components/shell/page-container";
import { Icon } from "@/components/ui/icon";
import { POLICY_DOCS, policyDoc } from "@/features/policies/catalog";

/**
 * ศูนย์ข้อกำหนดและนโยบาย - one URL per document, statically generated
 * (FictionThai Legal.dc.html). The catalog holds structure and placeholders
 * only; see its header for the no-content rule.
 *
 * Noindex ON PURPOSE while the scaffold is unfilled: a search engine must
 * never present a page of placeholders as the site's actual terms. Lift the
 * flag document-by-document as the owner publishes real wording.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return POLICY_DOCS.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = policyDoc(slug);
  if (!doc) return {};
  return {
    title: `${doc.title} · ข้อกำหนดและนโยบาย`,
    description: "ศูนย์ข้อกำหนดและนโยบายของ FictionThai",
    robots: { index: false },
  };
}

export default async function PolicyPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = policyDoc(slug);
  if (!doc) notFound();

  return (
    <main id="main">
      {/* Print keeps the document body alone - the copy a dispute keeps. */}
      <style>{`@media print {
        header, footer, nav, aside, details { display: none !important; }
      }`}</style>

      {/* Secondary bar */}
      <div className="border-b border-hairline bg-surface-secondary print:hidden">
        <PageContainer className="flex min-h-10 flex-wrap items-center gap-3 py-1.5">
          <span className="inline-flex items-center gap-2 text-xs whitespace-nowrap text-text-secondary">
            <Icon name="book" size={14} className="text-text-muted" />
            ศูนย์ข้อกำหนดและนโยบาย
          </span>
          <span className="ms-auto">
            <Link href="#contact" className="text-xs text-primary hover:underline">
              ติดต่อผู้ให้บริการ
            </Link>
          </span>
        </PageContainer>
      </div>

      <PageContainer className="py-8 pb-20">
        {/* Mobile TOC - a native disclosure, no JavaScript. */}
        <details className="mb-5 rounded-lg border border-border bg-surface p-3 lg:hidden">
          <summary className="cursor-pointer text-sm font-medium">
            สารบัญเอกสาร · {doc.title}
          </summary>
          <div className="mt-3 flex flex-col gap-3.5">
            <PolicyTocList current={doc} />
            <ProviderCard />
          </div>
        </details>

        <div className="gap-10 lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]">
          <aside className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pb-4">
            <p className="mono-label">Policies</p>
            <p className="mt-1.5 mb-4 font-serif text-lg leading-snug font-semibold">
              ข้อกำหนดและนโยบาย
            </p>
            <PolicyTocList current={doc} />
            <div className="mt-4">
              <ProviderCard />
            </div>
          </aside>

          <PolicyArticle doc={doc} />
        </div>
      </PageContainer>
    </main>
  );
}
