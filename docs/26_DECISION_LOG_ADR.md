# 26. Nhật ký quyết định kiến trúc

Trạng thái các ADR dưới đây là **baseline đề xuất để triển khai theo yêu cầu hiện tại**, không phải approval tài khoản/chi phí/dữ liệu thật. H1–H5 vẫn cần người phụ trách ký xác nhận.

| ADR | Quyết định | Lý do | Điều kiện xem lại |
|---|---|---|---|
| ADR-001 | Một dòng họ, nhiều chi; tree_id ngay từ đầu | Cô lập demo/real và chống cross-tree, không phức tạp hóa SaaS | Có nhiều tổ chức độc lập muốn sử dụng |
| ADR-002 | Full V1 với chặng kiểm thử, không MVP sơ sài | Phù hợp yêu cầu “làm lớn” và agent tự làm | Owner thay phạm vi rõ ràng |
| ADR-003 | Next/TypeScript + Supabase + worker PostgreSQL | Ít hệ thống vận hành, domain quan hệ, UI tùy biến | Ràng buộc vùng dữ liệu/compliance hoặc traffic khác giả định |
| ADR-004 | SQL-first, private schema + authorized RPC | Transaction/integrity/quyền rõ, không lộ raw tables | Complexity không kiểm soát hoặc nhu cầu BFF khác |
| ADR-005 | Graph là projection, không nguồn dữ liệu | Union/adoption/pedigree collapse không ép thành tree đơn giản | Không bỏ nguyên tắc này |
| ADR-006 | Mobile family-focus và tree tùy chọn | Tránh bắt người lớn tuổi kéo sơ đồ khổng lồ | User test cho thấy layout khác tốt hơn có evidence |
| ADR-007 | Ngày nguồn không đổi; lunar recurrence riêng | Tránh lịch giỗ sai và mất precision | Không bỏ nguyên tắc này |
| ADR-008 | Privacy-first; unknown như living; field-level projection | Tránh lộ dữ liệu gia đình qua nhiều kênh | Chỉ chỉnh cụ thể với cơ sở/policy được duyệt |
| ADR-009 | Outbox + pg-boss; side effects idempotent | Tránh mất email/jobs giữa DB commit và provider | Queue tải vượt khả năng benchmark |
| ADR-010 | Quỹ có journal bất biến và 2 người duyệt | Truy vết/đối chiếu; không giả thanh toán online | Owner yêu cầu hệ thống tài chính chuyên dụng |
| ADR-011 | Demo và real cutover riêng | Không để dữ liệu giả thành lịch sử thật | Không bỏ nguyên tắc này |
| ADR-012 | DB + objects off-site + restore drill | Backup chỉ có DB không đủ | RPO/RTO được owner đổi và benchmark lại |
| ADR-013 | Không AI/OCR cloud trong core path | Không bắt dữ liệu thật ra ngoài, kiểm soát nguồn | Có approval riêng và human review |
| ADR-014 | Không offline private cache | Tránh leak trên thiết bị chung | Có threat model và consent cho offline riêng |
| ADR-015 | Thiết kế giấy ngà/đỏ trầm/chữ Sans+Serif | Trang nghiêm, có bản sắc, dễ đọc | H1 góp ý màu/chữ/bố cục |

## Mẫu ADR mới

ID; ngày; trạng thái proposed/accepted/superseded; vấn đề; lựa chọn đã cân nhắc; quyết định; lợi ích/chi phí/rủi ro; dữ liệu và quyền bị ảnh hưởng; migration/rollback; tests; người phê duyệt; nguồn. Không đổi stack bằng một dòng “tối ưu hơn” không có evidence.
