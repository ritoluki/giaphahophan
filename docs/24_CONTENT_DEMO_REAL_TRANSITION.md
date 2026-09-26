# 24. Nội dung demo và chuyển sang dữ liệu thật

## Demo trung thực

Tên website “Phan Gia Phả” và khẩu hiệu “Gìn giữ nguồn cội — Kết nối các thế hệ” là đề xuất nhận diện, không là gia huấn được xác nhận. Mọi tên người, chi, số đời, sự kiện, quỹ và lịch sử trong fixture là hư cấu; nhãn demo xuất hiện ở header/banner, export và hồ sơ.

Không gắn quê quán có thật, ảnh nhà thờ thật, chân dung người thật hoặc danh nhân họ Phan vào cây chỉ vì cùng họ. Không tạo số điện thoại/email trông có thể liên hệ thật; dùng địa chỉ example.invalid khi cần fixture, không gửi được. Portrait demo là monogram, không nhân dạng AI.

## Bộ nội dung khởi đầu

Trang chủ có lời mời tra cứu; lịch sử có bài “Cách gìn giữ tư liệu của dòng họ” nêu đây là nội dung hướng dẫn; chi demo A/B/C/D; cây mẫu 5–6 tầng và hồ sơ có nguồn minh họa; 3 thông báo, 3 bài câu chuyện, 6 sự kiện minh họa, album placeholder, quỹ thu–chi synthetic cân sổ, FAQ và hướng dẫn đóng góp.

Không điền tổng số thành viên/ngày giỗ giả vào production-real. Thống kê luôn từ DB theo scope, kèm mode demo. Chưa có dữ liệu thì empty state trang nghiêm, không chép fixture vào tree thật để trang “trông đầy”.

## Kịch bản nhận tài liệu thật

Tạo `intake/<batch-id>` ngoài git hoặc storage private với quyền được duyệt. Phân loại original/working/extracted/reviewed; tính checksum; biên bản nhận nguồn và quyền dùng. Người phụ trách xác nhận các root/branches/dates/quan hệ, không để agent tự chọn theo suy đoán.

Cài mode real trên **dataset/tree đích sạch**, không đổi nhãn DEMO-P thành tên thật hàng loạt. Demo tree/project chỉ giữ trong staging hoặc khu demo tách biệt có banner; không để search trả lẫn demo+real. Nếu kiến trúc chỉ một tree hoạt động thì migration chuyển dataset phải explicit và có rollback.

## Cutover

Backup verified → đóng chỉnh sửa tree đích ngắn hạn nếu cần → dry-run → H5 approve hash → import → reconcile counts/edges/source/private policy → sample review với gia đình → publish từng nội dung đã được phép → invalidate cache/search → smoke → chỉ bỏ banner demo ở scope thật đã xác nhận.

Không gửi email “website chính thức” hoặc mở index search engine trước H5. Demo và staging noindex không thay access control; dữ liệu nhạy cảm vẫn private.

## Chất lượng sau cutover

Hàng đợi thiếu nguồn, không rõ ngày, người chưa nối, trùng tên, quan hệ mâu thuẫn. Không ép phải giải quyết tất cả uncertainty bằng bịa dữ liệu để đủ 100%. Hồ sơ có thể đúng ở trạng thái “chưa xác minh”. Thành viên gửi bổ sung, người giữ gia phả duyệt theo evidence.
