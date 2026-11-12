const HELP = {
  'I': 'Bật hoặc tắt chữ nghiêng cho phần tử đang chọn.',
  'U': 'Bật hoặc tắt gạch chân cho phần tử đang chọn.',
  'AA': 'Đổi chữ của phần tử đang chọn thành chữ in hoa hoặc trở về bình thường.',
  'left': 'Căn văn bản về bên trái.', 'center': 'Căn văn bản vào giữa.',
  'right': 'Căn văn bản về bên phải.', 'justify': 'Căn đều văn bản ở hai lề.',
  'Placeholder': 'Chữ gợi ý hiển thị khi ô nhập chưa có nội dung.',
  'Giá trị': 'Nội dung hiển thị bên trong ô nhập.',
  'Font chữ': 'Đổi phông chữ của phần tử đang chọn.',
  'Độ đậm': 'Chọn nét chữ mảnh, thường hoặc đậm.',
  'Co giãn': 'cover lấp đầy và cắt phần thừa; contain giữ trọn ảnh; fill kéo giãn theo khung.',
  'Chiều cao dòng': 'Khoảng cách giữa các dòng văn bản; có thể nhập số kèm đơn vị px.',
  'Giãn chữ (px)': 'Tăng hoặc giảm khoảng cách giữa các ký tự.',
  'Hiển thị': 'Chọn kiểu bố cục: block xếp khối, flex xếp theo hàng/cột, grid chia lưới; none sẽ ẩn phần tử.',
  'Hướng': 'Chọn xếp các phần tử con theo hàng ngang hoặc cột dọc; reverse đảo thứ tự hiển thị.',
  'Căn ngang': 'Phân bố phần tử con theo trục chính của Flex; trục này thay đổi theo Hướng.',
  'Căn dọc': 'Căn phần tử con theo trục phụ của Flex, vuông góc với Hướng.',
  'Khoảng cách': 'Khoảng trống giữa các phần tử con trong Flex hoặc Grid.',
  'Đổ bóng': 'Chọn mức đổ bóng quanh phần tử.',
  'Độ mờ': 'Điều chỉnh độ hiển thị từ trong suốt đến rõ hoàn toàn.',
  'Sửa HTML': 'Mở trình sửa mã HTML của phần tử. Dành cho chỉnh sửa nâng cao.',
  'Lưu khối mẫu': 'Lưu phần tử để chèn lại từ tab Chèn trong dự án này.',
  'Thay thế tất cả': 'Thay văn bản khớp trên toàn bộ trang hiện tại; có thể hoàn tác.',
  '+ URL': 'Mở website và chụp giao diện để thêm một trang vào dự án.',
  '+ Mã nguồn': 'Chọn thư mục mã nguồn, chạy dự án và chụp giao diện thành trang mới.',
  '+ Trắng': 'Thêm một trang trống để bắt đầu thiết kế.',
  'Mở trình duyệt': 'Mở URL bằng profile đã chọn; nếu profile đang mở sẽ dùng lại trình duyệt đó.',
  'Cập nhật tab': 'Lấy lại danh sách các tab sau khi bạn đăng nhập hoặc mở trang mới trong Chromium.',
  'Đóng phiên': 'Đóng trình duyệt của profile hiện tại. Dữ liệu profile trên máy vẫn được giữ.',
  'Đóng hộp chụp': 'Đóng hộp thoại này; trình duyệt và tài khoản đang đăng nhập vẫn được giữ.',
  'Chụp tab đã chọn': 'Đóng gói màn hình hiện tại của tab đã chọn vào canvas để chỉnh sửa.',
};

function labelOf(control) {
  return control.getAttribute('aria-label') || (control.matches('button,summary') ? control.textContent.trim() : '') || control.closest('.row')?.querySelector('.lbl')?.textContent.trim()
    || control.closest('.cell, .form-row')?.querySelector('label')?.textContent.trim()
    || control.textContent.trim();
}

export function enhanceControls(root = document) {
  root.querySelectorAll('button, input:not([type=file]), select, textarea, summary').forEach(control => {
    if (control.dataset.tooltip) return;
    const label = labelOf(control);
    const native = control.getAttribute('title');
    let help = HELP[native] || HELP[label] || native;
    const spacing = /^(margin|padding)-(top|right|bottom|left)$/.exec(native || '');
    if (spacing) help = `${spacing[1] === 'margin' ? 'Khoảng cách bên ngoài' : 'Khoảng cách bên trong'}, phía ${{ top: 'trên', right: 'phải', bottom: 'dưới', left: 'trái' }[spacing[2]]}; nhập số hoặc đơn vị CSS như px, %.`;
    if (!help && label) help = control.matches('button,summary') ? label : `Điều chỉnh ${label.toLowerCase()}.`;
    if (!help) return;
    control.dataset.tooltip = help;
    control.removeAttribute('title');
    if (!control.getAttribute('aria-label') && !control.matches('summary') && (!control.matches('button') || !control.textContent.trim())) control.setAttribute('aria-label', label || help);
  });
}

// Native disclosure controls keep fields mounted and preserve their event handlers.
export function collapseSections(root, state, initiallyOpen = []) {
  for (const section of [...root.children]) {
    if (!section.classList.contains('panel-section')) continue;
    const heading = section.querySelector(':scope > h4');
    if (!heading) continue;
    const title = [...heading.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim();
    const details = document.createElement('details');
    details.className = 'panel-section disclosure-section';
    details.open = state.has(title) ? state.get(title) : initiallyOpen.includes(title);
    const summary = document.createElement('summary');
    summary.textContent = title;
    summary.dataset.tooltip = `Mở hoặc thu gọn nhóm ${title.toLowerCase()}; các thiết lập vẫn được giữ.`;
    const body = document.createElement('div');
    body.className = 'disclosure-body';
    for (const button of [...heading.querySelectorAll('button')]) body.append(button);
    heading.remove();
    body.append(...section.childNodes);
    details.append(summary, body);
    details.addEventListener('toggle', () => state.set(title, details.open));
    // Update immediately as well when a render follows the same click.
    summary.addEventListener('click', () => state.set(title, !details.open));
    section.replaceWith(details);
  }
}

export function setupWorkspace(canvas) {
  const panels = { left: document.getElementById('navigation-panel'), right: document.getElementById('properties-panel') };
  let visible = { left: innerWidth > 720, right: innerWidth > 1100 };
  try { const saved = JSON.parse(localStorage.getItem('fesnap.workspacePanels')); if (typeof saved?.left === 'boolean' && typeof saved?.right === 'boolean') visible = saved; } catch { /* defaults */ }
  let beforeFocus = null;
  if (innerWidth <= 900 && visible.left && visible.right) visible.right = false;
  const focusButton = document.getElementById('btn-focus-mode');
  const apply = () => {
    for (const [side, panel] of Object.entries(panels)) {
      panel.hidden = !visible[side];
      document.querySelectorAll(`[data-panel-toggle="${side}"]`).forEach(button => {
        button.setAttribute('aria-expanded', String(visible[side]));
        button.classList.toggle('active', visible[side]);
      });
    }
    focusButton.setAttribute('aria-pressed', String(!!beforeFocus));
    focusButton.classList.toggle('active', !!beforeFocus);
    try { localStorage.setItem('fesnap.workspacePanels', JSON.stringify(visible)); } catch { /* storage disabled */ }
    requestAnimationFrame(() => canvas.layout());
  };
  document.querySelectorAll('[data-panel-toggle]').forEach(button => button.addEventListener('click', () => {
    const side = button.dataset.panelToggle;
    beforeFocus = null;
    visible[side] = !visible[side];
    if (innerWidth <= 900 && visible[side]) visible[side === 'left' ? 'right' : 'left'] = false;
    if (!visible[side]) document.getElementById(`btn-toggle-${side}`).focus();
    apply();
  }));
  focusButton.addEventListener('click', () => {
    if (beforeFocus) { visible = beforeFocus; beforeFocus = null; }
    else { beforeFocus = { ...visible }; visible = { left: false, right: false }; }
    apply();
  });
  window.addEventListener('resize', () => {
    if (innerWidth <= 900 && visible.left && visible.right) { visible.right = false; beforeFocus = null; apply(); }
  });
  apply();
  installTooltips();
}

function installTooltips() {
  const tooltip = document.createElement('div');
  tooltip.id = 'studio-tooltip';
  tooltip.className = 'studio-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.append(tooltip);
  let current = null;
  let timer;
  const hide = () => {
    clearTimeout(timer);
    if (current) {
      const ids = (current.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== tooltip.id);
      if (ids.length) current.setAttribute('aria-describedby', ids.join(' ')); else current.removeAttribute('aria-describedby');
    }
    current = null;
    tooltip.hidden = true;
  };
  const show = (control, delay = 250) => {
    if (!control || control === current) return;
    hide();
    if (!control.dataset.tooltip && control.title) { control.dataset.tooltip = control.title; control.removeAttribute('title'); }
    if (!control.dataset.tooltip) return;
    current = control;
    timer = setTimeout(() => {
      if (!control.isConnected || !control.getClientRects().length) return hide();
      tooltip.textContent = control.dataset.tooltip;
      tooltip.hidden = false;
      const r = control.getBoundingClientRect();
      tooltip.style.left = Math.max(8, Math.min(innerWidth - tooltip.offsetWidth - 8, r.left)) + 'px';
      tooltip.style.top = (r.bottom + tooltip.offsetHeight + 12 < innerHeight ? r.bottom + 8 : Math.max(8, r.top - tooltip.offsetHeight - 8)) + 'px';
      control.setAttribute('aria-describedby', `${control.getAttribute('aria-describedby') || ''} ${tooltip.id}`.trim());
    }, delay);
  };
  const target = event => event.target.closest?.('[data-tooltip], [title]');
  document.addEventListener('pointerover', event => show(target(event)));
  document.addEventListener('focusin', event => show(target(event), 0));
  document.addEventListener('pointerout', event => { if (current && !current.contains(event.relatedTarget)) hide(); });
  document.addEventListener('focusout', hide);
  document.addEventListener('pointerdown', hide);
  document.addEventListener('scroll', hide, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
}
