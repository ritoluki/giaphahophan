import { renderToStaticMarkup } from "react-dom/server";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProposalFields, proposalOperationLabel, proposalTargetLabel } from "./proposal-fields";
import { describeImportIssue } from "../../quan-tri/nhap-lieu/import-labels";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

describe("Vietnamese proposal and import presentation", () => {
  it("translates date and name codes while preserving the source wording", () => {
    const html = renderToStaticMarkup(<ProposalFields value={{ date: { calendar: "vietnamese_lunar", precision: "year", originalText: "Nguyên văn: spring of 1890" }, names: [{ kind: "preferred", name: "Tên do người nhà nhập" }] }} />);
    expect(html).toContain("Âm lịch Việt Nam");
    expect(html).toContain("Chỉ rõ năm");
    expect(html).toContain("Tên thường dùng");
    expect(html).toContain("Nguyên văn: spring of 1890");
    expect(html).not.toContain("vietnamese_lunar");
  });
  it("keeps unknown prototype keys from becoming renderable values", () => {
    for (const key of ["constructor", "toString", "__proto__"]) {
      expect(proposalTargetLabel(key)).toBe("Nội dung gia phả");
      expect(proposalOperationLabel(key)).toBe("Đề nghị thay đổi");
      expect(describeImportIssue(key)).toContain("cần đối chiếu");
      expect(() => renderToStaticMarkup(<ProposalFields value={{ [key]: { kind: key } }} />)).not.toThrow();
    }
  });
});
