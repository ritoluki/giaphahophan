import type { GenealogyDate, Journal, Name, ScholarshipApplicationRecord, ScholarshipAwardRecord, ScholarshipProgramRecord, Source } from "@phan/contracts";

export const lifeStatusLabels = {
  living: "Còn sống",
  deceased: "Đã mất",
  unknown: "Chưa rõ"
} satisfies Record<"living" | "deceased" | "unknown", string>;

export const nameKindLabels = {
  birth: "Tên khai sinh",
  preferred: "Tên thường dùng",
  alias: "Tên gọi khác",
  religious: "Tên tôn giáo",
  other: "Tên khác"
} satisfies Record<Name["kind"], string>;

const sourceKindLabels = {
  book: "Sách, gia phả",
  oral: "Lời kể",
  document: "Tài liệu",
  photo: "Ảnh",
  website: "Trang web",
  other: "Nguồn khác"
} satisfies Record<Source["kind"], string>;

export function sourceKindLabel(kind: string): string {
  return Object.hasOwn(sourceKindLabels, kind)
    ? sourceKindLabels[kind as keyof typeof sourceKindLabels]
    : "Tư liệu";
}

const datePrecisionLabels = {
  exact: "Đã ghi nhận ngày, tháng, năm",
  month: "Đã ghi nhận tháng và năm",
  month_day: "Đã ghi nhận ngày và tháng, chưa rõ năm",
  year: "Chỉ ghi nhận năm, chưa rõ ngày và tháng",
  about: "Thời điểm ước chừng",
  before: "Trước thời điểm đã ghi",
  after: "Sau thời điểm đã ghi",
  range: "Trong khoảng thời gian đã ghi",
  text: "Ghi theo nội dung tư liệu gốc",
  unknown: "Chưa rõ thời điểm"
} satisfies Record<GenealogyDate["precision"], string>;

export function datePrecisionLabel(precision: string): string {
  return Object.hasOwn(datePrecisionLabels, precision)
    ? datePrecisionLabels[precision as keyof typeof datePrecisionLabels]
    : datePrecisionLabels.unknown;
}

export const journalStatusLabels = {
  draft: "Bản nháp",
  submitted: "Chờ duyệt",
  posted: "Đã ghi sổ",
  rejected: "Không được duyệt"
} satisfies Record<Journal["status"], string>;

export const scholarshipProgramStatusLabels = {
  draft: "Chưa công bố",
  open: "Đang nhận hồ sơ",
  closed: "Đã hết hạn nhận hồ sơ",
  awarded: "Đã công bố kết quả"
} satisfies Record<ScholarshipProgramRecord["status"], string>;

export const scholarshipApplicationStatusLabels = {
  draft: "Bản nháp",
  submitted: "Chờ duyệt",
  needs_info: "Cần bổ sung",
  approved: "Đã duyệt hồ sơ",
  rejected: "Không được duyệt",
  withdrawn: "Đã rút hồ sơ",
  awarded: "Đã có quyết định hỗ trợ"
} satisfies Record<ScholarshipApplicationRecord["status"], string>;

export const scholarshipAwardStatusLabels = {
  approved: "Đã duyệt hỗ trợ",
  paid: "Đã ghi nhận chi",
  reversed: "Đã đảo giao dịch chi",
  withdrawn: "Đã rút quyết định"
} satisfies Record<ScholarshipAwardRecord["status"], string>;

/** Format a calendar date without relying on the device's time zone. */
export function formatDisplayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "Chưa có ngày";
}
