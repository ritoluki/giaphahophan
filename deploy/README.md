# Mẫu bàn giao production

Hai manifest là cấu trúc cần điền bằng bằng chứng thực, không phải kết quả triển khai. Null không được coi là đã đáp ứng. Agent dùng docs/20,21,23,29 để xây pipeline deploy/backup/restore. Lưu manifest có hash; H4 duyệt đúng hash, không theo tên file.

Không có endpoint production, credential hoặc cloud account của người dùng trong bộ hồ sơ. Chưa có Docker image, CI pipeline hoặc migration chạy thật. Những thành phần đó là output của backlog triển khai.
