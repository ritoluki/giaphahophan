# 12. Lịch âm Việt Nam, giỗ và sự kiện

## Nguyên tắc

Ngày nguồn và quy tắc tưởng niệm là hai đối tượng khác nhau. Ngày mất có thể là dương lịch nhưng gia đình tổ chức giỗ theo ngày âm; không sửa ngày mất khi đổi quy ước giỗ. `event_rules` giữ source date/recurrence/policy; `event_occurrences` chỉ là kết quả tính có version.

Lịch Việt Nam dùng múi giờ dân sự UTC+7 trong phạm vi tính hiện đại đã kiểm thử. Không lấy lịch Trung Quốc UTC+8 rồi đổi nhãn. Adapter mặc định được đánh giá là @dqcai/vn-lunar; README của tác giả là nguồn API, **không là bằng chứng độ chính xác tuyệt đối**. [S16] Cần golden fixtures độc lập, cross-check và xác minh license trước khi dùng.

## Hợp đồng adapter

`solarToLunar(SolarDate) -> LunarDate`; `lunarToSolar(LunarDate) -> SolarDate|InvalidDate`; `getMonthLength(year,month,isLeap)`; `getLeapMonth(year)`; `occurrencesBetween(rule,startDate,endDate,policyVersion)`.

Input là year/month/day integer, không JS Date phụ thuộc timezone máy. Adapter phải công bố `algorithmVersion`, supportedRange và limitations. Mục tiêu hỗ trợ chuyển đổi 1900–2099 sau kiểm chứng; ngày ngoài range vẫn lưu nguyên văn/structured, không tự tính giỗ hàng năm trước khi được xử lý thủ công.

## Precision và sự kiện

Event có loại death_anniversary, clan_anniversary, meeting, memorial_visit, celebration, scholarship, other. Date-only event dùng local date ở Asia/Ho_Chi_Minh; sự kiện có giờ lưu start/end timezone-aware với zone nguồn. Ngày giỗ không lặp bằng 365 ngày hoặc rrule yearly Gregorian.

EventRule gồm calendar, day, month, optional source year, source_is_leap, recurrence, leap_policy, short_month_policy, timezone, review_status, reminders và visibility. Ngày giỗ thường không cần biết năm mất; UI không ép nhập năm giả. Chưa biết ngày/tháng thì có thể lưu ghi chú nhưng không đặt lịch tự động.

## Policy tháng nhuận

| Policy | Hành vi |
|---|---|
| regular_only | Chỉ tháng thường; không thêm lần ở tháng nhuận |
| leap_only_skip | Chỉ tổ chức khi năm đó có đúng tháng nhuận tương ứng; năm khác không tạo occurrence |
| prefer_leap_else_regular | Có tháng nhuận tương ứng thì dùng tháng nhuận, nếu không dùng tháng thường |
| both_if_exists | Tạo cả tháng thường và tháng nhuận nếu tồn tại; mỗi lần có occurrence key riêng |

Demo dùng regular_only. Dữ liệu thật có source_is_leap=true phải chuyển needs_policy_review, không âm thầm lấy mặc định. Gia đình xác nhận H3 trước bật reminder thật. Giao diện luôn cho xem 3 lần sắp tới để người phụ trách phát hiện nhầm quy ước.

## Ngày 30 trong tháng chỉ có 29 ngày

Policy last_day, next_month_first, skip hoặc manual_override. Demo dùng last_day và gắn nhãn “Theo quy ước ngày cuối tháng”. Dữ liệu thật cần xác nhận; thay policy không sửa ngày gốc. Manual override gắn occurrence key gốc, lý do, người duyệt và ngày tổ chức mới, không tạo event mới không liên quan.

## Tính lần tới

Để tìm trong khoảng năm dương Y, xét các năm âm Y−1, Y, Y+1 phù hợp adapter rồi lọc solar occurrence trong khoảng, vì năm âm không bắt đầu ngày 01/01 dương. Sau đó áp dụng leap policy, short-month policy, override, dedupe và sort. Không đoán năm âm bằng year của Date.now.

Cache key = rule_id + rule_version + lunar_year + leap_instance + algorithm_version. Rule update invalidate future cache và notifications chưa gửi; UID sự kiện vẫn ổn định theo occurrence logical key. Ngày Tết/giỗ trong cùng năm không được dịch đi do máy server đặt UTC.

## Nhắc giỗ và RSVP

Reminders opt-in theo người; demo 7 ngày và 1 ngày, giờ 08:00 Asia/Ho_Chi_Minh. Scheduler định kỳ tìm due rows, không cron riêng cho từng người. Dedupe occurrence_id + recipient + channel + lead_days + rule_version, đồng thời kiểm tra lịch sử gửi khi đổi version để không gửi lại nhắc đã nhận cho cùng occurrence trừ update có ý nghĩa.

Email chỉ nói “Có sự kiện dòng họ sắp diễn ra” và link đăng nhập, trừ khi nội dung chi tiết được phép và người nhận chọn. Không public danh sách người tham dự. RSVP có trạng thái yes/no/maybe, số người đi cùng integer trong giới hạn, ghi chú optional restricted, thay đổi idempotent.

## ICS và lịch ngoài

Bản 1 hỗ trợ tải một sự kiện/all-day hoặc danh sách trong scope được phép; ngày xuất là solar occurrence, DTEND của all-day là ngày kế tiếp exclusive. UID ổn định, SEQUENCE tăng khi đổi lịch, hủy dùng status/cancel phù hợp. Không cung cấp public feed toàn họ. Feed cá nhân chỉ bổ sung khi token revocation và policy recheck đã được kiểm thử.

## Golden tests và giới hạn khẳng định

Ít nhất 40 golden dates từ hai nguồn độc lập được trích dẫn trong fixture; không chỉ lấy output chính thư viện làm expected. Có năm nhuận, tháng 29/30, đổi năm, Tết, UTC versus UTC+7 và trường hợp khác lịch Trung Quốc. Nếu hai nguồn đều dùng cùng thuật toán, ghi rõ chúng không độc lập về thuật toán.

Thêm property tests solar→lunar→solar cho toàn range đã công bố, invalid leap month, source year unknown, update policy, gửi sát nửa đêm, idempotency, năm trước/sau. Cross-check với người giữ gia phả trước dữ liệu thật. Nếu chưa qua golden gate, vẫn cho nhập/lưu ngày nguồn, nhưng calendar auto-compute production phải báo chưa sẵn sàng, không dùng ngày sai cho kịp release.
