// Right-hand Inspector panel: edits text, image/link attributes, typography,
// colors, background, spacing (box model), layout (flex/grid), borders, effects,
// and raw HTML of the currently selected element.

import { h, icon, hydrateIcons, colorToHex, fileToDataUrl, pickFile, modal, toast } from './ui.js';

const FONTS = [
  ['', 'Mặc định (kế thừa)'],
  ['Inter, system-ui, sans-serif', 'Inter / System Sans'],
  ['"Segoe UI", Roboto, sans-serif', 'Segoe UI / Roboto'],
  ['"Plus Jakarta Sans", sans-serif', 'Plus Jakarta Sans'],
  ['Poppins, sans-serif', 'Poppins'],
  ['Montserrat, sans-serif', 'Montserrat'],
  ['Georgia, "Times New Roman", serif', 'Serif (Georgia)'],
  ['"JetBrains Mono", Consolas, monospace', 'Monospace'],
];

const SHADOW_PRESETS = [
  ['', 'Không đổ bóng'],
  ['none', 'Tắt (none)'],
  ['0 1px 3px rgba(0,0,0,0.12)', 'Nhẹ (SM)'],
  ['0 4px 12px rgba(0,0,0,0.12)', 'Vừa (MD)'],
  ['0 12px 28px rgba(0,0,0,0.18)', 'Nổi bật (LG)'],
  ['0 24px 48px rgba(0,0,0,0.25)', 'Sâu (XL)'],
];

function pxVal(v) {
  if (!v || v === 'auto' || v === 'normal' || v === 'none') return '';
  const n = parseFloat(v);
  return Number.isFinite(n) ? String(Math.round(n)) : v;
}

function withUnit(v, def = 'px') {
  v = String(v).trim();
  if (!v) return '';
  if (/^-?\d+(\.\d+)?$/.test(v)) return v + def;
  return v;
}

export class Inspector {
  constructor(root, canvas) {
    this.root = root;
    this.canvas = canvas;
    canvas.on('select', (el) => this.render(el));
    canvas.on('load', () => this.render(null));
    this.render(null);
  }

  setStyle(prop, val, commit = true) {
    const el = this.canvas.selected;
    if (!el) return;
    this.canvas.setStyle(el, prop, val, commit);
  }

  colorRow(label, prop, cs) {
    const cur = cs.getPropertyValue(prop);
    const hex = colorToHex(cur);
    const picker = h('input', {
      type: 'color',
      value: hex,
      oninput: (e) => { txt.value = e.target.value; this.setStyle(prop, e.target.value, false); },
      onchange: (e) => this.setStyle(prop, e.target.value, true),
    });
    const txt = h('input', {
      class: 'txt',
      value: cur && cur !== 'rgba(0, 0, 0, 0)' ? cur : '',
      placeholder: 'trong suốt / mặc định',
      onchange: (e) => {
        const v = e.target.value.trim();
        this.setStyle(prop, v, true);
        if (v) picker.value = colorToHex(v);
      },
    });
    const clearBtn = h('button', {
      class: 'icon-btn',
      title: 'Đặt lại / trong suốt',
      html: icon('x'),
      onclick: () => {
        const resetVal = prop === 'background-color' ? 'transparent' : '';
        txt.value = resetVal;
        this.setStyle(prop, resetVal, true);
      },
    });
    return h('div', { class: 'row' },
      h('span', { class: 'lbl' }, label),
      h('div', { class: 'color-field' }, picker, txt, clearBtn));
  }

  render(el) {
    this.root.innerHTML = '';
    if (!el || !el.isConnected || !this.canvas.doc) {
      this.root.append(
        h('div', { class: 'panel-section' },
          h('h4', {}, 'Thuộc tính'),
          h('div', { class: 'panel-hint' },
            'Nhấp chuột vào bất kỳ phần tử nào trên trang để chỉnh màu sắc, phông chữ, kích thước, khoảng cách hoặc nội dung.',
            h('br'), h('br'),
            '• Nhấp đúp chuột để sửa chữ trực tiếp', h('br'),
            '• Giữ & kéo để di chuyển vị trí', h('br'),
            '• Kéo cạnh/góc để đổi kích thước', h('br'),
            '• Chuột phải để mở menu nhanh')));
      return;
    }

    const cs = this.canvas.win.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const isBody = el === this.canvas.body;

    /* ---- 1. Header & Quick Actions ---- */
    const headSec = h('div', { class: 'panel-section' },
      h('div', { class: 'el-head' },
        h('code', {}, `<${tag}>`),
        el.id ? h('span', { style: { color: 'var(--muted)', fontSize: '12px' } }, '#' + el.id) : null,
        h('span', { class: 'size' }, `${Math.round(rect.width)} × ${Math.round(rect.height)}`)),
      !isBody ? h('div', { class: 'row', style: { marginTop: '10px', marginBottom: 0 } },
        h('button', { class: 'btn sm', onclick: () => this.canvas.action('parent'), title: 'Chọn phần tử cha (Esc)' }, h('span', { html: icon('arrowUpLeft') }), 'Cha'),
        h('button', { class: 'btn sm', onclick: () => this.canvas.action('duplicate'), title: 'Nhân bản (Ctrl+D)' }, h('span', { html: icon('copy') }), 'Bản sao'),
        h('button', { class: 'btn sm', onclick: () => this.canvas.action('hide'), title: 'Ẩn/Hiện' }, h('span', { html: icon('eyeOff') }), 'Ẩn'),
        h('button', { class: 'btn sm danger', style: { flex: 'none' }, onclick: () => this.canvas.action('delete'), title: 'Xoá (Del)' }, h('span', { html: icon('trash') }))) : null);
    this.root.append(headSec);

    /* ---- 2. Content (Text / Image / Link / Input / HTML) ---- */
    const contentSec = h('div', { class: 'panel-section' }, h('h4', {}, 'Nội dung'));
    const hasOnlyText = el.children.length === 0 && !isBody;

    if (tag === 'img') {
      const preview = h('img', { class: 'img-preview', src: el.getAttribute('src') || '' });
      const srcInput = h('input', {
        class: 'txt',
        value: el.getAttribute('src') || '',
        placeholder: 'URL ảnh hoặc data:image/...',
        onchange: (e) => {
          el.setAttribute('src', e.target.value);
          preview.src = e.target.value;
          this.canvas.commit();
        },
      });
      const uploadBtn = h('button', {
        class: 'btn sm',
        onclick: async () => {
          const f = await pickFile('image/*');
          if (!f) return;
          const dataUrl = await fileToDataUrl(f);
          el.setAttribute('src', dataUrl);
          srcInput.value = dataUrl;
          preview.src = dataUrl;
          this.canvas.commit();
        },
      }, h('span', { html: icon('upload') }), 'Tải ảnh từ máy');
      const fitSel = h('select', {
        onchange: (e) => this.setStyle('object-fit', e.target.value, true),
      },
        ['', 'cover', 'contain', 'fill', 'scale-down'].map((v) =>
          h('option', { value: v, selected: cs.objectFit === v }, v || 'Mặc định')));
      contentSec.append(
        preview,
        h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Nguồn ảnh'), srcInput),
        h('div', { class: 'row' }, uploadBtn),
        h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Co giãn'), fitSel));
    } else if (hasOnlyText && this.canvas.canEditText(el)) {
      const ta = h('textarea', {
        rows: 2,
        value: el.textContent,
        oninput: (e) => { el.textContent = e.target.value; },
        onchange: () => this.canvas.commit(),
      });
      contentSec.append(h('div', { class: 'row' }, ta));
    } else if (!isBody && this.canvas.canEditText(el)) {
      contentSec.append(
        h('div', { class: 'row' },
          h('button', { class: 'btn sm', onclick: () => this.canvas.startEditing(el) },
            h('span', { html: icon('edit') }), 'Sửa văn bản trực tiếp (nhấp đúp)')));
    }

    if (tag === 'a') {
      contentSec.append(
        h('div', { class: 'row' },
          h('span', { class: 'lbl' }, 'Liên kết'),
          h('input', {
            class: 'txt',
            value: el.getAttribute('href') || '',
            onchange: (e) => { el.setAttribute('href', e.target.value); this.canvas.commit(); },
          })));
    }

    if (tag === 'input' || tag === 'textarea') {
      contentSec.append(
        h('div', { class: 'row' },
          h('span', { class: 'lbl' }, 'Placeholder'),
          h('input', {
            class: 'txt',
            value: el.getAttribute('placeholder') || '',
            onchange: (e) => { el.setAttribute('placeholder', e.target.value); this.canvas.commit(); },
          })),
        h('div', { class: 'row' },
          h('span', { class: 'lbl' }, 'Giá trị'),
          h('input', {
            class: 'txt',
            value: el.value || el.getAttribute('value') || '',
            oninput: (e) => { el.value = e.target.value; el.setAttribute('value', e.target.value); },
            onchange: () => this.canvas.commit(),
          })));
    }

    if (!isBody) {
      contentSec.append(
        h('div', { class: 'row', style: { marginBottom: 0 } },
          h('button', { class: 'btn sm', onclick: () => this.openHtmlEditor(el) },
            h('span', { html: icon('code') }), 'Sửa HTML'),
          h('button', { class: 'btn sm', onclick: () => this.canvas.action('component') },
            h('span', { html: icon('star') }), 'Lưu khối mẫu')));
    }
    this.root.append(contentSec);

    /* ---- 3. Typography ---- */
    const fontSec = h('div', { class: 'panel-section' }, h('h4', {}, 'Chữ & Kiểu chữ'));
    const fontSel = h('select', {
      onchange: (e) => this.setStyle('font-family', e.target.value, true),
    }, FONTS.map(([v, lbl]) => h('option', { value: v, selected: cs.fontFamily.includes(v.split(',')[0].replace(/"/g, '')) && v !== '' }, lbl)));

    const weightSel = h('select', {
      onchange: (e) => this.setStyle('font-weight', e.target.value, true),
    }, ['300', '400', '500', '600', '700', '800'].map((w) =>
      h('option', { value: w, selected: String(cs.fontWeight) === w }, w + (w === '400' ? ' (Thường)' : w === '600' ? ' (Bán đậm)' : w === '700' ? ' (Đậm)' : ''))));

    const alignSeg = h('div', { class: 'seg' },
      [['left', 'alignLeft'], ['center', 'alignCenter'], ['right', 'alignRight'], ['justify', 'alignJustify']].map(([al, ic]) =>
        h('button', {
          class: cs.textAlign === al ? 'on' : '',
          html: icon(ic),
          title: al,
          onclick: () => { this.setStyle('text-align', al, true); this.render(el); },
        })));

    const styleSeg = h('div', { class: 'seg' },
      h('button', {
        class: cs.fontStyle === 'italic' ? 'on' : '',
        onclick: () => { this.setStyle('font-style', cs.fontStyle === 'italic' ? 'normal' : 'italic', true); this.render(el); },
      }, 'I'),
      h('button', {
        class: cs.textDecorationLine.includes('underline') ? 'on' : '',
        onclick: () => { this.setStyle('text-decoration', cs.textDecorationLine.includes('underline') ? 'none' : 'underline', true); this.render(el); },
      }, 'U'),
      h('button', {
        class: cs.textTransform === 'uppercase' ? 'on' : '',
        onclick: () => { this.setStyle('text-transform', cs.textTransform === 'uppercase' ? 'none' : 'uppercase', true); this.render(el); },
      }, 'AA'));

    fontSec.append(
      this.colorRow('Màu chữ', 'color', cs),
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Font chữ'), fontSel),
      h('div', { class: 'grid2' },
        h('div', { class: 'cell' },
          h('label', { class: 'field-label' }, 'Cỡ chữ (px)'),
          h('input', { class: 'txt', value: pxVal(cs.fontSize), onchange: (e) => this.setStyle('font-size', withUnit(e.target.value), true) })),
        h('div', { class: 'cell' },
          h('label', { class: 'field-label' }, 'Độ đậm'),
          weightSel),
        h('div', { class: 'cell' },
          h('label', { class: 'field-label' }, 'Chiều cao dòng'),
          h('input', { class: 'txt', value: pxVal(cs.lineHeight), placeholder: 'auto', onchange: (e) => this.setStyle('line-height', withUnit(e.target.value), true) })),
        h('div', { class: 'cell' },
          h('label', { class: 'field-label' }, 'Giãn chữ (px)'),
          h('input', { class: 'txt', value: pxVal(cs.letterSpacing), placeholder: '0', onchange: (e) => this.setStyle('letter-spacing', withUnit(e.target.value), true) }))),
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Căn lề'), alignSeg),
      h('div', { class: 'row', style: { marginBottom: 0 } }, h('span', { class: 'lbl' }, 'Kiểu'), styleSeg));
    this.root.append(fontSec);

    /* ---- 4. Background ---- */
    const bgSec = h('div', { class: 'panel-section' }, h('h4', {}, 'Màu nền & Hình nền'));
    const bgImgInput = h('input', {
      class: 'txt',
      value: cs.backgroundImage && cs.backgroundImage !== 'none' ? cs.backgroundImage : '',
      placeholder: 'url(...) hoặc linear-gradient(...)',
      onchange: (e) => this.setStyle('background-image', e.target.value || 'none', true),
    });
    const bgUploadBtn = h('button', {
      class: 'btn sm',
      onclick: async () => {
        const f = await pickFile('image/*');
        if (!f) return;
        const d = await fileToDataUrl(f);
        const val = `url("${d}")`;
        bgImgInput.value = val;
        this.setStyle('background-image', val, false);
        this.setStyle('background-size', 'cover', false);
        this.setStyle('background-position', 'center', true);
      },
    }, h('span', { html: icon('image') }), 'Chọn ảnh nền');

    bgSec.append(
      this.colorRow('Màu nền', 'background-color', cs),
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Gradient/Ảnh'), bgImgInput),
      h('div', { class: 'row', style: { marginBottom: 0 } }, bgUploadBtn));
    this.root.append(bgSec);

    /* ---- 5. Size & Spacing (Box model) ---- */
    const boxSec = h('div', { class: 'panel-section' }, h('h4', {}, 'Kích thước & Khoảng cách'));
    const sideInput = (prop, cls) => h('input', {
      class: cls,
      value: pxVal(cs.getPropertyValue(prop)) || '0',
      title: prop,
      onchange: (e) => this.setStyle(prop, withUnit(e.target.value), true),
    });
    const boxModel = h('div', { class: 'box-model' },
      h('span', { class: 'tag' }, 'margin'),
      sideInput('margin-top', 't'),
      sideInput('margin-right', 'r'),
      sideInput('margin-bottom', 'b'),
      sideInput('margin-left', 'l'),
      h('div', { class: 'inner' },
        h('span', { class: 'tag' }, 'padding'),
        sideInput('padding-top', 't'),
        sideInput('padding-right', 'r'),
        sideInput('padding-bottom', 'b'),
        sideInput('padding-left', 'l'),
        h('div', { class: 'core' })));

    boxSec.append(
      h('div', { class: 'grid2' },
        h('div', { class: 'cell' },
          h('label', { class: 'field-label' }, 'Rộng (width)'),
          h('input', { class: 'txt', value: el.style.width || Math.round(rect.width) + 'px', onchange: (e) => this.setStyle('width', withUnit(e.target.value), true) })),
        h('div', { class: 'cell' },
          h('label', { class: 'field-label' }, 'Cao (height)'),
          h('input', { class: 'txt', value: el.style.height || 'auto', onchange: (e) => this.setStyle('height', withUnit(e.target.value), true) }))),
      boxModel);
    this.root.append(boxSec);

    /* ---- 6. Layout (Display / Flex / Grid) ---- */
    const laySec = h('div', { class: 'panel-section' }, h('h4', {}, 'Bố cục (Layout)'));
    const disp = cs.display;
    const dispSel = h('select', {
      onchange: (e) => { this.setStyle('display', e.target.value, true); this.render(el); },
    }, ['block', 'flex', 'inline-flex', 'grid', 'inline-block', 'inline', 'none'].map((d) =>
      h('option', { value: d, selected: disp === d }, d)));
    laySec.append(h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Hiển thị'), dispSel));

    if (disp.includes('flex')) {
      laySec.append(
        h('div', { class: 'row' },
          h('span', { class: 'lbl' }, 'Hướng'),
          h('select', { onchange: (e) => this.setStyle('flex-direction', e.target.value, true) },
            ['row', 'column', 'row-reverse', 'column-reverse'].map((d) => h('option', { value: d, selected: cs.flexDirection === d }, d)))),
        h('div', { class: 'row' },
          h('span', { class: 'lbl' }, 'Căn ngang'),
          h('select', { onchange: (e) => this.setStyle('justify-content', e.target.value, true) },
            ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'].map((d) => h('option', { value: d, selected: cs.justifyContent === d }, d)))),
        h('div', { class: 'row' },
          h('span', { class: 'lbl' }, 'Căn dọc'),
          h('select', { onchange: (e) => this.setStyle('align-items', e.target.value, true) },
            ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'].map((d) => h('option', { value: d, selected: cs.alignItems === d }, d)))));
    }
    if (disp.includes('flex') || disp.includes('grid')) {
      laySec.append(
        h('div', { class: 'row', style: { marginBottom: 0 } },
          h('span', { class: 'lbl' }, 'Khoảng cách'),
          h('input', { class: 'txt', value: pxVal(cs.gap), placeholder: '0px', onchange: (e) => this.setStyle('gap', withUnit(e.target.value), true) })));
    }
    this.root.append(laySec);

    /* ---- 7. Borders & Effects ---- */
    const fxSec = h('div', { class: 'panel-section' }, h('h4', {}, 'Viền, Bo góc & Hiệu ứng'));
    const shadowSel = h('select', {
      onchange: (e) => this.setStyle('box-shadow', e.target.value, true),
    }, SHADOW_PRESETS.map(([v, lbl]) => h('option', { value: v, selected: cs.boxShadow === v }, lbl)));

    const opVal = Math.round((parseFloat(cs.opacity) || 1) * 100);
    const opRange = h('input', {
      type: 'range', min: 0, max: 100, value: opVal,
      oninput: (e) => { opLabel.textContent = e.target.value + '%'; this.setStyle('opacity', String(e.target.value / 100), false); },
      onchange: (e) => this.setStyle('opacity', String(e.target.value / 100), true),
    });
    const opLabel = h('span', { style: { width: '38px', textAlign: 'right', flex: 'none', color: 'var(--muted)' } }, opVal + '%');

    fxSec.append(
      h('div', { class: 'grid2' },
        h('div', { class: 'cell' },
          h('label', { class: 'field-label' }, 'Bo góc (radius)'),
          h('input', { class: 'txt', value: pxVal(cs.borderRadius), placeholder: '0', onchange: (e) => this.setStyle('border-radius', withUnit(e.target.value), true) })),
        h('div', { class: 'cell' },
          h('label', { class: 'field-label' }, 'Độ dày viền (px)'),
          h('input', {
            class: 'txt',
            value: pxVal(cs.borderTopWidth),
            placeholder: '0',
            onchange: (e) => {
              const v = withUnit(e.target.value);
              this.setStyle('border-width', v, false);
              if (parseFloat(v) > 0 && cs.borderTopStyle === 'none') this.setStyle('border-style', 'solid', false);
              this.canvas.commit();
            },
          }))),
      this.colorRow('Màu viền', 'border-color', cs),
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Đổ bóng'), shadowSel),
      h('div', { class: 'row', style: { marginBottom: 0 } }, h('span', { class: 'lbl' }, 'Độ mờ'), opRange, opLabel));
    this.root.append(fxSec);

    hydrateIcons(this.root);
  }

  openHtmlEditor(el) {
    const ta = h('textarea', { rows: 12, value: el.outerHTML, style: { width: '100%' } });
    modal({
      title: 'Chỉnh sửa mã HTML của phần tử',
      body: ta,
      actions: [
        { label: 'Huỷ' },
        {
          label: 'Áp dụng',
          primary: true,
          onClick: (close) => {
            const node = this.canvas.fragmentToNode(ta.value);
            el.replaceWith(node);
            this.canvas.select(node);
            this.canvas.commit();
            close();
            toast('Đã cập nhật HTML', 'ok');
          },
        },
      ],
    });
  }
}
