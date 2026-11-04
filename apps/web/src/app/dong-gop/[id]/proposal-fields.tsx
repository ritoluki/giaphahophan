import type { genealogyDateSchema, personProjectionSchema } from "@phan/contracts";
import type { z } from "zod";

type Person = z.infer<typeof personProjectionSchema>;
type GenealogyDate = z.infer<typeof genealogyDateSchema>;

const fieldLabels: Record<string, string> = {
  version: "Phiên bản", display_name: "Họ tên", displayName: "Họ tên", recorded_sex: "Giới tính ghi nhận", recordedSex: "Giới tính ghi nhận",
  life_status: "Tình trạng", lifeStatus: "Tình trạng", visibility: "Phạm vi xem", protected_minor: "Bảo vệ người chưa thành niên", protectedMinor: "Bảo vệ người chưa thành niên",
  primary_branch_id: "Mã chi họ", primaryBranchId: "Mã chi họ", biography: "Tiểu sử", confidence: "Mức xác minh", code: "Mã gia phả",
  parent_id: "Mã hồ sơ cha hoặc mẹ", child_id: "Mã hồ sơ người con", source_id: "Mã tư liệu", kind: "Loại thông tin", status: "Mức xác nhận", ordinal: "Thứ tự ghi nhận",
  calendar: "Lịch ghi nhận", precision: "Mức xác định ngày", originalText: "Ngày theo tư liệu gốc", original_text: "Ngày theo tư liệu gốc", year: "Năm", month: "Tháng", day: "Ngày", isLeapMonth: "Tháng nhuận",
  partner_ids: "Mã hồ sơ vợ, chồng hoặc bạn đời", child_ids: "Mã hồ sơ người con", person: "Thông tin người", parent_link: "Quan hệ cha mẹ – con", union: "Gia đình",
};
const valueLabels: Record<string, Record<string, string>> = {
  recorded_sex: { M: "Nam", F: "Nữ", X: "Khác", U: "Chưa xác định" } satisfies Record<NonNullable<Person["recordedSex"]>, string>,
  life_status: { living: "Còn sống", deceased: "Đã mất", unknown: "Chưa xác định" } satisfies Record<Person["lifeStatus"], string>,
  visibility: { public: "Công khai", members: "Thành viên", restricted: "Giới hạn quyền xem" } satisfies Record<Person["visibility"], string>,
  confidence: { verified: "Đã xác minh", supported: "Có tư liệu", disputed: "Cần đối chiếu thêm", unverified: "Chưa xác minh" } satisfies Record<Person["confidence"], string>,
  kind: { biological: "Cha mẹ ruột", adoptive: "Cha mẹ nuôi", guardian: "Người giám hộ", step: "Cha dượng hoặc mẹ kế", birth: "Tên khai sinh", preferred: "Tên thường dùng", alias: "Tên gọi khác", religious: "Pháp danh hoặc thánh danh", other: "Khác" },
  calendar: { gregorian: "Dương lịch", vietnamese_lunar: "Âm lịch Việt Nam", julian: "Lịch Julius", unknown: "Chưa xác định" } satisfies Record<GenealogyDate["calendar"], string>,
  precision: { exact: "Đủ ngày, tháng, năm", month: "Chỉ rõ tháng và năm", month_day: "Chỉ rõ ngày và tháng", year: "Chỉ rõ năm", about: "Khoảng thời gian", before: "Trước ngày ghi nhận", after: "Sau ngày ghi nhận", range: "Trong khoảng", text: "Theo lời ghi trong tư liệu", unknown: "Chưa xác định" } satisfies Record<GenealogyDate["precision"], string>,
  status: { confirmed: "Đã xác nhận", disputed: "Cần đối chiếu thêm", draft: "Bản nháp", unverified: "Chưa xác minh" },
};
valueLabels.recordedSex = valueLabels.recorded_sex ?? {};
valueLabels.lifeStatus = valueLabels.life_status ?? {};

function ownLabel(labels: Record<string, string>, key: string, fallback: string): string {
  return Object.hasOwn(labels, key) ? labels[key]! : fallback;
}

function fieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "Chưa có thông tin";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "string") return Object.hasOwn(valueLabels, key) ? ownLabel(valueLabels[key]!, value, "Chưa xác định") : value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.length ? value.map((item) => fieldValue(key, item)).join("; ") : "Chưa có thông tin";
  if (typeof value === "object") return Object.entries(value).map(([childKey, entry]) => `${ownLabel(fieldLabels, childKey, "Thông tin khác")}: ${fieldValue(childKey, entry)}`).join("; ");
  return "Chưa có thông tin";
}

export function ProposalFields({ value }: { value: Record<string, unknown> | null }) {
  if (!value || Object.keys(value).length === 0) return <p className="muted">Chưa có thông tin để so sánh.</p>;
  return <dl className="detail-list">{Object.entries(value).map(([key, entry]) => <div key={key}><dt>{ownLabel(fieldLabels, key, "Thông tin khác")}</dt><dd>{fieldValue(key, entry)}</dd></div>)}</dl>;
}

const targetLabels: Record<string, string> = { person: "Thông tin người", parent_link: "Quan hệ cha mẹ – con", union: "Gia đình", fact: "Sự kiện và ngày tháng", source: "Tư liệu", citation: "Trích dẫn", branch: "Chi họ", merge: "Hợp nhất hồ sơ", publication: "Xuất bản" };
const operationLabels: Record<string, string> = { create: "Bổ sung", update: "Sửa thông tin", delete: "Xóa", soft_delete: "Ẩn hồ sơ", restore: "Khôi phục", merge: "Hợp nhất", publish: "Công khai" };
export function proposalTargetLabel(value: string): string { return ownLabel(targetLabels, value, "Nội dung gia phả"); }
export function proposalOperationLabel(value: string): string { return ownLabel(operationLabels, value, "Đề nghị thay đổi"); }
