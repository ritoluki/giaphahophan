// @vitest-environment jsdom
import { act, createElement } from "react";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProposalForm } from "./proposal-form";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const proposalId = "00000000-0000-4000-8000-000000000022";
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("React", React);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  push.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("proposal form submission intent", () => {
  it.each([
    ["draft", "/api/v1/proposals/draft"],
    ["submit", "/api/v1/proposals"],
  ] as const)("sends the %s button to its actual endpoint", async (intent, endpoint) => {
    const requests: Array<{ path: string; body: Record<string, unknown>; key: string | null }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = String(input);
      if (path === "/api/v1/proposals/context") return Response.json({ data: [{
        treeId: "00000000-0000-4000-8000-000000000001", treeName: "Gia phả minh họa", branchId: null, branchName: null,
      }] });
      requests.push({ path, body: JSON.parse(String(init?.body)) as Record<string, unknown>, key: new Headers(init?.headers).get("Idempotency-Key") });
      return Response.json({ data: { id: proposalId } });
    });
    await act(async () => { root.render(createElement(ProposalForm)); });
    const kind = container.querySelector<HTMLSelectElement>("select:not([name])");
    if (!kind) throw new Error("Proposal kind selection was not rendered");
    await act(async () => { kind.value = "addition"; kind.dispatchEvent(new Event("change", { bubbles: true })); });
    const fill = (name: string, value: string) => {
      const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
      if (!input) throw new Error(`Missing form field: ${name}`);
      input.value = value;
    };
    fill("displayName", "Phan Minh Họa");
    fill("sourceIds", "00000000-0000-4000-8000-000000000033");
    fill("reason", "Đối chiếu theo tư liệu hư cấu dùng trong kiểm thử.");
    const button = container.querySelector<HTMLButtonElement>(`button[value="${intent}"]`);
    if (!button) throw new Error("Submission button was not rendered");
    await act(async () => button.click());
    expect(requests).toHaveLength(1);
    expect(requests[0]?.path).toBe(endpoint);
    expect(requests[0]?.body).toMatchObject({ kind: "addition", items: [{ operation: "create", fieldChanges: { display_name: "Phan Minh Họa" } }] });
    expect(requests[0]?.key).toMatch(/^[0-9a-f-]{36}$/i);
    expect(push).toHaveBeenCalledWith(`/dong-gop/${proposalId}`);
  });
});
