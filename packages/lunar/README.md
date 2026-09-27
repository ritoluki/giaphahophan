# @phan/lunar

Adapter lịch Âm Việt Nam dùng cho domain, không phụ thuộc React hoặc múi giờ của máy chạy.

## Contract

- Dải tính toán được công bố: 1900–2099.
- Ngày dương và âm đều truyền bằng số nguyên `year/month/day`; adapter không dùng `Date` để tính.
- Lịch dân dụng Việt Nam dùng quy ước UTC+7 cho computation hiện đại. Không lấy kết quả UTC+8 rồi gắn nhãn Việt Nam.
- Ngày ngoài dải được giữ ở dạng raw/structured ở tầng gọi; adapter sẽ từ chối tự động tính.
- Tháng nhuận được biểu diễn bằng `isLeapMonth: true`; không suy luận chỉ từ tên/tháng.

## Implementation and verification

Production adapter bọc `@dqcai/vn-lunar@1.0.1`, có validation bổ sung vì thư viện nền tảng không tự từ chối mọi ngày âm không hợp lệ.

M10-01 có 44 golden solar dates (biên 1900/2099, Tết, Trung Thu, tháng 29/30 ngày, tháng nhuận và các mốc UTC+7/UTC+8 dễ nhầm). Mỗi fixture được kiểm tra với adapter và đối chiếu với implementation độc lập `@baostudio/viet-lunar@0.1.1`; test cũng kiểm tra round-trip và invalid leap month.

Hai package được dùng theo MIT license. Golden fixtures là dữ liệu kiểm thử, không phải dữ liệu gia phả thật.
