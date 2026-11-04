import { layoutFamilyNodes } from "./family-layout";
import { familyLayoutRequestSchema, type FamilyLayoutResult } from "./family-layout-types";

// ELK runs inside this dedicated worker. Terminating the worker cancels layout
// when the selected family, filters, or screen size change.
self.onmessage = async (event: MessageEvent<unknown>) => {
  const request = familyLayoutRequestSchema.safeParse(event.data);
  if (!request.success) {
    self.postMessage({ ok: false } satisfies FamilyLayoutResult);
    return;
  }
  self.postMessage(await layoutFamilyNodes(request.data));
};
