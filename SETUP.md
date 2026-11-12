# FE Snapshot Studio — Cài đặt trên máy mới

Sau khi clone, mở file tương ứng trong thư mục dự án:

| Máy | Setup lần đầu | Kiểm tra hệ thống | Chạy ứng dụng |
|---|---|---|---|
| Windows x64/ARM64 | Nhấp đúp `setup.bat` | `check.bat` | `start.bat` hoặc shortcut **FE Snapshot Studio** |
| macOS Intel/Apple Silicon | Terminal: `bash setup.sh` | `bash check.sh` | Nhấp đúp `start.command` hoặc `bash start.sh` |
| Linux x64/ARM64 | `bash setup.sh` | `bash check.sh` | `bash start.sh` |

`start` cũng tự chuẩn bị phần còn thiếu, nên có thể dùng trực tiếp sau khi clone. Setup trên macOS/Linux cấp quyền chạy cho các file `.sh` và `.command` của dự án; sau lần đầu có thể nhấp đúp `setup.command`, `check.command`, `start.command` trên macOS.

## Setup làm gì?

1. Kiểm tra hệ điều hành, kiến trúc CPU, Node.js và npm.
2. Nếu chưa có Node ≥20 kèm npm, tải **Node 24 portable từ nodejs.org**, xác minh SHA-256 từ manifest chính thức rồi giải nén vào `.tools/node/`. Không gỡ hay thay phiên bản Node toàn máy.
3. Kiểm tra thư viện dự án. Với bản clone mới, dùng `npm ci` theo `package-lock.json`; với thư mục thư viện đã tồn tại nhưng chưa đủ, dùng `npm install` để sửa phần thiếu. Không đổi danh sách dependencies của dự án.
4. Kiểm tra Chromium headless và Chromium dùng cho profile bằng cách chạy thử. Tải Chromium tương ứng Playwright khi cần.
5. Chuẩn bị `data/projects/` và `data/browser-profiles/studio/`, giữ nguyên dữ liệu đã có. Windows tạo shortcut có logo trong thư mục dự án.

`check` chỉ kiểm tra, không tải phần mềm, cài thư viện hoặc tạo dữ liệu dự án. Nó chạy thử Chromium bằng phiên kiểm tra tạm, không mở/đọc profile đăng nhập.

## Khởi chạy

Ứng dụng tự mở trình duyệt tại `http://localhost:5178`; nếu cổng bận, dùng cổng tiếp theo và in địa chỉ thực tế trong cửa sổ chạy. Giữ cửa sổ này mở trong lúc sử dụng. Nhấn `Ctrl+C` để dừng phiên ứng dụng do cửa sổ đó khởi chạy.

Nếu máy đã có Node/npm phù hợp, có thể dùng:

```sh
npm run setup
npm run check
npm start
```

Không tự mở trình duyệt giao diện:

```sh
npm start -- --no-open
```

Windows: `start.bat -NoOpen`. Tự động hóa không chờ Enter: `setup.bat -NoPause` hoặc `check.bat -NoPause`.

## Khi có lỗi

- **Lần đầu cần Internet** để tải Node, packages npm và Chromium. Khi mọi thứ đã cài đủ, có thể kiểm tra/khởi chạy offline; website cần chụp vẫn phải truy cập được.
- **Linux thiếu thư viện hệ thống:** chạy `bash setup.sh --with-deps`. Playwright có thể yêu cầu quyền `sudo` để cài gói hệ thống. Xem [hướng dẫn Playwright](https://playwright.dev/docs/browsers#install-system-dependencies).
- **Không tải được Node:** kiểm tra kết nối HTTPS đến `nodejs.org`, proxy/tường lửa, hoặc cài Node phù hợp từ [nodejs.org](https://nodejs.org/en/download) rồi chạy lại setup.
- **Không có công cụ tải/giải nén trên Unix:** cần `curl` hoặc `wget`, `tar`, cùng `sha256sum`, `shasum` hoặc `openssl` để xác minh. Thông báo setup chỉ rõ công cụ còn thiếu.
- **Hệ điều hành quá cũ hoặc không được Chromium hỗ trợ:** cần nâng cấp hệ điều hành. Bộ setup hỗ trợ Windows/macOS/Linux x64/ARM64 trong phạm vi mà Node và phiên bản Playwright đã khóa hỗ trợ; không bảo đảm chạy trên mọi bản phân phối/hệ điều hành cũ.
- **Windows báo script bị chặn bởi chính sách công ty:** liên hệ quản trị viên hoặc dùng Node/npm đã được cho phép để chạy các lệnh npm ở trên. Launcher không sửa execution policy toàn máy.

Không cần cài Chrome/Edge riêng. Profile mới cần đăng nhập website lần đầu; tài khoản từ trình duyệt cá nhân không tự chuyển sang Studio.

## Những gì được lưu trên máy

`.tools/`, `node_modules/`, `data/` và shortcut `.lnk` được Git bỏ qua. Máy khác clone sẽ setup môi trường riêng. Chuyển thiết kế bằng xuất/nhập `.fesnap`; không đưa profile đăng nhập vào Git.

Logo nguồn tại `public/assets/logo-mark.svg` và `logo.svg`; icon Windows `app.ico` và biểu tượng PNG đã có sẵn trong repo. Khi chủ động sửa logo, có thể tạo lại icon bằng `node scripts/generate-icons.mjs` sau khi đã setup.
