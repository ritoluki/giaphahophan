import { describe, expect, it } from "vitest";
import { buildFamilyDiagram, buildFamilyView, familyDiagramLanes, familyHref, normalizeFamilySearch, readFamilyOptions, type FamilyDataset, type FamilyViewOptions } from "./family-view-model";

const person = (id: string, primaryBranchId = "a") => ({ id, displayName: `Người minh họa ${id}`, yearLabel: "Chưa rõ năm sinh", primaryBranchId });
const dataset: FamilyDataset = {
  people: [person("parent"), person("adoptive"), person("focus"), person("partner"), person("second"), person("child"), person("unrelated", "b")],
  parentLinks: [
    { id: "a", parentId: "parent", childId: "focus", kind: "biological", status: "confirmed" },
    { id: "b", parentId: "adoptive", childId: "focus", kind: "adoptive", status: "disputed" },
    { id: "c", parentId: "focus", childId: "child", kind: "adoptive", status: "confirmed" }
  ],
  unions: [
    { id: "u", partnerIds: ["focus", "partner"], kind: "marriage", status: "unknown" },
    { id: "v", partnerIds: ["focus", "second"], kind: "partnership", status: "separated" }
  ]
};
const options: FamilyViewOptions = { rootId: "focus", view: "family", mode: "family", depth: 2, branchId: null };

describe("family display adapter", () => {
  it("uses recorded parent links and keeps several partners with their context", () => {
    const family = buildFamilyView(dataset, "focus");
    expect(family?.parents.map((member) => member.person.id)).toEqual(["adoptive", "parent"]);
    expect(family?.children.map((member) => member.person.id)).toEqual(["child"]);
    expect(family?.partners.map((member) => member.person.id)).toEqual(["partner", "second"]);
    expect(family?.parents[0]?.relationshipLabels).toEqual(["Cha mẹ nuôi · Cần đối chiếu"]);
    expect(family?.needsReview).toBe(true);
  });

  it("never makes a partner the parent of another partner's child", () => {
    const partnerFamily = buildFamilyView(dataset, "partner");
    expect(partnerFamily?.children).toEqual([]);
    const diagram = buildFamilyDiagram(dataset, options);
    expect(diagram.edges.some((edge) => edge.source === "partner" && edge.target === "child")).toBe(false);
  });

  it("does not return absent people, their IDs, or relations through them", () => {
    const restricted: FamilyDataset = { ...dataset, people: dataset.people.filter((item) => item.id !== "parent" && item.id !== "partner") };
    const family = buildFamilyView(restricted, "focus");
    expect(family?.parents.map((member) => member.person.id)).toEqual(["adoptive"]);
    expect(family?.partners.map((member) => member.person.id)).toEqual(["second"]);
    const diagram = buildFamilyDiagram(restricted, options);
    expect(JSON.stringify(diagram)).not.toContain('"parent"');
    expect(JSON.stringify(diagram)).not.toContain('"partner"');
    expect(buildFamilyView(restricted, "parent")).toBeNull();
  });

  it("only follows confirmed biological/adoptive links for an ancestry view", () => {
    const diagram = buildFamilyDiagram(dataset, { ...options, mode: "ancestors" });
    expect(diagram.people.map((item) => item.id)).toEqual(["focus", "parent"]);
  });

  it("caps the mobile diagram and only draws edges with both endpoints present", () => {
    const diagram = buildFamilyDiagram(dataset, options, 3);
    expect(diagram.people).toHaveLength(3);
    expect(diagram.truncated).toBe(true);
    expect(new Set(diagram.people.map((item) => item.id)).size).toBe(3);
    const visible = new Set(diagram.people.map((item) => item.id));
    expect(diagram.edges.every((edge) => visible.has(edge.source) && visible.has(edge.target))).toBe(true);
  });

  it("keeps one person with both recorded connections when paths converge", () => {
    const shared: FamilyDataset = {
      people: [person("focus"), person("mother"), person("father"), person("ancestor")],
      unions: [],
      parentLinks: [
        { id: "a", parentId: "mother", childId: "focus", kind: "biological", status: "confirmed" },
        { id: "b", parentId: "father", childId: "focus", kind: "biological", status: "confirmed" },
        { id: "c", parentId: "ancestor", childId: "mother", kind: "biological", status: "confirmed" },
        { id: "d", parentId: "ancestor", childId: "father", kind: "biological", status: "confirmed" }
      ]
    };
    const diagram = buildFamilyDiagram(shared, { ...options, mode: "ancestors" });
    expect(diagram.people.filter((item) => item.id === "ancestor")).toHaveLength(1);
    expect(diagram.edges.filter((edge) => edge.source === "ancestor")).toHaveLength(2);
  });

  it("does not claim which partner died from the widowed union status", () => {
    const family = buildFamilyView({ ...dataset, unions: [{ ...dataset.unions[0]!, status: "widowed" }] }, "focus");
    expect(family?.partners[0]?.relationshipLabels).toEqual(["Quan hệ hôn phối đã ghi nhận"]);
  });

  it("places a partner beside the focus and parents above, without making marriage a generation", () => {
    const lanes = familyDiagramLanes(buildFamilyDiagram(dataset, options), "focus");
    expect(lanes.get("focus")).toBe(0);
    expect(lanes.get("parent")).toBe(-1);
    expect(lanes.get("child")).toBe(1);
    expect(lanes.get("partner")).toBe(0);
    expect(lanes.get("second")).toBe(0);
  });
});

describe("family navigation", () => {
  it("does not pick a first person on a direct visit and rejects invalid URL choices", () => {
    expect(readFamilyOptions(new URLSearchParams(), dataset.people, ["a", "b"]).rootId).toBeNull();
    expect(readFamilyOptions(new URLSearchParams("root=hidden&view=other&mode=roots&depth=999&branch=hidden"), dataset.people, ["a", "b"])).toEqual({ ...options, rootId: null });
  });

  it("round trips the person, display, branch and generations in a shareable URL", () => {
    const state: FamilyViewOptions = { ...options, view: "diagram", mode: "descendants", depth: 4, branchId: "a" };
    const href = familyHref(state);
    expect(readFamilyOptions(new URL(href, "https://example.invalid").searchParams, dataset.people, ["a", "b"])).toEqual(state);
  });

  it("matches Vietnamese names with or without accents, including Đ", () => {
    expect(normalizeFamilySearch("  PHAN Đức An ")).toBe("phan duc an");
  });
});
