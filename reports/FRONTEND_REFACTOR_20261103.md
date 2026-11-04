# FE-UX-01 — Giao diện để người nhà tìm và xem gia phả

Ngày triển khai: 03–04/11/2026. Môi trường: Windows, Node 24.21.0, pnpm 12.6.0, Next standalone và Supabase local; chỉ dùng dữ liệu hư cấu. Đây là refactor frontend, không phải nghiệm thu tích hợp toàn bộ màn hình đọc với DB.

## Thay đổi

- Shared shell, chữ, ô nhập, nút và điều hướng được thống nhất. Trang chủ đưa tìm người lên đầu; điện thoại có năm mục điều hướng bằng cùng bộ biểu tượng. Nền đỏ trầm–giấy nhạt, logo và Noto Sans/Serif được giữ; bỏ hero trang trí, gradient, bóng và nhãn in hoa giãn cách. Nội dung chính 17px, ô nhập tối thiểu 16px, nút thao tác tối thiểu 48px.
- `/gia-pha` bắt đầu bằng chọn người. Khi đã chọn, một tiêu đề “Gia đình của [Tên]” dẫn vào Cha mẹ → Người đang xem và vợ/chồng hoặc bạn đời → Con. Mỗi người có đường xem gia đình và xem hồ sơ riêng. Người đang xem được đánh dấu bằng chữ và màu.
- Sơ đồ React Flow chỉ tải khi mở; ELK chạy trong Web Worker có hủy, thời hạn và đường quay lại danh sách khi lỗi. Đường nối có hai đầu thực. Chạm tên mở tóm tắt, không tự chuyển trang; có phóng to/thu nhỏ/định vị/xem toàn bộ/đóng, Escape và trả focus. Giới hạn 120 người trên điện thoại, 300 trên màn hình lớn; đây không phải cam kết hiệu năng cho toàn bộ gia phả rất lớn.
- Adapter có kiểu dùng chung cho danh sách và sơ đồ. Cha mẹ/con chỉ đến từ `parentLinks`; hôn phối chỉ xác định bạn đời. Quan hệ nuôi, giám hộ, nhiều hôn phối và cần đối chiếu được ghi rõ. Người xuất hiện ở nhiều đường quan hệ vẫn là một người.
- URL giữ người, chế độ, chi và số thế hệ; Back, tải lại và đường quay về từ hồ sơ giữ ngữ cảnh. Tra cứu giữ query và bộ lọc qua lịch sử trình duyệt; gõ tên không làm mất khoảng trắng hoặc focus.
- Hồ sơ đặt gia đình trước, các phần ít dùng được mở theo nhu cầu. Các trang tư liệu, lịch, tin, địa điểm, quỹ, khuyến học, đóng góp và quản trị dùng cùng hệ thống trình bày. Tài khoản phân biệt trạng thái đăng nhập qua helper xác minh sẵn có, không đưa token, email hoặc quyền vào payload giao diện.
- Nhãn, trạng thái, thông báo và nội dung hỗ trợ tiếp cận được Việt hóa. Giá trị API/DB và tư liệu do người dùng nhập được giữ nguyên. Lỗi chỉ chọn câu chữ từ mã cho phép; không render thông báo thô từ server. Các tên thuộc prototype JavaScript cũng được xử lý như mã lạ.
- Sửa lỗi có sẵn của form đề nghị: lấy đúng nút đã bấm để “Lưu bản nháp” gọi đường lưu nháp. Không thay hợp đồng lưu, phiên bản, idempotency hoặc xét duyệt.

## Hướng thiết kế và đánh giá

Skill: `design-taste-frontend`, app workflow, `editorial-greeting`, seed `20261103`, `--keep palette,type`. Không redraw. Dấu hiệu riêng của sản phẩm là tên người và ba nhóm quan hệ gia đình; tương tác trung tâm là chọn một người rồi lần qua các thế hệ. Không thêm ảnh người thật hoặc ảnh ngoài dự án. App workflow không yêu cầu số lượng ảnh hay hiệu ứng chuyển động của landing page.

ROUND 1

Seen in one second: tìm người và tên gia đình.
Idea: tên người và quan hệ được ghi nhận trở thành cấu trúc đọc của giao diện.
Live thing: tìm người, chuyển gia đình và mở sơ đồ thực.
Layout words by section: home=search/list/calendar; family=three generations; profile=family/details; admin=workspaces.
Scores: design 7 · usability 7 · creativity 7 · content 7.5 → overall 7.05.
Caps applied: app workflow; không áp dụng floor ảnh/motion của marketing page.
Top three problems: điều hướng tablet chưa thống nhất; lịch minh họa còn chữ kỹ thuật và panel kéo dài; cây có tiêu đề lặp khiến tên người xuống quá thấp. Đã sửa trong shared CSS, demo display projection và header cây.

ROUND 2

Seen in one second: tên người đang xem, với hành động xem gia đình hoặc hồ sơ.
Idea/Live thing: như vòng 1.
Layout words by section: giữ bố cục theo công việc, không biến mọi trang thành cùng một dãy thẻ.
Scores: chưa chấm hoàn tất trước khi sửa hết FAIL của inspector.
Caps applied: inspector phát hiện `data-ui` bọc toàn bộ cây sau khi đưa h1 vào component; đây là marker sai phạm vi, đã bỏ khỏi source. Hai điểm nhìn thấy trên ảnh cũng được sửa: panel tên gọi bị kéo dài và liên kết quản trị cuối bị cắt trên điện thoại.

ROUND 3 — bản bàn giao trên cổng3100

Seen in one second: tìm người ở trang chủ; tên người và ba nhóm thế hệ trong gia phả.
Idea: cấu trúc gia đình quyết định cách đọc, tên người là trọng tâm.
Live thing: tìm/chọn người, lần qua cha mẹ/con, chạm người trên sơ đồ rồi chọn hành động.
Layout words by section: home=search/list/calendar; family=generations; profile=family/details; admin=workspaces.
Scores: design 7.5 · usability 8 · creativity 7 · content 8 → overall 7.65. Đây là tự đánh giá trên ảnh, không phải điểm từ người dùng độc lập.
Caps applied: app workflow; không có FAIL inspector. Đã mở toàn bộ24 ảnh fold/page do lần inspector cuối tạo.
Top three remaining limitations: gia đình đông vẫn cần cuộn; phần tư liệu/lịch sử hồ sơ nằm sau gia đình theo ưu tiên đọc; chưa xác nhận thao tác trên điện thoại thật. Không thêm nội dung để lấp các quan hệ chưa có.

Inspector cuối: home0FAIL/2WARN, family0FAIL/2WARN, profile0FAIL/3WARN, admin0FAIL/2WARN tại390/768/1440. Không dùng `--allow` để bỏ FAIL. WARN nền giấy được giữ theo yêu cầu nhận diện; WARN canvas là cột1120px căn giữa với lề trái/phải160px trên viewport1440; WARN hàng không bằng chiều cao phản ánh số người/tên gọi khác nhau, tránh kéo thẻ rỗng; WARN below-fold của hồ sơ là lựa chọn đưa gia đình lên trước thông tin phụ. Không coi WARN là đã có người dùng duyệt.

## Bằng chứng kiểm tra local

Các log nằm trong [thư mục kiểm tra local](local/design-refactor-20261103/), ảnh hồi quy ở [bộ ảnh giao diện](design-review/frontend-refactor-20261103/). [Manifest nghiệm thu](design-review/frontend-refactor-20261103/acceptance.json) ghi build ID, PID, kết quả và SHA-256 của24ảnh PNG. Log local bị gitignore theo quy tắc repo; không chứa thông số secret.

| Kiểm tra | Trạng thái | Bằng chứng/phạm vi |
|---|---|---|
| Unit toàn workspace | PASS | `unit-verified.log`, 312 kiểm thử: contracts75, lunar4, domain143, worker27, web63; exit0 |
| Build standalone | PASS | `build-canvas-final.log`, exit0, bao gồm bản sửa giữ người trong vùng xem, worker layout và public assets/licenses |
| TypeScript/lint | PASS | `typecheck-verified.log`, `lint-verified.log`, exit0; lint0errors/1warning cấu hình PostCSS có sẵn |
| Hồi quy trình duyệt | PASS | `e2e-delivery-20261104.log`,237/237; sau bản sửa canvas, `canvas-final-20261104.log`30/30 luồng gia đình/axe/đo hình học, exit0. Bao gồm tìm kiếm,24 route bàn phím/axe, permission-denied và các luồng cũ trên ba viewport |
| Sáu chiều rộng, vùng chạm, ô nhập | PASS | `reflow-delivery-20261104.log`, 7/7, exit0; 25 màn hình × 320/360/390/412/768/1440; không tràn ngang, ô nhập ≥16px, nút chính ≥48px |
| Tên tiếng Việt dài và zoom | PASS mô phỏng | Cùng log reflow: viewport384×500 CSS px, deviceScaleFactor2 cho khung768×1000 vật lý; tên không ellipsis. Không gọi đây là thử trên điện thoại thật hoặc thao tác zoom UI của browser |
| Skill source lint | PASS với WARN | `taste-lint-final.log`: 0 FAIL/11 WARN; các padStart là hash, shadow:none không phải bóng thật, bóng duy nhất là menu đang mở |
| Skill browser inspector | PASS với WARN | `inspect-delivery-*.log`, tất cả0FAIL tại390/768/1440; trước sửa home có6FAIL/4WARN. 24 ảnh cuối trong `delivery/` đã được xem |
| Dependency pins/tree/licenses | PASS | `graph-dependency-tree.json`, `graph-license-check.json`, `VERSIONS.md` và `/licenses/Graph-NOTICE.vi.txt` |
| Dependency audit toàn dự án | FAIL | `dependency-audit-final.json`: 3critical/5high/5moderate/1low ở dependency nền tảng hiện có; không có finding theo đường React Flow/ELK. Cần bản vá tương thích và regression riêng trước phát hành |
| API/schema/RLS/worker domain diff | PASS kiểm tra phạm vi | `scope-review.log`, git diff exit0 ở API, migrations, contracts, domain, fixtures và worker; `diff-check.log` exit0. Screenshot không chứng minh policy DB |
| Điện thoại thật, Safari/WebKit, screen reader, staging | NOT_RUN | Giữ là gate riêng; không suy từ Chromium hoặc axe |

Ảnh sơ đồ sau khi mở tóm tắt được lưu thêm cho desktop, mobile và320px, cả ba ảnh cuối đã được xem. Vòng này phát hiện vùng sơ đồ thấp đi khi tóm tắt xuất hiện: vị trí người đang chọn cần căn lại sau ResizeObserver. Đã thêm căn giữa theo kích thước còn lại và assertion đo toàn bộ khung người nằm trong canvas;30/30 trường hợp gia đình/axe PASS sau bản sửa, scoped lint0errors. Phạm vi sửa không tác động trang chủ, hồ sơ đóng sơ đồ hoặc quản trị.

## Giới hạn và mốc tiếp theo

Các màn hình đọc chính vẫn dùng fixture hư cấu theo chế độ demo đã có; không tuyên bố đã nối hết DB. Các form yêu cầu quyền tiếp tục dùng kiểm tra server hiện tại. Không migration, gửi email thật, dùng dữ liệu thật, đổi public policy hoặc deploy production.

H1 vẫn chờ chủ dự án xem và thử bản cụ thể; H2–H5 không được suy là approved. FE-UX-01 giữ IN_PROGRESS cho đến khi hoàn tất các gate nghiệm thu còn lại. Tiếp theo là cho người nhà thử tìm người → xem gia đình → quay về hồ sơ, rồi triển khai mốc DB search → profile → family/tree → kinship cùng kiểm tra quyền; sau đó đóng góp → người khác duyệt → thay đổi hiện lại trong gia phả.

Readiness endpoint đang trả503 theo phần triển khai cũ; home/live200 chỉ xác nhận app đang phục vụ. Dependency audit FAIL cũng ngăn việc gọi bản này production-ready.

## Bản chạy và khôi phục phiên

Địa chỉ: http://127.0.0.1:3100. Web mới PID21492, build `.next-frontend-20261103`; worker local PID22896 được giữ nguyên. Web cũ PID7776 đã dừng sau khi xác minh danh tính/socket/HTTP. Các preview3101 do phiên này tạo đã dừng. Metadata/probe: `delivery-runtime.json`, log web `web-3100.stdout.log` và `web-3100.stderr.log` trong thư mục local evidence.

Helper local ở `reports/local/design-refactor-20261103/local-build.mjs`: `build` hoặc `start 3100`. Helper lấy cấu hình Supabase loopback từ CLI trong bộ nhớ, từ chối endpoint khác local, không ghi secret và không tự dừng tiến trình chiếm cổng. Xác minh PID hiện tại trước khi dừng/khởi động lại; không dùng `.env.local` hosted để chạy demo.

Ngày04/11 owner yêu cầu chạy lại và push code: artifact trên được dùng lại, web416 và worker3644 đã khởi động bằng cấu hình local. Các PID trong manifest ảnh là bằng chứng của lần kiểm thử trước; metadata hiện tại ở `web-3100.json` và `worker-restart-20261104.json`. Kết quả commit/push được ghi trong `state/HANDOFF.md`; không suy H1 approved từ việc push.
