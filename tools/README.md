# Công cụ bổ trợ bộ tài liệu

## Kiểm tra tính nhất quán

`python tools/validate_package.py`

Cần Python 3.10+, PyYAML, jsonschema trong môi trường cô lập. Script không cài package, không gọi mạng, không deploy. Chỉ kiểm tra JSON, references OpenAPI, DAG của backlog, fixture và cân bằng sổ minh họa, declaration SQL, contrast tokens và DTO compile khi có tsc. Nó không chứng minh authorization/RLS, lịch âm, tải thực hoặc production.

PACKAGE_VALIDATION.json là bằng chứng phạm vi bộ hồ sơ. Ứng dụng vẫn NOT_IMPLEMENTED/NOT_TESTED, mọi acceptance test trong state vẫn NOT_RUN.

## Dữ liệu đồ thị lớn

`node tools/generate-benchmark.mjs 10000 ./tmp/benchmark-10000.json`

Sinh graph hư cấu bằng Node chuẩn, không cần dependency. Count từ 100 đến 50.000; không ghi đè file có sẵn. Format benchmark_graph_v1 là đầu vào cho adapter stress mà agent xây, không phải demo-family.json đầy đủ hoặc SQL seed. Agent phải benchmark truy vấn/layout/render thực bằng phiên bản app thật rồi ghi môi trường và số đo; file 10.000 người sinh được không đồng nghĩa ứng dụng chạy tốt với 10.000 người.
