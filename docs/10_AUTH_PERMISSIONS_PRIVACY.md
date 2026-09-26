# 10. Danh tính, quyền và riêng tư

## Đăng nhập và gia nhập

Email/password và lời mời là luồng mặc định; magic link có thể bổ sung nhưng không là điều kiện dùng website. Supabase Auth quản lý password, token và MFA, không tự viết thuật toán auth. Mọi tài khoản mới chưa có membership active đều không được đọc dữ liệu nội bộ. Email verified không đồng nghĩa là thành viên họ Phan.

Lời mời single-use, hash token, TTL 7 ngày, gắn tree và email đã chọn; không đặt role từ URL. Rate-limit request đăng nhập/phục hồi/lời mời; thông báo không tiết lộ email có tồn tại. Claim person là đề nghị cần người khác duyệt, không dựa vào trùng tên/email.

Owner/admin/reviewer/treasurer/finance_approver dùng MFA trước tác vụ đặc quyền. Recovery có mã khôi phục/quy trình chuyển quyền được kiểm chứng với provider; không tạo đường bỏ MFA bằng một cờ trong DB. Không được xóa/hạ quyền owner cuối cùng.

## Session

Theo hướng dẫn Supabase SSR hiện hành: verify JWT bằng getClaims cho request thường; tác vụ nhạy cảm gọi getUser để phát hiện phiên đã bị thu hồi, vì token chưa hết hạn vẫn có thể hợp lệ về chữ ký. Kiểm tra membership/capability DB ở mỗi request cần quyền; không tin role từ user_metadata hoặc dữ liệu client. [S07]

Cookie theo SDK được hỗ trợ, Secure, SameSite phù hợp, cập nhật cookie/header khi refresh. Không hứa HttpOnly trên cookie mà browser Supabase client cần đọc; thay vào đó giảm XSS, CSP và dùng pattern SSR được kiểm chứng. Cookie CSRF riêng do app quản lý. Không ISR/cache CDN với session refresh hoặc Set-Cookie; no-store trên authenticated route và auth callback. [S07]

## Vai trò và capability

Base role: owner, admin, reviewer, editor, member. Visitor không membership. Capability bổ sung: `treasury.write`, `treasury.approve`, `scholarship.review`, `privacy.manage`, `exports.bulk`, `publication.manage`, `operations.read`. Có branch_scope cho sửa/duyệt, không cấp quyền qua việc hồ sơ được gắn vào một branch.

| Hành động | Visitor | Member | Editor theo chi | Reviewer theo chi | Admin | Owner |
|---|---|---|---|---|---|---|
| Đọc nội dung public đã duyệt | Có | Có | Có | Có | Có | Có |
| Đọc hồ sơ members theo field policy | Không | Có | Có | Có | Có | Có |
| Gửi đề nghị bổ sung | Không | Có | Có | Có | Có | Có |
| Soạn draft người/quan hệ trong chi | Không | Không | Có | Có | Có | Có |
| Duyệt proposal thuộc chi | Không | Không | Không | Có | Có | Có |
| Merge / xóa hàng loạt / public living | Không | Không | Không | Không | Capability + 2 người | Capability + 2 người |
| Đọc contact/nguồn restricted | Không | Không mặc định | Không mặc định | Theo grant cần biết | Theo grant cần biết | Theo grant cần biết |
| Quản trị membership/grant | Không | Không | Không | Không | Không tự cấp owner | Có, không bỏ owner cuối |
| Xuất hàng loạt | Không | Không | Không | Không | Capability + MFA | Capability + MFA |
| Ghi/duyệt quỹ | Không | Không | Không | Không | Grant riêng | Grant riêng |

Owner có trách nhiệm hệ thống nhưng không tự động được công khai mọi dữ liệu hoặc vượt quy tắc hai người. Thay grant đặc quyền có audit; người tự tăng quyền không được dùng ngay để tự duyệt giao dịch của mình.

## Effective visibility

Visibility cấu hình không đủ để xuất dữ liệu. `canReadField(actor,record,field)` xem: tree membership active; phạm vi grant; record state; alive/unknown; minor-protection flag; consent còn hiệu lực cho field/audience; publication đã duyệt; source/media visibility. Deny ưu tiên Allow.

Mặc định: người sống và unknown không public; người chưa đủ 18 theo chính sách thận trọng của dự án không public (đây không phải diễn giải đầy đủ định nghĩa trẻ em của pháp luật). Nếu thiếu tuổi, chưa xác minh hoặc có yêu cầu ẩn thì dùng restricted policy. Người đã mất cũng chỉ public khi được xuất bản rõ ràng, không mặc định theo tuổi suy đoán.

Public DTO loại bỏ exact birthday của người sống, phone, email, address, contact encrypted, nguyên nhân mất nhạy cảm, giấy tờ, private notes, minor name/photo. Member DTO không tự mở những field này; scope riêng. Giá trị bị chặn phải không xuất hiện trong HTML/RSC/JSON, không chỉ CSS blur.

## Không rò rỉ quan hệ

Graph trả cạnh khi cả hai endpoint và quan hệ được phép. Không hiển thị số node ẩn, gender/age của node ẩn hoặc đường kinship xuyên qua node không được xem. Search, statistics, citations, notification, map, print/export và audit UI cùng dùng projection/policy. UUID không phải bảo mật; thử request trực tiếp vẫn phải deny.

## DB, RPC và khóa đặc quyền

Tất cả bảng có RLS + grants fail-closed. Expose schema `api` đã duyệt; không expose schema `private`, `jobs`, bảng audit hoặc auth. SECURITY DEFINER helper đặt trong private, search_path='', revoke EXECUTE FROM PUBLIC, chỉ cấp wrapper/role thật sự cần. Helper phải tự authorize vì chạy bằng quyền owner; **không tuyên bố RLS tự bảo vệ bên trong một hàm bypass**. [S08]

Secret/service-role chỉ ở adapter server cần quản lý invitation/Auth và storage đặc quyền. Mỗi lần sử dụng phải được authorize trước; không dùng đọc hồ sơ thông thường. Worker có DB role riêng và allowlist functions, không superuser/BYPASSRLS; quyền job lấy từ record đã tạo bởi actor thật và kiểm tra lại lúc chạy.

## Dữ liệu nhạy cảm và vận hành

Không ghi PII vào log, error monitoring, traces, URL analytics hoặc session replay. Contact optional lưu encrypted ở server bằng primitive/library được duyệt, có key_id và rotation; key không nằm cùng DB backup. Không đưa dữ liệu private vào public image optimizer, build static hoặc CDN cache.

Xóa/thu hồi: ngừng public ngay tại authorization/projection; purge bản cache có thể đã phát hành; hủy export/notification đang chờ; gỡ asset link; giữ tombstone tối thiểu để ngăn phục hồi ngược. Những bản tải về/screenshot từ người khác không thể đảm bảo thu hồi, phải nêu trong chính sách.

## Rà soát pháp lý trước dữ liệu thật

Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 có ngày hiệu lực 01/01/2026 theo cổng văn bản Chính phủ. [S26] Tài liệu này đưa ra biện pháp thiết kế, không thay thế đánh giá nghĩa vụ pháp lý cụ thể. H3 cần người phụ trách xác định vai trò xử lý dữ liệu, căn cứ xử lý, dữ liệu trẻ em, cơ chế consent, yêu cầu chủ thể dữ liệu, lưu ở nước ngoài/nhà cung cấp, hồ sơ/thủ tục và ứng phó sự cố theo quy định đang có hiệu lực.

Không khẳng định “chỉ là gia đình nên được miễn mọi nghĩa vụ”. Khi chưa có xác nhận, chỉ demo, không nhập giấy tờ/PII thật lên dịch vụ ngoài Việt Nam. Retention, thời hạn xử lý yêu cầu và nghĩa vụ báo cáo sự cố phải được chốt theo rà soát hiện hành, không hardcode một thời hạn pháp lý không được kiểm chứng.
