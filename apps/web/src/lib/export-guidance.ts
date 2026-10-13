import type { ExportRequest } from "@phan/contracts";

const warningLabels: Record<string, string> = {
  gedcom_subset_not_lossless_json_sidecar_attached: "GEDCOM chỉ chứa phần dữ liệu được hỗ trợ. Hãy tải cả JSON đi kèm để giữ đầy đủ thông tin.",
  family_partner_tags_are_layout_slots_not_sex_or_gender: "Vị trí hai người trong gia đình không xác định giới tính hoặc vai trò cha mẹ.",
  name_components_not_inferred: "Tên được giữ nguyên; hệ thống không tự đoán họ và tên đệm.",
  external_applications_may_change_names_and_source_citations_use_json_sidecar: "Phần mềm nhận GEDCOM có thể đổi cách ghi tên hoặc làm mất vị trí trích dẫn. Giữ JSON đi kèm để đối chiếu.",
  canonical_identifiers_replaced_with_file_local_xrefs: "Mã trong GEDCOM chỉ dùng để liên kết các bản ghi trong tệp.",
  union_and_parent_link_semantics_are_lossless_json_sidecar_only: "JSON đi kèm giữ đầy đủ loại và tình trạng quan hệ gia đình.",
  relationship_edge_sidecar_is_lossless_source_of_truth: "Dùng JSON đi kèm để khôi phục chính xác các quan hệ.",
  vietnamese_lunar_dates_kept_in_json_sidecar: "Ngày âm lịch Việt Nam được giữ trong JSON đi kèm, không chuyển thành ngày dương giả định.",
  nonrepresentable_date_kept_in_json_sidecar: "Ngày chưa thể biểu diễn trong GEDCOM được giữ nguyên trong JSON đi kèm.",
  gedcom_control_characters_replaced_json_sidecar_preserves_original: "Ký tự không phù hợp với GEDCOM đã được thay thế; JSON đi kèm giữ giá trị gốc.",
  event_without_details_is_described_in_json_sidecar: "Sự kiện thiếu chi tiết được lưu trong JSON đi kèm.",
  occupation_without_value_kept_in_json_sidecar: "Thông tin nghề nghiệp chưa có nội dung được giữ trong JSON đi kèm.",
  other_fact_kind_kept_in_json_sidecar: "Thông tin ngoài phần GEDCOM hỗ trợ được giữ trong JSON đi kèm.",
  nonstandard_parent_link_kind_kept_in_json_sidecar: "Loại quan hệ cha mẹ đặc biệt được giữ trong JSON đi kèm.",
  nonconfirmed_parent_link_status_kept_in_json_sidecar: "Tình trạng quan hệ chưa xác nhận được giữ trong JSON đi kèm.",
  more_than_two_partners_kept_in_json_sidecar: "Gia đình có hơn hai người phối ngẫu được giữ đầy đủ trong JSON đi kèm.",
  nonstandard_union_semantics_kept_in_json_sidecar: "Loại và tình trạng gia đình được giữ đầy đủ trong JSON đi kèm.",
  nonstandard_parent_link_semantics_kept_in_json_sidecar: "Loại và tình trạng quan hệ cha mẹ được giữ đầy đủ trong JSON đi kèm.",
  csv_flat_people_only_use_json_for_authorized_relationships_and_citations: "CSV là danh sách hồ sơ. Chọn JSON để giữ cả quan hệ và trích dẫn được phép.",
  csv_dangerous_cells_prefixed_with_apostrophe_json_preserves_original_values: "Một số ô CSV có thêm dấu nháy đơn để mở an toàn trong bảng tính; JSON giữ giá trị gốc.",
};

export function describeExportWarning(code: string): string {
  return Object.hasOwn(warningLabels, code) ? warningLabels[code]! : "Có thông tin chưa thể biểu diễn đầy đủ trong định dạng này. Hãy giữ bản JSON để đối chiếu.";
}

export function describeExportFormat(format: ExportRequest["format"]): string {
  if (format === "gedcom_551" || format === "gedcom_7") return "Dùng để trao đổi với phần mềm gia phả. Tên, trích dẫn và quan hệ có thể được phần mềm nhận biểu diễn khác; tải cả JSON đi kèm để giữ thông tin đầy đủ. Ngày âm lịch nằm trong JSON.";
  if (format === "csv") return "Dùng để xem danh sách hồ sơ trong bảng tính. Chọn JSON nếu cần giữ cả quan hệ và trích dẫn.";
  if (format === "canonical_json") return "Giữ đầy đủ thông tin trong phạm vi được phép, gồm quan hệ, độ chính xác của ngày và trích dẫn.";
  return "Bản trình bày để đọc hoặc in, chỉ chứa thông tin được phép xuất.";
}
