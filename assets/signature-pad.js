/* ============================================================
 * 签名板组件（移植自小程序 components/signature）
 * HTML5 Canvas + Pointer Events：PC 鼠标 / 移动端触摸均可绘制
 * 用法：openSignaturePad({ onConfirm: function(dataURL){}, onCancel: fn })
 * ============================================================ */

function openSignaturePad(opts) {
  opts = opts || {};
  document.querySelectorAll('.signature-overlay').forEach(function (el) { el.remove(); });

  var overlay = document.createElement('div');
  overlay.className = 'signature-overlay';
  overlay.innerHTML =
    '<div class="signature-modal">' +
      '<div class="signature-header">' +
        '<span>请签名</span>' +
        '<span class="signature-close" title="关闭">×</span>' +
      '</div>' +
      '<div class="signature-canvas-wrap">' +
        '<canvas class="signature-canvas"></canvas>' +
        '<div class="signature-tip">请在上方区域签名</div>' +
      '</div>' +
      '<div class="signature-footer">' +
        '<button class="btn btn-default sig-clear">清除</button>' +
        '<span class="flex-spacer"></span>' +
        '<button class="btn btn-secondary sig-cancel">取消</button>' +
        '<button class="btn btn-primary sig-confirm">确认签名</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  var canvas = overlay.querySelector('.signature-canvas');
  var tip = overlay.querySelector('.signature-tip');
  var ctx = canvas.getContext('2d');
  var drawing = false;
  var hasInk = false;
  var last = null;

  function resize() {
    var wrap = canvas.parentElement;
    var cssW = Math.min(wrap.clientWidth - 4, 640);
    var cssH = Math.min(260, Math.max(180, window.innerHeight * 0.32));
    var ratio = window.devicePixelRatio || 1;
    /* 保存旧笔迹 */
    var old = null;
    if (hasInk) {
      try { old = ctx.getImageData(0, 0, canvas.width, canvas.height); } catch (e) { old = null; }
    }
    canvas.width = Math.round(cssW * ratio);
    canvas.height = Math.round(cssH * ratio);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (old) {
      try { ctx.putImageData(old, 0, 0); } catch (e) { /* 忽略 */ }
    }
  }
  resize();

  function pos(e) {
    var rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.style.touchAction = 'none';

  canvas.addEventListener('pointerdown', function (e) {
    drawing = true;
    hasInk = true;
    tip.style.display = 'none';
    last = pos(e);
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drawing) return;
    var p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    e.preventDefault();
  });
  function endDraw() { drawing = false; last = null; }
  canvas.addEventListener('pointerup', endDraw);
  canvas.addEventListener('pointercancel', endDraw);
  canvas.addEventListener('pointerleave', endDraw);

  function clearAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk = false;
    tip.style.display = '';
  }

  function close() {
    overlay.remove();
    if (opts.onCancel) opts.onCancel();
  }

  overlay.querySelector('.signature-close').onclick = close;
  overlay.querySelector('.sig-cancel').onclick = close;
  overlay.querySelector('.sig-clear').onclick = clearAll;
  overlay.querySelector('.sig-confirm').onclick = function () {
    if (!hasInk) { toast('请先签名', 'error'); return; }
    /* 导出为 PNG（白底，方便打印/预览） */
    var out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    var octx = out.getContext('2d');
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(canvas, 0, 0);
    var dataURL = out.toDataURL('image/png');
    overlay.remove();
    if (opts.onConfirm) opts.onConfirm(dataURL);
  };

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) close();
  });
}
window.openSignaturePad = openSignaturePad;
