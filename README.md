# FE Snapshot Studio

Công cụ biến bất kỳ giao diện web nào (từ địa chỉ **URL** hoặc **thư mục mã nguồn** bất kỳ) thành vùng thiết kế kéo thả trực quan để lên ý tưởng, đổi màu sắc, sửa nội dung, thay bố cục và xuất bản demo.

## Tính năng chính

- **Chụp giao diện từ URL (Snapshot):** Dùng Chromium ẩn tải trang, cuộn trang tải tài nguyên và đóng gói toàn bộ DOM + CSS + hình ảnh + font chữ thành một file HTML độc lập chạy offline.
- **Mở trực tiếp thư mục mã nguồn:** Tự động nhận diện stack (React, Vite, Next.js, Vue, Nuxt, Angular, SvelteKit, Astro, Django, Flask, Laravel, PHP, Rails, HTML tĩnh), tự cài đặt công cụ/dependencies thiếu, khởi chạy dev server và chụp giao diện đưa vào canvas.
- **Canvas kéo thả trực quan:**
  - Chọn phần tử, kéo thả sắp xếp lại vị trí trong bố cục Flex/Grid.
  - Nhấp đúp chuột để sửa chữ trực tiếp trên giao diện.
  - Kéo cạnh/góc để thay đổi kích thước (`width`/`height`).
  - Sao chép, nhân bản (`Ctrl+D`), sao chép/dán style (`Ctrl+Alt+C` / `Ctrl+Alt+V`), ẩn/hiện, hoàn tác/làm lại (`Ctrl+Z` / `Ctrl+Shift+Z`).
  - Chuyển đổi khung nhìn: Desktop (`1440px`), Laptop (`1024px`), Tablet (`768px`), Mobile (`390px`).
- **Bộ công cụ thiết kế (Inspector + Theme + Chèn):**
  - Chỉnh màu chữ, màu nền, ảnh nền/gradient, font chữ, cỡ chữ, khoảng cách `margin`/`padding` (Box Model), `flex`/`grid`, bo góc, viền, đổ bóng, độ mờ, sửa trực tiếp HTML.
  - 16 khối giao diện dựng sẵn kéo thả vào trang + lưu phần tử bất kỳ thành **Khối mẫu (Component)** để dùng lại.
  - **Đổi màu toàn trang** từ bảng màu tự động quét, đổi bộ màu Preset, đổi phông chữ toàn trang, tìm & thay thế văn bản hàng loạt.
- **Di động & Xuất bản:**
  - Xuất trang ra file **`.html` độc lập** hoặc ảnh **`.png`**.
  - Đóng gói toàn bộ project ra file **`.fesnap`** để mang sang thiết bị khác mở tiếp.

## Cài đặt & Khởi chạy

Yêu cầu: **Node.js >= 18**.

### Cách 1: Chạy nhanh
- **Windows:** Nhấp đúp vào `start.bat`
- **macOS / Linux:** Chạy `./start.sh`

### Cách 2: Chạy bằng dòng lệnh
```bash
npm install
npm start
```

Ứng dụng sẽ tự động mở tại `http://localhost:5178` (lần đầu chụp giao diện, nếu máy chưa có Chromium của Playwright, hệ thống sẽ tự động tải về).
