import { api } from './api.js';
import { h, modal, toast } from './ui.js';
import { MIN_VIEWPORT_WIDTH, MAX_VIEWPORT_WIDTH, VIEWPORT_PRESETS, validateViewportWidth } from './viewport.js';

export function openCaptureDialog(onCapture) {
  let session = null;
  let busy = false;
  let disposed = false;
  const mode = h('select', { class: 'txt' },
    h('option', { value: 'public' }, 'Chụp URL trực tiếp (phiên mới)'),
    h('option', { value: 'session' }, 'Dùng trình duyệt & phiên đăng nhập'));
  mode.value = 'session';
  const url = h('input', { class: 'txt', 'aria-label': 'Địa chỉ trang web', placeholder: 'Dán URL rồi nhấn Enter để chụp', type: 'url' });
  const width = h('input', { class: 'txt', type: 'number', 'aria-label': 'Chiều rộng khi chụp', value: '1920', min: MIN_VIEWPORT_WIDTH, max: MAX_VIEWPORT_WIDTH, step: 1, list: 'capture-width-options' });
  const widthOptions = h('datalist', { id: 'capture-width-options' }, ...VIEWPORT_PRESETS.map(value => h('option', { value }, `${value}px`)));
  const widthPresets = h('div', { class: 'capture-presets' }, ...[390, 1440, 1920, 2560, 3840].map(value => h('button', {
    class: 'btn sm', type: 'button', onclick: () => { width.value = value; },
  }, `${value}px`)));
  const profile = h('input', { class: 'txt', value: 'studio', list: 'studio-profile-options', maxlength: 48 });
  // This preference contains a profile name only, never browser/session contents.
  try { profile.value = localStorage.getItem('fesnap.captureProfile') || 'studio'; } catch { /* storage disabled */ }
  const profiles = h('datalist', { id: 'studio-profile-options' });
  const tabs = h('select', { class: 'txt', 'aria-label': 'Tab cần chụp' });
  const status = h('p', { role: 'status', 'aria-live': 'polite', style: { overflowWrap: 'anywhere' } });
  const closeSession = async () => {
    if (!session) return;
    await api.closeBrowserSession(session.id);
    session = null;
    tabs.replaceChildren();
  };
  const updateTabs = (info, selectRequested = false) => {
    const previous = selectRequested ? info.selectedTabId : (tabs.value || info.selectedTabId);
    tabs.replaceChildren(...info.tabs.map(tab => h('option', { value: tab.id }, tab.url)));
    if (info.tabs.some(tab => tab.id === previous)) tabs.value = previous;
    status.textContent = info.tabs.length ? 'Đăng nhập và mở màn hình cần lấy trong trình duyệt, sau đó chọn tab và bấm chụp. Nếu mở tab mới, bấm “Cập nhật tab”.' : 'Không còn tab. Hãy đóng phiên và mở lại.';
  };
  const run = async operation => {
    if (busy || disposed) return;
    busy = true;
    sync();
    try { await operation(); }
    catch (error) { if (!disposed) { status.textContent = error.message; toast(error.message, 'error'); } }
    finally {
      busy = false;
      if (!disposed) sync();
    }
  };
  const open = h('button', { class: 'btn', onclick: () => run(async () => {
    status.textContent = 'Đang mở trình duyệt…';
    session = await api.openBrowserSession({ url: url.value.trim(), profile: profile.value.trim(), width: validateViewportWidth(width.value) });
    try { localStorage.setItem('fesnap.captureProfile', session.profile); } catch { /* storage disabled */ }
    if (!disposed) updateTabs(session, true);
  }) }, 'Mở trình duyệt');
  const refresh = h('button', { class: 'btn', onclick: () => run(async () => updateTabs(await api.browserSession(session.id))) }, 'Cập nhật tab');
  const stop = h('button', { class: 'btn', onclick: () => run(async () => { await closeSession(); status.textContent = 'Đã đóng trình duyệt. Profile được giữ cho lần sau.'; }) }, 'Đóng phiên');
  const sessionFields = h('div', { hidden: true },
    h('p', { class: 'capture-hint' }, 'Mở trình duyệt → đăng nhập nếu cần → chọn tab để chụp.'),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, open, refresh, stop),
    h('div', { class: 'form-row' }, h('label', {}, 'Tab cần chụp'), tabs),
    h('details', { class: 'inline-disclosure profile-settings' },
      h('summary', { title: 'Chỉ mở khi cần đổi profile; mặc định Studio dùng lại profile của dự án' }, 'Profile & đăng nhập'),
      h('div', {}, h('div', { class: 'form-row' }, h('label', {}, 'Profile Studio (chọn tên đã có hoặc nhập tên mới)'), profile, profiles),
        h('p', { class: 'capture-hint' }, 'Mặc định dùng profile “studio” riêng trên máy. Đăng nhập một lần; các lần chụp sau dùng lại trình duyệt và tài khoản đó. Đóng hộp chụp không đóng trình duyệt. Bạn có thể chọn lại profile cũ tại đây.'))));
  const dialog = modal({
    title: 'Chụp giao diện từ trang web',
    body: h('div', {},
      h('div', { class: 'form-row' }, h('label', {}, 'Cách chụp'), mode),
      h('div', { class: 'form-row' }, h('label', {}, 'Địa chỉ trang web'), url),
      h('div', { class: 'form-row' }, h('label', { title: 'Chiều rộng trang từ 240 đến 7680px; chọn nhanh bên dưới hoặc nhập số tùy chỉnh' }, 'Chiều rộng (px)'), width, widthOptions, widthPresets),
      sessionFields, status),
    actions: [
      { label: 'Đóng hộp chụp' },
      { label: 'Chụp giao diện', primary: true, onClick: () => run(async () => {
        if (mode.value !== 'session' && !url.value.trim()) throw new Error('Hãy nhập URL.');
        if (mode.value === 'session' && (!session || !tabs.value)) throw new Error('Hãy mở trình duyệt và chọn tab cần chụp.');
        status.textContent = 'Đang chụp và đóng gói giao diện…';
        const result = mode.value === 'session'
          ? await api.captureBrowserSession(session.id, tabs.value)
          : await api.capture({ url: url.value.trim(), width: validateViewportWidth(width.value) });
        if (disposed) return;
        await onCapture(result);
        dialog.close();
        toast('Đã chụp giao diện thành công!', 'ok');
      }) },
    ],
    onClose: () => {
      disposed = true;
    },
  });
  function sync() {
    const withSession = mode.value === 'session';
    sessionFields.hidden = !withSession;
    mode.disabled = busy;
    url.disabled = width.disabled = profile.disabled = busy;
    widthPresets.querySelectorAll('button').forEach(button => { button.disabled = busy; });
    open.disabled = busy;
    refresh.disabled = stop.disabled = busy || !session;
    tabs.disabled = busy || !session;
    const captureButton = dialog.footer.querySelector('.primary');
    captureButton.disabled = busy || (withSession && (!session || !tabs.value));
    captureButton.textContent = withSession ? 'Chụp tab đã chọn' : 'Chụp giao diện';
    captureButton.dataset.tooltip = withSession
      ? 'Đóng gói màn hình hiện tại của tab đã chọn vào canvas để chỉnh sửa, giữ nguyên phiên đăng nhập.'
      : 'Mở URL trong một phiên mới và đóng gói giao diện vào canvas để chỉnh sửa.';
  }
  mode.addEventListener('change', sync);
  tabs.addEventListener('change', sync);
  const reconnect = () => run(async () => {
    const result = await api.activeBrowserSession(profile.value.trim());
    session = result.session;
    tabs.replaceChildren();
    if (session) updateTabs(session, true);
    else status.textContent = 'Profile được giữ cho lần sau. Nhập URL rồi mở trình duyệt để bắt đầu.';
  });
  profile.addEventListener('input', () => { session = null; tabs.replaceChildren(); sync(); });
  url.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      if (mode.value === 'session' && !session) open.click();
      else dialog.footer.querySelector('.primary').click();
    }
  });
  void api.browserProfiles().then(names => {
    if (!disposed) profiles.replaceChildren(...names.map(name => h('option', { value: name })));
  }).catch(error => { if (!disposed) status.textContent = 'Không tải được danh sách profile: ' + error.message; });
  sync();
  void reconnect();
  url.focus();
  return dialog;
}
