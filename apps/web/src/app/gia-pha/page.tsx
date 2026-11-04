import { Suspense } from "react";
import { SiteShell } from "../_components/site-chrome";
import { TreeExplorer } from "../../modules/m04/tree-explorer";

export default function GiaPhaPage() {
  return (
    <SiteShell active="tree">
      <main id="main-content" tabIndex={-1} className="container page family-page">
        <Suspense fallback={<p role="status">Đang mở gia phả…</p>}><TreeExplorer /></Suspense>
      </main>
    </SiteShell>
  );
}
