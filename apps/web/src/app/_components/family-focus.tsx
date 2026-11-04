"use client";

import { Suspense } from "react";
import type { DemoFamilyFocus } from "../../lib/demo-data";
import { TreeExplorer } from "../../modules/m04/tree-explorer";

/** Compatibility entry point; the family list and diagram share one experience. */
export function FamilyFocus({ family }: { family: DemoFamilyFocus }) {
  return <Suspense fallback={<p role="status">Đang mở gia đình…</p>}><TreeExplorer rootId={family.person.id} /></Suspense>;
}
