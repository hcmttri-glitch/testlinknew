# Mộc 1992 Social Hub

Hệ thống nội bộ để quản lý nhiều kênh mạng xã hội của Mộc 1992 trên một dashboard.

## Chức năng hiện có

- Đăng nhập phía máy chủ; không có đăng ký công khai.
- Quản lý nhiều tài khoản TikTok, Facebook, Instagram, Threads và YouTube.
- Ghi nhận người phụ trách, username, tên hiển thị và đường dẫn kênh.
- Lưu báo cáo chỉ số theo ngày: follower, views, reach, likes, comments, shares, saves, số bài đăng và clicks.
- Lưu bài đăng/video kèm ngày đăng, đường dẫn, người phụ trách và chỉ số hiệu quả.
- Lọc danh sách, xem lịch sử và xuất báo cáo CSV.
- Dữ liệu lưu trong SQLite trên máy chủ.
- Vai trò admin được thêm/sửa/xóa kênh và nhập báo cáo. Vai trò viewer chỉ được xem.

## Giới hạn tích hợp dữ liệu

Dashboard hiện **chưa tự động kết nối API** của TikTok, Meta, Threads hoặc YouTube. Các số liệu trong dashboard là số liệu do người dùng được cấp quyền nhập vào hoặc dữ liệu nhập từ quy trình khác. Không có số liệu minh họa mặc định.

Để tự động đồng bộ, cần triển khai và kiểm thử tích hợp riêng cho từng nền tảng, đăng ký ứng dụng/API tương ứng, xin đúng quyền truy cập và lưu token bí mật ở biến môi trường hoặc kho bí mật. Không đưa access token, client secret, mật khẩu hoặc mã thiết lập vào mã nguồn GitHub.

## Đăng nhập và tài khoản

- Không có đăng ký công khai.
- Mật khẩu được băm Argon2id; mật khẩu gốc không được lưu.
- Phiên đăng nhập lưu trong SQLite, thời hạn nhàn rỗi tối đa 8 giờ, cookie `HttpOnly`, `SameSite=Strict` và bật `Secure` trong production.
- Các thao tác POST/PATCH/DELETE dùng CSRF token. Đăng nhập bị giới hạn số lần thử.
- Tài khoản admin đầu tiên được tạo tại `/setup`; sau khi tạo thành công, trang thiết lập tự khóa.
- Tạo viewer từ terminal bằng `npm run admin:create -- viewer@example.com viewer`. Công cụ sẽ yêu cầu nhập mật khẩu trong terminal.

## Chạy trên máy phát triển

Yêu cầu Node.js 20 trở lên và nơi lưu trữ có thể giữ tệp SQLite.

1. Cài dependency: `npm install`.
2. Sao chép `.env.example` thành `.env`.
3. Đặt `SESSION_SECRET` và `ADMIN_SETUP_KEY` thành hai chuỗi ngẫu nhiên khác nhau, mỗi chuỗi dài ít nhất 32 ký tự.
4. Khởi chạy: `npm start`.
5. Mở `http://localhost:3000/setup`, nhập mã khởi tạo, email và mật khẩu quản trị.
6. Đăng nhập tại `http://localhost:3000/login`.

## Triển khai

Ứng dụng chạy bằng Node.js/Express nên GitHub Pages không thể chạy chức năng đăng nhập và API. Tệp `render.yaml` hiện chuẩn bị cấu hình dịch vụ Node trên Render kèm ổ lưu bền vững; việc tạo hoặc triển khai dịch vụ có thể phát sinh phí. Kiểm tra giá và cấu hình hiện hành của nhà cung cấp trước khi triển khai.

Trong production:
- Bắt buộc dùng HTTPS và `NODE_ENV=production`.
- Cấu hình `TRUST_PROXY` đúng với số proxy tin cậy của nhà cung cấp.
- Dùng ổ lưu trữ bền vững cho SQLite; không dùng filesystem tạm thời.
- Giữ `SESSION_SECRET` và `ADMIN_SETUP_KEY` trong phần secrets/environment của hosting.
- Không bật GitHub Pages cho repository này; trang dashboard cần chạy qua Express để được bảo vệ đăng nhập.

## Khuyến nghị vận hành

Mỗi kênh nên có người phụ trách và cập nhật số liệu cùng một thời điểm mỗi ngày/tuần. Khi số liệu cùng kênh và cùng ngày được nhập lại, bản ghi báo cáo sẽ được cập nhật thay vì tạo bản trùng. Xuất CSV định kỳ để lưu trữ và đối chiếu.

