# Dữ liệu demo và kiểm thử

`demo-family.json` là canonical fixture để agent viết seed adapter, không phải SQL dump. Có 72 người hư cấu, sáu lớp thế hệ dòng chính, hai chi, mười hôn phối/quan hệ, tên trùng, tên dài, alias, người không rõ sống/mất, người trẻ tuổi, nhiều lần kết hôn, con nuôi, guardian, disputed edge và pedigree collapse. Unknown parents được để trống, không tạo tổ tiên thật từ internet.

Nhóm vợ/chồng được tạo để kiểm thử quan hệ; agent không coi năm minh họa là chứng cứ lịch sử. Seed phải giữ source provenance, khóa theo externalId và sourceNamespace; chạy lại không nhân bản. Không tạo tài khoản có mật khẩu mặc định. Demo-role handles được ánh xạ vào auth user test được tạo ngẫu nhiên ở local/staging, cấm bật ở production-real.

`negative-cases.json` là các tình huống dự kiến bị từ chối hoặc xử lý đặc biệt. Chưa có server để chạy các test này. `tools/validate_package.py` chỉ kiểm tra cấu trúc/quan hệ fixture, không thay security test của ứng dụng.

Ngày âm ở fixture là đầu vào kiểm thử quy tắc, không có expected solar date. Agent phải xây `tests/fixtures/lunar-golden.json` với tối thiểu 40 ngày đã tra hai nguồn độc lập trước khi phát hành tính lịch. Không tự dùng output thư viện làm expected. Dữ liệu thật không được ghi đè fixture demo; nhập qua H5 và giữ manifest.
