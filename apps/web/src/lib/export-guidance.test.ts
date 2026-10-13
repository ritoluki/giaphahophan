import { describe, expect, it } from "vitest";
import { describeExportFormat, describeExportWarning } from "./export-guidance";

describe("plain Vietnamese export guidance", () => {
  it("explains measured GEDCOM losses and the preservation path before export", () => {
    expect(describeExportFormat("gedcom_551")).toContain("tải cả JSON đi kèm");
    expect(describeExportWarning("external_applications_may_change_names_and_source_citations_use_json_sidecar")).toContain("mất vị trí trích dẫn");
    expect(describeExportWarning("vietnamese_lunar_dates_kept_in_json_sidecar")).toContain("không chuyển thành ngày dương giả định");
  });
  it("does not display unrecognized server warning values or prototype properties", () => {
    const unknown = "private-person-id=<script>unexpected payload</script>";
    expect(describeExportWarning(unknown)).not.toContain(unknown);
    expect(describeExportWarning("constructor")).toBe(describeExportWarning(unknown));
    expect(describeExportWarning("toString")).toBe(describeExportWarning(unknown));
  });
});
