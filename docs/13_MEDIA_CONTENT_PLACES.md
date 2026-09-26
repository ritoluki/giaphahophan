# 13. Tư liệu, nội dung và địa điểm

## Media lifecycle

`requested → uploading → uploaded → scanning → processing → ready` hoặc `rejected|failed|quarantined`. Only ready được xem theo quyền hoặc publish. Cancel không tự xóa một original đã được linked; cleanup orphan theo retention và manifest.

Giới hạn mặc định dự án: ảnh JPEG/PNG/WebP ≤15MB, PDF ≤25MB, audio MP3/M4A ≤50MB, video MP4 H.264/AAC ≤100MB; mỗi tài khoản 20 uploads/giờ và tối đa 500MB/ngày, có thể giảm theo quota. SVG, HTML, executable và macro office không nhận làm media hiển thị. File office nguồn đi intake private riêng, không browser execute.

MIME khai báo không được tin; check magic bytes, size thực, decompression limits, malware scan. Ảnh tạo derivative 320/640/1280/1920, auto-orient và bỏ EXIF GPS. Original giữ private và checksum; chỉ cho người có quyền nguồn tải. Không tạo public derivative vì asset đã được gắn vào một bài public; reviewer phải kiểm tra mọi người xuất hiện trong ảnh.

## Xem tư liệu

Image lightbox có keyboard/zoom/alt; PDF viewer có page index và fallback download đã authorize; không để trình đọc nhúng chạy JS. Audio/video có controls, không autoplay; transcript tùy chọn với nhãn do máy/đã kiểm tra. Mobile tải thumbnail trước, nội dung lớn chỉ theo thao tác người dùng. Private asset dùng no-store/short TTL như docs 09–10.

## Nguồn

Source: title, type, provenance, creator/provider, recorded_date, repository, original media, visibility, rights_note, confidence, description. Citation: page/folio/section/crop_locator, quoted_text tùy quyền, asserted_by, reviewed_by. Không bắt upload giấy tờ định danh để xác minh một quan hệ.

Source content có thể chứa thông tin người sống dù fact được ghi thuộc tổ tiên đã mất; quyền source phải đánh giá riêng. Không công khai toàn trang scan chỉ vì một dòng đã được dùng trong bài lịch sử public.

## CMS

Rich text dùng schema allowlist (heading, paragraph, list, quote, safe link, approved media); sanitize server và render bằng component an toàn. Không cho arbitrary HTML/iframe/script/css. Link ngoài rel phù hợp, scheme chỉ https/mailto khi đúng mục đích; không javascript: hoặc data:.

Content workflow draft → submitted → approved → published → archived. Lịch xuất bản do worker và check quyền/approval lại; sửa nội dung đang published tạo revision mới, không tự cập nhật public trước duyệt. Preview token có hạn và quyền, không index. Chỉ public projection vào sitemap/OG; draft title/summary không lọt bundle.

## Trang lịch sử

Timeline có nguồn, mức xác minh và khả năng thể hiện khoảng năm. Không ép một timeline không gián đoạn nếu tư liệu thiếu. “Truyền thống”, “Tổ tiên”, “Nhà thờ họ” đều có empty state lịch sự thay vì đoạn văn bịa. Bản demo dùng câu chữ minh họa, không tên di tích/quê quán có thật.

## Địa điểm, nhà thờ, mộ

Place có type ancestral_house, cemetery, burial_site, hometown, historical_place, event_venue; địa chỉ/tọa độ độc lập visibility. Bản 1 không lưu vị trí nhà ở thành viên trên bản đồ toàn họ. Burial record liên kết person, place, khu/lô, source và media; locator chi tiết restricted mặc định.

Map mặc định là card địa điểm và link “Mở bản đồ” có thông báo rời website. Không gửi tọa độ private đến tile/geocoding provider tự động. Interactive map là adapter đã triển khai với feature flag, chỉ bật khi H2 duyệt provider/quota/privacy; không scraping tile công cộng. Không có provider vẫn đủ tra cứu địa điểm bằng text và ảnh.

## Search và thống kê tư liệu

Chỉ index title/transcript sau lọc scope. Không index raw original sensitive vào công cụ ngoài. Counts theo assets người dùng xem được. Kiểm thử quyền khi một asset liên kết hai person có visibility khác nhau: link không nâng quyền asset; người có quyền person A chưa chắc được xem original chứa person B.
