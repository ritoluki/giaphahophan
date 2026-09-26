# 05. Hệ thống thiết kế — Gia phả số trang nghiêm

## 1. Ý tưởng thị giác

Cảm giác một cuốn gia phả được biên soạn cẩn thận, không phải trang quản trị SaaS được thay logo. Sự trang nghiêm đến từ tỷ lệ chữ, khoảng thở, thứ tự nội dung và vật liệu màu giấy; không dựa vào rồng, hoa văn dày, chữ thư pháp khó đọc, âm nhạc tự phát hoặc hiệu ứng vàng lấp lánh.

Trang chủ có bố cục biên tập: tiêu đề serif lớn, phần dẫn dễ đọc, khung phả đồ hoặc ảnh nhà thờ đã được phép dùng, một khối tra cứu nổi bật, lịch họ và câu chuyện có phân cấp. Trang dữ liệu tiết chế hơn nhưng giữ màu/chữ/nhịp khoảng cách. Không dùng bức ảnh nhà thờ trên mạng để giả nhận là nhà thờ họ của chủ dự án.

## 2. Design tokens bắt buộc

| Token | Giá trị | Cách dùng |
|---|---|---|
| background | #F8F5EF | Nền trang, cảm giác giấy ngà |
| surface | #FFFFFF | Card, form, menu |
| surface-muted | #EEE8DF | Nhóm thông tin phụ, không dùng cho chữ mờ |
| ink | #292520 | Nội dung chính |
| ink-muted | #655C54 | Nội dung phụ vẫn phải đọc rõ |
| brand | #702D34 | CTA, logo chữ, điểm nhấn |
| brand-hover | #59242A | Hover/pressed CTA |
| accent | #86652E | Label nhỏ, đường viền có ý nghĩa, icon tiết chế |
| border | #DED7CC | Phân vùng mềm; không dùng làm viền focus duy nhất |
| success | #405D4A | Trạng thái xác minh, luôn kèm chữ/icon |
| danger | #A12D36 | Lỗi/xóa, không dùng phân biệt người đã mất |
| focus | #702D34 | Outline 3px, offset 3px, tương phản trên nền |

Tất cả cặp foreground/background thực dùng phải đo contrast; token hợp lệ không làm mọi tổ hợp tự động hợp lệ. Văn bản thường tối thiểu 4.5:1, chữ lớn tối thiểu 3:1 theo WCAG; dự án ưu tiên mức cao hơn cho body khi có thể. [S18]

## 3. Typography

Noto Sans cho body, input, navigation, bảng. Noto Serif cho tên website, tiêu đề trang, tiêu đề câu chuyện và các khối truyền thống. Build tải font từ nguồn/license đã kiểm tra và tự host; không gọi Google Fonts runtime trên trang private. Không kèm file font trong bộ hồ sơ này. [S24]

| Vai trò | Mobile | Desktop | Quy tắc |
|---|---|---|---|
| Hero | 34/44px, serif 600 | 56/68px, serif 600 | 2–4 dòng, không letter-spacing âm quá mức |
| H1 trang | 30/40px | 40/52px | Không đặt uppercase dài |
| H2 | 24/34px | 30/40px | Giữ khoảng trên rõ |
| H3 | 20/30px | 22/32px | Không lạm dụng serif trong form |
| Body | 17/28px | 17/28px | Tối đa 68 ký tự/dòng cho bài đọc |
| Input/button | 16/24px tối thiểu | 16/24px | Không thu nhỏ input trên iOS |
| Phụ trợ | 14/22px | 14/22px | Không dùng cho thông tin cốt lõi |
| Số liệu | 24–32px | 32–40px | Tabular numbers, đơn vị đặt rõ |

Kiểm tra chuỗi: “Phan Đặng Nguyễn Trần — Ấm áp nghĩa tình, hướng về nguồn cội; Đỗ, Ước, Quỳnh”. Không cắt dấu trên/dưới do line-height. Bật text zoom 125%, 150%, 200%; không ép fixed-height cho đoạn nội dung.

## 4. Layout, nhịp và hình khối

Grid 4 cột mobile / 8 tablet / 12 desktop. Container 1200px, gutter 16px ở 320–479, 20px ở 480–767, 32px từ 768. Trang đọc 760px. Spacing scale 4, 8, 12, 16, 24, 32, 48, 64, 96px. Section gap 40px mobile, 64px desktop. Card padding 20/24px; radius 12px, sheet 20px góc trên; button radius 8px. Không biến tất cả thành viên thuốc tròn.

Shadow nhẹ tối đa hai tầng. Một màn hình có một CTA chính; thao tác nguy hiểm không dùng màu brand như CTA thông thường. Không tô nền từng card bằng màu khác nhau chỉ để tạo cảm giác đa dạng.

## 5. Component inventory

- AppHeader, DesktopNav, MobileBottomNav, MoreMenuPage, Breadcrumb, PageHeading, SectionHeading, SkipLink.
- PersonCard, PersonSummary, LifeDateLabel, RelationBadge, GenerationLabel, BranchBadge, SourceConfidenceBadge, PrivateFieldHint, TreeLegend.
- SearchCombobox, FilterSheet, FilterChips, CursorPagination, SegmentedControl, EmptyState, ErrorState, Skeleton, OfflineBanner, StaleDataNotice.
- DateInputGenealogy: chọn lịch, độ chính xác, năm/tháng/ngày, tháng nhuận, nguyên văn; chỉ hiện trường phù hợp, có ví dụ.
- ContributionEditor, FieldDiff, ConflictResolver, ReviewDecision, AuditTimeline, SourceCitationPicker, DuplicateComparison.
- MediaUpload, UploadProgress, QuarantineState, DocumentViewer, PermissionAwareMedia, SourceCard, TranscriptPanel.
- EventCard, LunarSolarDate, MonthCalendar, AgendaList, RSVPForm, NotificationPreferences.
- MoneyInputVND, JournalPreview, FinanceApproval, RedactedContributorLabel, BudgetSummary.
- ConfirmDialog, DestructiveActionDialog, ToastLiveRegion, AccessibleTooltip, BottomSheet, TableToCards.

Mỗi component có story: mặc định, loading, empty, long-text, error, disabled, restricted, mobile 320px và text zoom. Không dùng tooltip làm nơi duy nhất chứa thông tin.

## 6. Cây gia phả: ngôn ngữ thị giác

Person node 184–220px ngang ở desktop, 160–184px khi chế độ cây mobile; có tên tối đa 3 dòng, nhãn năm hoặc “Chưa rõ”, nhãn chi/đời, avatar placeholder monogram. Không dùng ảnh AI của người hư cấu để người xem tưởng ảnh tổ tiên.

Union node nhỏ biểu diễn gia đình/hôn phối, không tự sinh một “người” giả. Cạnh cha mẹ–con có chiều; cạnh hôn phối khác kiểu; con nuôi/giám hộ có nhãn. Ký hiệu phải có legend và text tương đương. Không dùng xanh/đỏ duy nhất để mã hóa giới tính hoặc sống/mất.

Người xuất hiện ở nhiều nhánh dùng occurrence ID khác nhưng canonical person ID giống; hiển thị “Xuất hiện tại nhánh khác”. Khi bấm, luôn về cùng một hồ sơ. Không kéo thả node làm thay đổi quan hệ; bản 1 chỉ kéo viewport.

## 7. Trạng thái và microcopy

Loading: skeleton giữ kích thước; nút gửi hiển thị “Đang gửi đề nghị…”, disable trong request nhưng luôn có timeout/retry an toàn. Thành công: “Đề nghị đã được gửi. Mã theo dõi: …”; không nói “Đã cập nhật gia phả” trước khi duyệt.

Unknown: “Chưa xác định”, không tự điền “Không có”. Restricted: “Thông tin này được giới hạn theo quyền truy cập”; không tiết lộ giá trị hoặc lý do nhạy cảm. Search empty: “Chưa tìm thấy trong phạm vi bạn được xem. Thử tên gọi khác hoặc chọn lại chi họ.”

Giỗ âm: luôn hiện “Âm lịch” và năm dương của lần diễn ra. Demo: “Dữ liệu minh họa — không phải lịch sử thực tế của dòng họ”. Thông báo mất mạng không che form; draft cục bộ chỉ lưu nội dung không nhạy cảm khi được cho phép, không lưu PII trong localStorage.

## 8. Motion, hình ảnh và nhạc

Transition 120–180ms cho menu/dialog; không parallax, carousel tự chạy hoặc animation cây liên tục. `prefers-reduced-motion` tắt chuyển động không thiết yếu. Không phát nhạc, video/audio tự động. Ảnh có alt phù hợp, kích thước cố định để tránh nhảy trang; ảnh trang trí alt rỗng.

## 9. Visual approval H1

Agent cung cấp screenshot 390×844 và 1440×1000 của năm màn hình chủ chốt, thêm 320px và text zoom cho màn hình hồ sơ/form. Chủ dự án duyệt một hướng mặc định; không bắt chọn giữa nhiều concept chưa hoàn thiện. Ghi góp ý theo mã DS-xx, sửa tập trung design tokens trước khi lặp lại mọi màn hình.

`design/preview.html` giúp duyệt định hướng, nhưng không thay thế Figma, Storybook hoặc screenshot của ứng dụng thật. Các đoạn chữ demo không trở thành nội dung chính thức tự động.
