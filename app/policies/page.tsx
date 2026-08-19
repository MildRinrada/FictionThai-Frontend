import { redirect } from "next/navigation";

/**
 * /policies opens the terms - the document most links mean - matching the
 * reference design's default (FictionThai Legal.dc.html). Every document has
 * its own address under /policies/<slug>.
 */
export default function PoliciesIndexPage() {
  redirect("/policies/terms");
}
