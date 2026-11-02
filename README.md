# Mộc 1992 TikTok Analytics

Bản xem trước hiện chỉ dùng dữ liệu minh họa. Ứng dụng có đăng nhập phía máy chủ; không xuất bản trang HTML tĩnh để bảo vệ dashboard.

## Đăng nhập và tài khoản

- Không có đăng ký công khai. Quản trị viên tạo tài khoản từ dòng lệnh.
- Mật khẩu được băm Argon2id; mật khẩu gốc không được lưu.
- Phiên đăng nhập được lưu trong SQLite, thời hạn nhàn rỗi tối đa 8 giờ, cookie `HttpOnly`, `SameSite=Strict` và bật `Secure` trong môi trường production.
- Các thao tác POST dùng CSRF token. Đăng nhập bị giới hạn số lần thử.
- Người có quyền `admin` hoặc `viewer` đều được xem dashboard ở bản khung này; quản lý người dùng hiện qua lệnh quản trị.

## Chạy trên máy phát triển

Yêu cầu Node.js 20 trở lên và một máy chủ có thể lưu tệp SQLite bền vững.

1. Cài dependency: `npm install`.
2. Sao chép `.env.example` thành `.env`, rồi đặt `SESSION_SECRET` và `ADMIN_SETUP_KEY` thành hai chuỗi ngẫu nhiên khác nhau, mỗi chuỗi dài ít nhất 32 ký tự.
3. Khởi chạy: `npm start`.
4. Mở `http://localhost:3000/setup`, nhập mã khởi tạo, email và mật khẩu quản trị. Sau lần tạo tài khoản đầu tiên, trang thiết lập tự khóa.
5. Đăng nhập tại `http://localhost:3000/login`.

Tạo thêm tài khoản viewer từ terminal bằng `npm run admin:create -- viewer@example.com viewer`. Mật khẩu được nhập kín trong terminal và cần dài ít nhất 12 ký tự. Không có đăng ký công khai.

Trong production, bắt buộc dùng HTTPS và `NODE_ENV=production`. Cấu hình `TRUST_PROXY` đúng theo số proxy tin cậy của nhà cung cấp. Dùng nơi lưu trữ có ổ đĩa bền vững; không dùng SQLite trên môi trường mà tệp bị xóa khi khởi động lại hoặc có nhiều replica ghi đồng thời.

## Triển khai

GitHub Pages không thể chạy middleware đăng nhập phía máy chủ. Repo hiện công khai và có một trang `index.html` cũ độc lập; không bật GitHub Pages để bảo vệ dashboard. Tệp `render.yaml` chuẩn bị cấu hình một dịch vụ Node tại Singapore trên Render với ổ lưu bền vững 1 GB. Tạo dịch vụ từ Blueprint sẽ phát sinh phí; xác nhận giá hiện tại trong Render trước khi tạo.

Sau khi dịch vụ lên, lấy giá trị `ADMIN_SETUP_KEY` trong phần Environment của dịch vụ và mở `/setup` trên URL do Render cấp để tạo tài khoản chủ sở hữu. Mã thiết lập không cần gửi cho người khác. Sau khi tạo tài khoản, `/setup` trả về 404. Cấu hình tắt tự động triển khai theo commit; chỉ deploy khi bạn chủ động chọn trong Render.

Chưa có dữ liệu TikTok thật, backend lấy dữ liệu TikTok, OAuth Zalo, hay gửi báo cáo tự động. Tất cả chỉ số trên dashboard hiện là mẫu. Dịch vụ Render nhỏ nhất hiện niêm yết khoảng 7 USD/tháng và ổ lưu 1 GB khoảng 0,25 USD/tháng, trước mọi khoản vượt hạn mức; giá có thể thay đổi.
