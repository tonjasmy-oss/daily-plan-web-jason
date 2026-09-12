/* ============================================================
 * 纯 SVG 图表（无依赖）- 深色 Blurple 主题
 * 网格线/坐标等使用 CSS 变量等价的颜色（硬编码以避免外部 SVG 失效）
 * ============================================================ */

/* 浅色色板 - 用于 SVG 内部（必须使用字面颜色） */
var CHART_COLORS = {
  grid:       '#2E3468',
  axisLabel:  '#7E84A8',
  barLabel:   '#F5F7FA',
  empty:      '#4D5278',
  defaultBar: '#5865F2',
  donutText:  '#F5F7FA',
  donutLabel: '#7E84A8'
};

/* 柱状图 */
function drawBarChart(container, data, opts) {
  opts = opts || {};
  var w = opts.width || 480, h = opts.height || 220;
  var pad = { top: 20, right: 16, bottom: 30, left: 36 };
  var innerW = w - pad.left - pad.right;
  var innerH = h - pad.top - pad.bottom;
  var max = Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1]));
  var barW = innerW / data.length * 0.7;
  var gap = innerW / data.length * 0.3;

  var svg =
    '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" preserveAspectRatio="xMidYMid meet">' +
    [0, 0.25, 0.5, 0.75, 1].map(function (p) {
      var y = pad.top + innerH * (1 - p);
      return '<line x1="' + pad.left + '" x2="' + (w - pad.right) + '" y1="' + y + '" y2="' + y + '" stroke="' + CHART_COLORS.grid + '" stroke-width="1"/>' +
             '<text x="' + (pad.left - 6) + '" y="' + (y + 4) + '" text-anchor="end" fill="' + CHART_COLORS.axisLabel + '" font-size="10">' + Math.round(max * p) + '</text>';
    }).join('') +
    data.map(function (d, i) {
      var barH = innerH * d.value / max;
      var x = pad.left + i * (barW + gap) + gap / 2;
      var y = pad.top + innerH - barH;
      return '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + barH + '" fill="' + (d.color || CHART_COLORS.defaultBar) + '" rx="3">' +
               '<title>' + d.label + ': ' + d.value + '</title>' +
             '</rect>' +
             '<text x="' + (x + barW / 2) + '" y="' + (y - 4) + '" text-anchor="middle" fill="' + CHART_COLORS.barLabel + '" font-size="10" font-weight="600">' + d.value + '</text>' +
             '<text x="' + (x + barW / 2) + '" y="' + (h - 10) + '" text-anchor="middle" fill="' + CHART_COLORS.axisLabel + '" font-size="11">' + d.label + '</text>';
    }).join('') +
    '</svg>';
  container.innerHTML = svg;
}

/* 环形图 */
function drawDonutChart(container, data, opts) {
  opts = opts || {};
  var w = opts.width || 200, h = opts.height || 200;
  var cx = w / 2, cy = h / 2;
  var r = opts.radius || 70;
  var stroke = 22;
  var total = data.reduce(function (s, d) { return s + d.value; }, 0);
  if (total === 0) {
    container.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + CHART_COLORS.grid + '" stroke-width="' + stroke + '"/>' +
      '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" fill="' + CHART_COLORS.empty + '" font-size="14">无数据</text>' +
      '</svg>';
    return;
  }
  var angle = -Math.PI / 2;
  var arcs = data.map(function (d) {
    var portion = d.value / total;
    var sweep = portion * Math.PI * 2;
    var x1 = cx + r * Math.cos(angle);
    var y1 = cy + r * Math.sin(angle);
    var x2 = cx + r * Math.cos(angle + sweep);
    var y2 = cy + r * Math.sin(angle + sweep);
    var large = sweep > Math.PI ? 1 : 0;
    var path = 'M ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2;
    var arc = '<path d="' + path + '" fill="none" stroke="' + (d.color || CHART_COLORS.defaultBar) + '" stroke-width="' + stroke + '"><title>' + d.label + ': ' + d.value + '</title></path>';
    angle += sweep;
    return arc;
  }).join('');

  container.innerHTML =
    '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '">' +
      arcs +
      '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" fill="' + CHART_COLORS.donutText + '" font-size="22" font-weight="700">' + total + '</text>' +
      '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" fill="' + CHART_COLORS.donutLabel + '" font-size="11">' + (opts.centerLabel || '总数') + '</text>' +
    '</svg>' +
    '<div class="donut-legend">' +
      data.map(function (d) {
        return '<span class="legend-item"><span class="legend-dot" style="background:' + (d.color || CHART_COLORS.defaultBar) + '"></span>' + d.label + ' ' + d.value + '</span>';
      }).join('') +
    '</div>';
}

/* 折线图 */
function drawLineChart(container, series, opts) {
  opts = opts || {};
  var w = opts.width || 480, h = opts.height || 200;
  var pad = { top: 20, right: 16, bottom: 30, left: 36 };
  var innerW = w - pad.left - pad.right;
  var innerH = h - pad.top - pad.bottom;
  var max = 1;
  series.forEach(function (s) { s.data.forEach(function (p) { if (p.value > max) max = p.value; }); });
  var stepX = innerW / Math.max(1, series[0].data.length - 1);

  var paths = series.map(function (s) {
    var pts = s.data.map(function (p, i) {
      var x = pad.left + i * stepX;
      var y = pad.top + innerH * (1 - p.value / max);
      return { x: x, y: y };
    });
    var d = pts.map(function (pt, i) { return (i === 0 ? 'M' : 'L') + pt.x + ' ' + pt.y; }).join(' ');
    var dots = pts.map(function (pt) {
      return '<circle cx="' + pt.x + '" cy="' + pt.y + '" r="3" fill="' + s.color + '"><title>' + pt.label + ': ' + pt.value + '</title></circle>';
    }).join('');
    return '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2"/>' + dots;
  }).join('');

  var xLabels = series[0].data.map(function (p, i) {
    var x = pad.left + i * stepX;
    return '<text x="' + x + '" y="' + (h - 10) + '" text-anchor="middle" fill="' + CHART_COLORS.axisLabel + '" font-size="10">' + p.label + '</text>';
  }).join('');

  container.innerHTML =
    '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '">' +
      '<line x1="' + pad.left + '" x2="' + (w - pad.right) + '" y1="' + (pad.top + innerH) + '" y2="' + (pad.top + innerH) + '" stroke="' + CHART_COLORS.grid + '"/>' +
      paths + xLabels +
    '</svg>';
}
