# FE Snapshot Studio

<img src="public/assets/logo.svg" alt="FE Snapshot Studio — Capture. Edit. Create." width="456">

**Máy mới sau khi clone:** Windows mở `setup.bat` rồi `start.bat`; macOS/Linux chạy `bash setup.sh` rồi `bash start.sh`. Dùng `check.bat` / `bash check.sh` để kiểm tra hệ thống. Nếu thiếu Node, setup tự tải bản portable vào thư mục dự án. Xem [hướng dẫn cài đặt](SETUP.md).

## Không gian chỉnh sửa gọn hơn

- Thanh công cụ chia nhóm dự án/xuất file và nhóm khung nhìn; nút tự xuống hàng khi không đủ chỗ.
- Bấm **Danh mục** hoặc **Thuộc tính** để thu gọn/mở lại từng panel. **Tập trung** ẩn cả hai; bấm lại khôi phục bố cục trước đó. Studio nhớ lựa chọn hiển thị trên trình duyệt giao diện.
- Các nhóm thuộc tính, Theme và Chèn có thể thu gọn. Các tùy chọn sửa HTML/lưu khối mẫu nằm trong **Nâng cao**; đổi profile nằm trong **Profile & đăng nhập** của hộp chụp.
- Rê chuột hoặc dùng Tab để xem tooltip giải thích chức năng. Escape đóng tooltip hoặc menu xuất file đang mở.
- Kiểm tra đầy đủ: `node --test --test-timeout=90000 tests/bootstrap.test.mjs tests/browser-sessions.test.mjs tests/capture-project.test.mjs tests/viewport.test.mjs tests/workspace-ui.test.mjs`.

## Khung nhìn lớn và thao tác nhanh

- Chụp URL mặc định ở 1920px; chọn nhanh 390/1440/1920/2560/3840px hoặc nhập chiều rộng bất kỳ từ 240 đến 7680px.
- Trong Editor, chọn preset Full HD, QHD, 4K, 5K, 8K hoặc nhập số vào ô chiều rộng. Kích thước được lưu theo từng trang; chế độ “Vừa khung” giúp xem toàn bộ chiều rộng trên màn hình nhỏ.
- Bấm **+ URL** trên thanh công cụ để chụp thêm trang, dán URL rồi nhấn Enter để bắt đầu. Chụp từ thư mục mã nguồn cũng có ô nhập chiều rộng.
- Kiểm tra: `node --test tests/browser-sessions.test.mjs tests/capture-project.test.mjs tests/viewport.test.mjs`.

## Chụp trang cần đăng nhập

1. Hộp thoại chụp URL mặc định dùng **Dùng trình duyệt & phiên đăng nhập**, với profile cố định `studio` của dự án.
2. Nhập URL và chọn chiều rộng trước khi mở. Profile mặc định nằm tại `data/browser-profiles/studio`; nếu trước đây dùng tên khác, mở **Profile & đăng nhập** để chọn lại tên đó một lần. Studio nhớ tên đã chọn trên trình duyệt giao diện.
3. Bấm **Mở trình duyệt**. Đăng nhập trực tiếp trong cửa sổ Chromium, hoàn tất OTP/SSO nếu website yêu cầu và mở màn hình cần chụp.
4. Quay lại Studio, bấm **Cập nhật tab** nếu mở tab mới, chọn đúng tab rồi bấm **Chụp tab đã chọn**. Studio chụp ngay tab đó, không điều hướng lại URL.
5. Chụp xong hoặc bấm **Đóng hộp chụp** vẫn giữ nguyên trình duyệt. Mở lại hộp chụp sẽ kết nối lại phiên của profile đã chọn. Bấm **Mở trình duyệt** với cùng URL sẽ đưa tab đang có lên trước; URL khác mở thêm tab trong cùng trình duyệt. Chỉ **Đóng phiên**, đóng cửa sổ Chromium hoặc dừng server mới kết thúc trình duyệt.

Profile dành riêng cho Studio nằm tại `data/browser-profiles/<tên>`, ngoài thư mục public và được Git bỏ qua qua quy tắc `data/`. Profile mới cần đăng nhập lần đầu; không tự lấy tài khoản từ Chrome/Edge cá nhân. Các lần mở đồng thời cùng profile được gộp về cùng trình duyệt. Cookies và dữ liệu lưu trữ của trình duyệt không được xuất vào `.fesnap`; nội dung đang hiển thị sau đăng nhập vẫn là nội dung được chụp. Không nhập mật khẩu vào cuộc trò chuyện. Luồng hiện tại dùng đăng nhập thủ công trong trình duyệt, không có form lưu tài khoản/mật khẩu hay chức năng nhập `storageState`.

Chế độ **Chụp URL trực tiếp** vẫn dùng phiên ẩn mới như trước.

Chromium được mở với chế độ khôi phục phiên trước (`--restore-last-session`), tự quản lý dữ liệu đăng nhập trong profile. Khi trình duyệt đang mở, Studio giữ cả trạng thái tạm thời, `sessionStorage` và nội dung chưa lưu trong tab. Website vẫn có thể yêu cầu đăng nhập lại khi phiên hết hạn, tài khoản bị đăng xuất hoặc theo chính sách của website; không bảo đảm khôi phục mọi trạng thái tạm thời sau khi đóng trình duyệt.

Kiểm tra luồng này bằng `node --test tests/browser-sessions.test.mjs` (Chromium headless, website và dữ liệu đăng nhập giả lập local; không dùng profile thật).

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

Yêu cầu: **Node.js >= 20**, hoặc dùng file setup để tự chuẩn bị Node portable.

### Cách 1: Chạy nhanh
- **Windows:** Nhấp đúp `setup.bat`, sau đó `start.bat` hoặc shortcut có logo **FE Snapshot Studio**.
- **macOS / Linux:** Chạy `bash setup.sh`, sau đó `bash start.sh`. macOS có thêm `start.command` để nhấp đúp sau lần setup đầu.

### Cách 2: Chạy bằng dòng lệnh
```bash
npm run setup
npm start
```

Trước khi khởi chạy, launcher kiểm tra thư viện và Chromium, tự cài phần còn thiếu. Ứng dụng tự mở tại `http://localhost:5178`; nếu cổng bận sẽ chọn cổng tiếp theo. Xem [SETUP.md](SETUP.md) để kiểm tra hệ thống, chạy không mở trình duyệt hoặc xử lý lỗi cài đặt.
