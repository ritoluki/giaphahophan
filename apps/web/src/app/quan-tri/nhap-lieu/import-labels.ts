import type { ImportPreviewRecord } from "@phan/contracts";

export const importClassificationLabels: Record<ImportPreviewRecord["classification"], string> = {
  canonical: "JSON theo mẫu gia phả", structured: "Dữ liệu theo cột", gedcom: "Dữ liệu gia phả GEDCOM",
};

const issueLabels: Record<string, string> = {
  external_id_required: "Thiếu mã người trong tệp nguồn.", external_id_too_long: "Mã người dài quá 300 ký tự.",
  display_name_required: "Thiếu họ tên.", display_name_too_long: "Họ tên dài quá 300 ký tự.",
  externalId: "Mã người trong tệp nguồn chưa hợp lệ.", displayName: "Họ tên chưa hợp lệ.", record_invalid: "Dòng này chưa đúng cấu trúc cần nhập.",
  duplicate_external_id_in_source: "Mã người bị lặp trong tệp; cần đối chiếu từng dòng.",
  name_missing_review_required: "Chưa có họ tên; cần đối chiếu nguồn.", record_type_preserved_for_review: "Loại thông tin này được giữ trong tư liệu gốc để đối chiếu.",
  relationship_mapping_requires_review: "Cần đối chiếu thành viên và quan hệ gia đình.", unresolved_relationship_reference: "Chưa tìm thấy người được nhắc đến trong quan hệ.",
  duplicate_relationship_reference: "Một người được ghi lặp trong quan hệ gia đình.",
};

export function describeImportIssue(issue: string): string {
  return Object.hasOwn(issueLabels, issue) ? issueLabels[issue]! : "Dòng này còn thông tin cần đối chiếu với tư liệu gốc.";
}
