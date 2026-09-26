# Trạng thái canonical và ý nghĩa chuyển trạng thái

DB dictionary là chuẩn persistence. API đổi snake_case sang camelCase nhưng giữ nguyên các enum tương ứng. Label tiếng Việt là lớp giao diện, không phải enum DB mới.

- Membership: pending → active → suspended/revoked. “Invited” thuộc Invitation, không phải membership đã active.
- Proposal: draft → submitted → needs_info / rejected / approved; withdrawn khi rút. Approve và apply cùng transaction. Conflict trả 409 và giữ trạng thái trước; UI có error state, không ghi status conflict vào DB. Approved luôn là đã apply thành công, không phải chờ một worker không bảo đảm.
- Review decision: approve / reject / needs_info. Field reason bắt buộc khi reject/needs_info; source/version/hash đối chiếu trước approve.
- Media: requested → uploading → uploaded → scanning → processing → ready; rejected/failed/quarantined theo lỗi. “Scan pending” là queue state, không tự sáng tạo enum scan_pending. Xóa mềm ở deleted_at; tài nguyên deleted không trả DTO bình thường.
- Import: queued → parsing → needs_review → ready → applying → completed; lỗi giữa chunk là partially_applied. Cancelled có manifest ghi phần đã commit; không giả rollback toàn bộ.
- Content: draft → submitted → approved → published → archived. Unpublish thu hồi projection, giữ revision/audit.
- Event rule: needs_review / approved / cancelled. Occurrence: scheduled / cancelled / completed; rule chưa xác minh không sinh occurrence giả needs_review như thể đã tính được ngày.
- Journal: draft → submitted → posted / rejected; approve và post atomic; không tự duyệt. Reversal là entry mới đã được duyệt, bản gốc immutable; UI suy ra nhãn “đã đảo” từ quan hệ entries.
- Tree data mode chỉ demo / real; chuyển dữ liệu là workflow quản trị riêng, không tạo chế độ mixed public không kiểm soát.

Job DTO dùng tập trạng thái thống nhất cho nhiều loại job (bao gồm processing/generating/expired) nhưng phải validate theo kind. Không chấp nhận một enum hợp lệ ở export rồi ghi vào import_jobs nếu SQL không cho phép. Các mô tả tiếng Anh như needs mapping, awaiting approval, cancelling là UI/process substate hoặc được thêm bằng migration/ADR và cập nhật tất cả hợp đồng, không được đổi ngầm.
