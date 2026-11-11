// Built-in UI blocks for dragging & dropping into the canvas, plus blank page template.

export const BLANK_PAGE_HTML = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>Trang mới</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
      background: #ffffff;
      line-height: 1.5;
    }
    a { color: inherit; }
  </style>
</head>
<body>
  <header style="display:flex;align-items:center;justify-content:space-between;padding:18px 48px;border-bottom:1px solid #e2e8f0;background:#ffffff">
    <div style="font-weight:700;font-size:20px;color:#4f46e5">BrandName</div>
    <nav style="display:flex;gap:28px;font-size:15px;color:#475569">
      <a href="#" style="text-decoration:none">Sản phẩm</a>
      <a href="#" style="text-decoration:none">Tính năng</a>
      <a href="#" style="text-decoration:none">Bảng giá</a>
      <a href="#" style="text-decoration:none">Liên hệ</a>
    </nav>
    <button style="padding:10px 18px;border-radius:8px;border:0;background:#4f46e5;color:#fff;font-weight:600;cursor:pointer">Bắt đầu ngay</button>
  </header>
  <section style="padding:88px 48px;text-align:center;max-width:960px;margin:0 auto">
    <span style="display:inline-block;padding:6px 14px;border-radius:999px;background:#eef2ff;color:#4f46e5;font-size:13px;font-weight:600;margin-bottom:18px">Phiên bản Demo Mới</span>
    <h1 style="font-size:48px;line-height:1.15;margin:0 0 18px;color:#0f172a">Thiết kế giao diện nhanh gấp 10 lần từ chính sản phẩm thật</h1>
    <p style="font-size:18px;color:#475569;max-width:640px;margin:0 auto 28px">Nhấp đúp vào bất kỳ dòng chữ nào để sửa nội dung, kéo thả để sắp xếp bố cục, hoặc chọn phần tử để đổi màu sắc ở thanh bên phải.</p>
    <div style="display:flex;gap:12px;justify-content:center">
      <button style="padding:13px 24px;border-radius:10px;border:0;background:#4f46e5;color:#fff;font-weight:600;font-size:15px">Dùng thử miễn phí</button>
      <button style="padding:13px 24px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;font-weight:600;font-size:15px">Xem tài liệu</button>
    </div>
  </section>
</body>
</html>`;

export const BUILTIN_BLOCKS = [
  {
    id: 'heading',
    name: 'Tiêu đề',
    icon: 'heading',
    html: `<h2 style="font-size:28px;font-weight:700;margin:12px 0;color:#0f172a">Tiêu đề mục mới</h2>`,
  },
  {
    id: 'text',
    name: 'Đoạn văn',
    icon: 'text',
    html: `<p style="font-size:16px;line-height:1.6;margin:8px 0;color:#334155">Nhập nội dung mô tả tại đây. Nhấp đúp chuột vào văn bản để chỉnh sửa trực tiếp.</p>`,
  },
  {
    id: 'button',
    name: 'Nút bấm',
    icon: 'button',
    html: `<button style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;border-radius:8px;border:0;background:#4f46e5;color:#ffffff;font-size:14px;font-weight:600;cursor:pointer">Nhấn vào đây</button>`,
  },
  {
    id: 'badge',
    name: 'Nhãn (Badge)',
    icon: 'badge',
    html: `<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:600">Mới</span>`,
  },
  {
    id: 'image',
    name: 'Hình ảnh',
    icon: 'image',
    html: `<img src="data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23e2e8f0'/%3E%3Cpath d='M220 230l65-75 55 60 45-45 65 60H190z' fill='%2394a3b8'/%3E%3Ccircle cx='255' cy='125' r='24' fill='%2394a3b8'/%3E%3C/svg%3E" alt="Image" style="max-width:100%;height:auto;border-radius:10px;display:block">`,
  },
  {
    id: 'input',
    name: 'Ô nhập liệu',
    icon: 'input',
    html: `<input type="text" placeholder="Nhập thông tin..." style="padding:10px 14px;border-radius:8px;border:1px solid #cbd5e1;font-size:14px;width:260px;background:#fff;color:#0f172a">`,
  },
  {
    id: 'box',
    name: 'Khung (Box)',
    icon: 'box',
    html: `<div style="padding:24px;border-radius:12px;border:1px solid #e2e8f0;background:#f8fafc;min-height:80px"><p style="margin:0;color:#475569">Khung chứa nội dung — kéo các khối khác thả vào đây.</p></div>`,
  },
  {
    id: 'cols2',
    name: '2 Cột',
    icon: 'columns',
    html: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:16px 0">
      <div style="padding:20px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0"><h3 style="margin:0 0 8px">Cột trái</h3><p style="margin:0;color:#475569">Nội dung cột 1</p></div>
      <div style="padding:20px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0"><h3 style="margin:0 0 8px">Cột phải</h3><p style="margin:0;color:#475569">Nội dung cột 2</p></div>
    </div>`,
  },
  {
    id: 'cols3',
    name: '3 Cột',
    icon: 'columns3',
    html: `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;padding:16px 0">
      <div style="padding:20px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0"><h4 style="margin:0 0 6px">Mục 1</h4><p style="margin:0;color:#64748b;font-size:14px">Mô tả ngắn gọn.</p></div>
      <div style="padding:20px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0"><h4 style="margin:0 0 6px">Mục 2</h4><p style="margin:0;color:#64748b;font-size:14px">Mô tả ngắn gọn.</p></div>
      <div style="padding:20px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0"><h4 style="margin:0 0 6px">Mục 3</h4><p style="margin:0;color:#64748b;font-size:14px">Mô tả ngắn gọn.</p></div>
    </div>`,
  },
  {
    id: 'card',
    name: 'Thẻ (Card)',
    icon: 'card',
    html: `<div style="border:1px solid #e2e8f0;border-radius:14px;padding:24px;background:#ffffff;box-shadow:0 4px 16px rgba(15,23,42,.05);max-width:360px">
      <span style="display:inline-block;padding:4px 10px;border-radius:99px;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:600;margin-bottom:10px">Tính năng</span>
      <h3 style="margin:0 0 8px;font-size:18px;color:#0f172a">Tiêu đề thẻ thông tin</h3>
      <p style="margin:0 0 16px;color:#64748b;font-size:14px;line-height:1.5">Mô tả ngắn gọn giá trị hoặc thông tin chính của thẻ này.</p>
      <button style="padding:8px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;font-weight:600;font-size:13px;cursor:pointer">Xem chi tiết →</button>
    </div>`,
  },
  {
    id: 'hero',
    name: 'Hero Banner',
    icon: 'hero',
    html: `<section style="padding:64px 32px;border-radius:16px;background:linear-gradient(135deg,#4f46e5,#0ea5e9);color:#ffffff;text-align:center;margin:16px 0">
      <h1 style="font-size:38px;margin:0 0 12px">Giải pháp tăng trưởng đột phá</h1>
      <p style="font-size:17px;opacity:.9;max-width:560px;margin:0 auto 24px">Tối ưu quy trình làm việc và ra mắt sản phẩm nhanh hơn với bộ công cụ trực quan.</p>
      <button style="padding:12px 24px;border-radius:10px;border:0;background:#ffffff;color:#4f46e5;font-weight:700;font-size:15px;cursor:pointer">Khám phá ngay</button>
    </section>`,
  },
  {
    id: 'navbar',
    name: 'Thanh điều hướng',
    icon: 'nav',
    html: `<header style="display:flex;align-items:center;justify-content:space-between;padding:16px 32px;background:#ffffff;border-bottom:1px solid #e2e8f0">
      <strong style="font-size:18px;color:#0f172a">Logo</strong>
      <nav style="display:flex;gap:24px;font-size:14px;color:#475569">
        <a href="#" style="text-decoration:none">Trang chủ</a>
        <a href="#" style="text-decoration:none">Giới thiệu</a>
        <a href="#" style="text-decoration:none">Dịch vụ</a>
        <a href="#" style="text-decoration:none">Liên hệ</a>
      </nav>
      <button style="padding:8px 16px;border-radius:8px;border:0;background:#0f172a;color:#fff;font-size:13px;font-weight:600">Đăng nhập</button>
    </header>`,
  },
  {
    id: 'form',
    name: 'Biểu mẫu',
    icon: 'form',
    html: `<form style="display:flex;flex-direction:column;gap:12px;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;max-width:420px">
      <h3 style="margin:0 0 4px;font-size:18px;color:#0f172a">Đăng ký nhận tư vấn</h3>
      <input type="text" placeholder="Họ và tên" style="padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px">
      <input type="email" placeholder="Email liên hệ" style="padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px">
      <button type="button" style="padding:11px;border-radius:8px;border:0;background:#4f46e5;color:#fff;font-weight:600;font-size:14px;cursor:pointer">Gửi thông tin</button>
    </form>`,
  },
  {
    id: 'divider',
    name: 'Đường kẻ ngang',
    icon: 'minus',
    html: `<hr style="border:0;border-top:1px solid #e2e8f0;margin:20px 0">`,
  },
  {
    id: 'spacer',
    name: 'Khoảng trống',
    icon: 'spacer',
    html: `<div style="height:40px"></div>`,
  },
  {
    id: 'footer',
    name: 'Chân trang',
    icon: 'footer',
    html: `<footer style="padding:36px 32px;background:#0f172a;color:#94a3b8;display:flex;justify-content:space-between;align-items:center;font-size:14px">
      <span style="color:#fff;font-weight:600">© 2026 BrandName</span>
      <div style="display:flex;gap:20px"><a href="#" style="color:#94a3b8;text-decoration:none">Điều khoản</a><a href="#" style="color:#94a3b8;text-decoration:none">Bảo mật</a></div>
    </footer>`,
  },
];
