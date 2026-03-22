const BASE_WIDTH = 960;
const BASE_HEIGHT = 700;

const API_URL = 'https://mapapi.enldm.cyou/api/bandori';
const FALLBACK_URLS = ['./bandori.json'];

let bandoriRows = [];
let provinceGroupsMap = new Map();
let selectedProvinceKey = null;
let mapViewState = null;
let controlsBound = false;
let copyActionBound = false;
let selectedCardAnimToken = 0;
let introToggleBound = false;
let bubbleActionBound = false;
let activeBubbleState = null;
let bubbleAnimToken = 0;
let invertCtrlBubble = false;
let feedbackModalBound = false;
let rightClickGuardBound = false;
let developerModeEnabled = false;
let resetClickBurstCount = 0;
let resetClickBurstTimer = null;
let refreshActionBound = false;

function normalizeProvinceName(name) {
  if (!name) return '';
  return String(name)
    .trim()
    .replace(/(壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|省|市)$/g, '');
}

function groupTypeText(type) {
  if (type === 'school') return '校群';
  if (type === 'region') return '地区';
  return '其他';
}

function formatCreatedAt(value) {
  if (!value) return '建群时间未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function escapeHTML(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function bindCopyAction() {
  if (copyActionBound) return;
  const groupList = document.getElementById('groupList');
  if (!groupList) return;

  groupList.addEventListener('click', async (event) => {
    const trigger = event.target.closest('.copy-btn, .copy-number');
    if (!trigger) return;

    const encoded = trigger.getAttribute('data-copy') || '';
    const text = decodeURIComponent(encoded);
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      const oldText = trigger.textContent;
      trigger.textContent = '已复制';
      setTimeout(() => {
        trigger.textContent = oldText;
      }, 900);
    } catch (e) {
      const oldText = trigger.textContent;
      trigger.textContent = '复制失败';
      setTimeout(() => {
        trigger.textContent = oldText;
      }, 1200);
    }
  });

  copyActionBound = true;
}

function bindBubbleAction() {
  if (bubbleActionBound) return;
  const bubble = document.getElementById('badgeBubble');
  const mapEl = document.getElementById('map');
  if (!bubble || !mapEl) return;

  bubble.addEventListener('click', async (event) => {
    const item = event.target.closest('.map-bubble-item');
    if (!item) return;

    const encoded = item.getAttribute('data-copy') || '';
    const text = decodeURIComponent(encoded);
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      const idEl = item.querySelector('.bubble-id');
      if (!idEl) return;
      const old = idEl.textContent;
      idEl.textContent = '已复制';
      setTimeout(() => {
        idEl.textContent = old;
      }, 800);
    } catch (e) {
      // ignore
    }
  });

  mapEl.addEventListener('click', (event) => {
    const inBubble = event.target.closest('#badgeBubble');
    const inBadge = event.target.closest('.count-badge');
    if (inBubble || inBadge) return;
    hideMapBubble();
  });

  bubbleActionBound = true;
}

function bindRightClickGuard() {
  if (rightClickGuardBound) return;

  document.addEventListener(
    'contextmenu',
    (event) => {
      if (developerModeEnabled) return;
      event.preventDefault();

      const refreshBtn = document.getElementById('refreshApiBtn');
      if (!refreshBtn) return;

      const maxX = Math.max(8, window.innerWidth - 120);
      const maxY = Math.max(8, window.innerHeight - 48);
      const x = Math.min(maxX, event.clientX + 8);
      const y = Math.min(maxY, event.clientY + 8);

      const wasOpen = refreshBtn.classList.contains('show');

      if (!wasOpen) {
        refreshBtn.classList.add('instant-place');
      }

      refreshBtn.style.left = x + 'px';
      refreshBtn.style.top = y + 'px';
      refreshBtn.classList.add('show');

      if (!wasOpen) {
        void refreshBtn.offsetHeight;
        refreshBtn.classList.remove('instant-place');
      }
    },
    true
  );

  document.addEventListener(
    'click',
    (event) => {
      const refreshBtn = document.getElementById('refreshApiBtn');
      if (!refreshBtn) return;
      if (event.target === refreshBtn) return;
      refreshBtn.classList.remove('show');
    },
    true
  );

  rightClickGuardBound = true;
}

async function reloadBandoriData() {
  const { rows, source } = await fetchBandoriData();
  bandoriRows = rows;
  provinceGroupsMap = buildProvinceMap(bandoriRows);
  updateSummaryUI(source);
  renderChinaMap();
  if (selectedProvinceKey === '海外') {
    showProvinceDetails('海外');
  }
}

function bindRefreshAction() {
  if (refreshActionBound) return;
  const refreshBtn = document.getElementById('refreshApiBtn');
  if (!refreshBtn) return;

  refreshBtn.addEventListener('click', async () => {
    refreshBtn.textContent = '刷新中...';
    refreshBtn.disabled = true;
    try {
      await reloadBandoriData();
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = '刷新数据';
      refreshBtn.classList.remove('show');
    }
  });

  refreshActionBound = true;
}

function handleResetBurstForDeveloperMode() {
  resetClickBurstCount += 1;

  if (resetClickBurstTimer) {
    clearTimeout(resetClickBurstTimer);
  }

  resetClickBurstTimer = setTimeout(() => {
    resetClickBurstCount = 0;
  }, 1400);

  if (resetClickBurstCount >= 6) {
    developerModeEnabled = !developerModeEnabled;
    resetClickBurstCount = 0;
    clearTimeout(resetClickBurstTimer);
    resetClickBurstTimer = null;

    const resetBtn = document.getElementById('resetViewBtn');
    if (resetBtn) {
      resetBtn.textContent = developerModeEnabled ? '重置（开发者）' : '重置';
      resetBtn.title = developerModeEnabled
        ? '开发者模式已开启：允许右键'
        : '开发者模式已关闭：禁止右键';
    }
  }
}

function bindIntroToggle() {
  if (introToggleBound) return;

  const introCard = document.getElementById('introCard');
  const closeBtn = document.getElementById('introCloseBtn');
  const expandBtn = document.getElementById('introExpandBtn');
  const invertCtrlSwitch = document.getElementById('invertCtrlSwitch');
  const invertCtrlLabel = document.getElementById('invertCtrlLabel');
  if (!introCard || !closeBtn || !expandBtn) return;

  closeBtn.addEventListener('click', () => {
    introCard.classList.add('collapsed');
  });

  expandBtn.addEventListener('click', () => {
    introCard.classList.remove('collapsed');
  });

  if (invertCtrlSwitch) {
    invertCtrlSwitch.checked = false;
    if (invertCtrlLabel) invertCtrlLabel.textContent = '反转操作（默认关）';

    invertCtrlSwitch.addEventListener('change', () => {
      invertCtrlBubble = !!invertCtrlSwitch.checked;
      if (invertCtrlLabel) {
        invertCtrlLabel.textContent = invertCtrlBubble ? '反转操作（已开启）' : '反转操作（默认关）';
      }
    });
  }

  introToggleBound = true;
}

function bindFeedbackModal() {
  if (feedbackModalBound) return;

  const openBtn = document.getElementById('feedbackModalBtn');
  const modal = document.getElementById('feedbackModal');
  const closeBtn = document.getElementById('feedbackModalClose');
  if (!openBtn || !modal || !closeBtn) return;

  const open = () => {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  };

  const close = () => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  };

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);

  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });

  feedbackModalBound = true;
}

async function fetchBandoriData() {
  const sources = [API_URL].concat(FALLBACK_URLS);

  for (const url of sources) {
    try {
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) continue;
      const json = await resp.json();
      if (json && Array.isArray(json.data)) {
        return { rows: json.data, source: url };
      }
    } catch (e) {
      // 尝试下一个源
    }
  }

  return { rows: [], source: 'none' };
}

function buildProvinceMap(rows) {
  const map = new Map();
  rows.forEach((item) => {
    const key = normalizeProvinceName(item.province);
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
}

function getProvinceCountByName(name) {
  const key = normalizeProvinceName(name);
  const arr = provinceGroupsMap.get(key) || [];
  return arr.length;
}

function getProvinceRowsByName(name) {
  const key = normalizeProvinceName(name);
  return provinceGroupsMap.get(key) || [];
}

function hideMapBubble() {
  const bubble = document.getElementById('badgeBubble');
  if (!bubble) return;
  bubble.classList.remove('open');
  activeBubbleState = null;
}

function placeMapBubble(anchorX, anchorY) {
  if (!mapViewState) return;
  const bubble = document.getElementById('badgeBubble');
  if (!bubble) return;

  const scale = mapViewState.zoom.scale();
  const tr = mapViewState.zoom.translate();
  const px = tr[0] + anchorX * scale;
  const py = tr[1] + anchorY * scale;

  bubble.style.left = px + 'px';
  bubble.style.top = py + 'px';
}

function applyBubbleMarquee() {
  const nodes = document.querySelectorAll('#badgeBubble .bubble-name');
  nodes.forEach((el) => {
    el.classList.remove('marquee');
    const parent = el.parentElement;
    if (!parent) return;
    if (el.scrollWidth > parent.clientWidth + 4) {
      el.classList.add('marquee');
    }
  });
}

function animateMapBubbleResize(updateFn) {
  const bubble = document.getElementById('badgeBubble');
  if (!bubble) {
    updateFn();
    return;
  }

  bubbleAnimToken += 1;
  const myToken = bubbleAnimToken;
  const startRect = bubble.getBoundingClientRect();

  if (bubble.classList.contains('open')) {
    bubble.style.width = startRect.width + 'px';
    bubble.style.height = startRect.height + 'px';
  }

  updateFn();

  bubble.style.width = 'auto';
  bubble.style.height = 'auto';
  const targetRect = bubble.getBoundingClientRect();

  if (bubble.classList.contains('open')) {
    bubble.style.width = startRect.width + 'px';
    bubble.style.height = startRect.height + 'px';
    void bubble.offsetHeight;

    requestAnimationFrame(() => {
      if (myToken !== bubbleAnimToken) return;
      bubble.style.width = targetRect.width + 'px';
      bubble.style.height = targetRect.height + 'px';
    });

    const clear = () => {
      if (myToken !== bubbleAnimToken) return;
      bubble.style.width = '';
      bubble.style.height = '';
      bubble.removeEventListener('transitionend', clear);
    };
    bubble.addEventListener('transitionend', clear);
    setTimeout(clear, 420);
  }
}

function showMapBubbleByProvince(provinceName, anchorX, anchorY) {
  const bubble = document.getElementById('badgeBubble');
  if (!bubble) return;

  const rows = getProvinceRowsByName(provinceName);
  if (!rows.length) {
    hideMapBubble();
    return;
  }

  const limited = rows.slice(0, 12);
  animateMapBubbleResize(() => {
    bubble.innerHTML = `
      <div class="map-bubble-scroll">
        <h3 class="map-bubble-title">${escapeHTML(provinceName)} · ${rows.length} 个群</h3>
        ${limited
          .map((item) => {
            const name = escapeHTML(item.name || '未命名群');
            const idText = escapeHTML(String(item.info || '无群号'));
            const copyText = encodeURIComponent(String(item.info || ''));
            return `
              <article class="map-bubble-item" data-copy="${copyText}" title="点击复制群号">
                <div class="bubble-name-wrap">
                  <span class="bubble-name">${name}</span>
                </div>
                <div class="bubble-id">${idText}</div>
              </article>
            `;
          })
          .join('')}
      </div>
    `;
  });

  activeBubbleState = {
    provinceName,
    anchorX,
    anchorY
  };

  placeMapBubble(anchorX, anchorY);
  requestAnimationFrame(() => {
    bubble.classList.add('open');
    applyBubbleMarquee();
  });
}

function animateSelectedCardUpdate(updateFn) {
  const card = document.getElementById('selectedCard');
  if (!card) {
    updateFn();
    return;
  }

  selectedCardAnimToken += 1;
  const myToken = selectedCardAnimToken;

  const startHeight = card.getBoundingClientRect().height;
  card.style.height = startHeight + 'px';
  card.classList.add('switching');

  updateFn();

  // 关键修复：先用 auto 读取内容真实高度，再从旧高度过渡到新高度
  // 否则由“长 -> 短”时 scrollHeight 可能被当前固定高度撑住，导致无动画
  card.style.height = 'auto';
  const naturalRectHeight = card.getBoundingClientRect().height;

  const computed = window.getComputedStyle(card);
  const maxHeight = parseFloat(computed.maxHeight);
  const naturalHeight = naturalRectHeight;
  const targetHeight = Number.isFinite(maxHeight) && !Number.isNaN(maxHeight) ? Math.min(naturalHeight, maxHeight) : naturalHeight;

  card.style.height = startHeight + 'px';
  // 强制回流，确保浏览器识别起始高度再执行过渡
  void card.offsetHeight;

  requestAnimationFrame(() => {
    if (myToken !== selectedCardAnimToken) return;
    card.style.height = targetHeight + 'px';
  });

  const clear = () => {
    if (myToken !== selectedCardAnimToken) return;
    card.style.height = '';
    card.classList.remove('switching');
    card.removeEventListener('transitionend', clear);
  };

  card.addEventListener('transitionend', clear);
  setTimeout(clear, 560);
}

function updateSummaryUI(source) {
  const titleEl = document.getElementById('selectedTitle');
  const countEl = document.getElementById('selectedProvince');
  const metaEl = document.getElementById('selectedMeta');
  const listEl = document.getElementById('groupList');

  const mainlandTotal = Array.from(provinceGroupsMap.keys()).reduce((sum, key) => {
    if (key === '海外') return sum;
    return sum + (provinceGroupsMap.get(key)?.length || 0);
  }, 0);

  if (titleEl) titleEl.textContent = '全国邦群数据';
  if (countEl) countEl.textContent = `${mainlandTotal} 个群`;
  if (metaEl) metaEl.textContent = `数据源：${source}`;
  if (listEl) {
    listEl.innerHTML = '<div class="empty-text">点击地图省份查看详细群信息</div>';
  }

  const overseasBtn = document.getElementById('overseasToggleBtn');
  if (overseasBtn) overseasBtn.classList.remove('active');
}

function showProvinceDetails(provinceName) {
  const key = normalizeProvinceName(provinceName);
  const rows = provinceGroupsMap.get(key) || [];

  const titleEl = document.getElementById('selectedTitle');
  const countEl = document.getElementById('selectedProvince');
  const metaEl = document.getElementById('selectedMeta');
  const listEl = document.getElementById('groupList');

  const schoolCount = rows.filter((x) => x.type === 'school').length;
  const regionCount = rows.filter((x) => x.type === 'region').length;
  const otherCount = rows.length - schoolCount - regionCount;

  animateSelectedCardUpdate(() => {
    if (titleEl) titleEl.textContent = `${provinceName} · 群详情`;
    if (countEl) countEl.textContent = `${rows.length} 个群`;
    if (metaEl) metaEl.textContent = `地区 ${regionCount} · 校群 ${schoolCount} · 其他 ${otherCount}`;

    const overseasBtn = document.getElementById('overseasToggleBtn');
    if (overseasBtn) {
      if (key === '海外') overseasBtn.classList.add('active');
      else overseasBtn.classList.remove('active');
    }

    if (!listEl) return;
    if (!rows.length) {
      listEl.innerHTML = '<div class="empty-text">该省份暂无群信息</div>';
      return;
    }

    const sorted = rows.slice().sort((a, b) => {
      if ((b.verified || 0) !== (a.verified || 0)) return (b.verified || 0) - (a.verified || 0);
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
    });

    listEl.innerHTML = sorted
      .map((item) => {
        const name = escapeHTML(item.name || '未命名群');
        const rawInfo = item.info || '';
        const info = escapeHTML(rawInfo || '无联系方式');
        const copyValue = encodeURIComponent(String(rawInfo || ''));
        const type = escapeHTML(groupTypeText(item.type));
        const verifyText = item.verified ? '已认证' : '未认证';
        const verifyMeta = escapeHTML(verifyText) + ' · ' + escapeHTML('认证时间：' + formatCreatedAt(item.created_at));
        return `
          <article class="group-item">
            <div class="group-top">
              <h3 class="group-name">${name}</h3>
              <span class="group-chip">${type}</span>
            </div>
            <div class="group-info-row">
              <p class="group-info copy-number" data-copy="${copyValue}" title="点击复制群号">${info}</p>
              <button class="copy-btn" data-copy="${copyValue}" type="button">复制群号</button>
            </div>
            <p class="group-meta">${verifyMeta}</p>
          </article>
        `;
      })
      .join('');
  });
}

function colorByCount(count, maxCount) {
  if (!count) return '#ffdce9';
  const ratio = Math.max(0, Math.min(1, count / Math.max(1, maxCount)));
  if (ratio > 0.75) return '#c2185b';
  if (ratio > 0.5) return '#d94f84';
  if (ratio > 0.25) return '#ec78a5';
  return '#f59cc0';
}

function bindControlEvents() {
  if (controlsBound) return;

  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const resetViewBtn = document.getElementById('resetViewBtn');
  const overseasToggleBtn = document.getElementById('overseasToggleBtn');

  const stepScale = (factor) => {
    if (!mapViewState) return;
    const { svg, g, zoom, minScale, maxScale } = mapViewState;
    const current = zoom.scale();
    const next = Math.max(minScale, Math.min(maxScale, current * factor));

    const w = mapViewState.width;
    const h = mapViewState.height;
    const centerX = w / 2;
    const centerY = h / 2;

    const t = zoom.translate();
    const k = next / current;
    const nextT = [centerX - (centerX - t[0]) * k, centerY - (centerY - t[1]) * k];

    zoom.scale(next).translate(nextT);
    g.attr('transform', 'translate(' + nextT[0] + ',' + nextT[1] + ') scale(' + next + ')');
    svg.call(zoom);
  };

  if (zoomInBtn) zoomInBtn.addEventListener('click', () => stepScale(1.2));
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => stepScale(1 / 1.2));
  if (resetViewBtn) {
    resetViewBtn.addEventListener('click', () => {
      handleResetBurstForDeveloperMode();

      if (!mapViewState) return;
      const { svg, g, zoom, baseScale, baseTranslate } = mapViewState;
      zoom.scale(baseScale).translate(baseTranslate.slice());
      g.attr(
        'transform',
        'translate(' + baseTranslate[0] + ',' + baseTranslate[1] + ') scale(' + baseScale + ')'
      );
      svg.call(zoom);
    });
  }

  if (overseasToggleBtn) {
    overseasToggleBtn.addEventListener('click', () => {
      selectedProvinceKey = '海外';
      showProvinceDetails('海外');
      hideMapBubble();
      if (mapViewState && mapViewState.g) {
        mapViewState.g.selectAll('.province').classed('selected', false);
      }
    });
  }

  controlsBound = true;
}

function getBadgeOffsetByProvinceId(id) {
  const offsets = {
    // 直辖市/特区：避免挡住本体
    sh: { dx: 16, dy: -10 },
    hk: { dx: 20, dy: -12 },
    mc: { dx: -18, dy: 10 },

    // 用户反馈：河北下移，内蒙古位置修正
    hb: { dx: 0, dy: 20 },
    im: { dx: 0, dy: 0 }
  };
  return offsets[id] || { dx: 0, dy: 0 };
}

function getBadgeAnchorPoint(d, box) {
  // 默认中心点
  let cx = box.x + box.width / 2;
  let cy = box.y + box.height / 2;

  // 内蒙古形状狭长且凹陷明显，bbox 中心容易落在外部空白区域
  // 使用经验锚点（相对 bbox）保证圈位于省域内部可见位置
  if (d && d.id === 'im') {
    cx = box.x + box.width * 0.36;
    cy = box.y + box.height * 0.64;
  }

  return { cx, cy };
}

function ensurePointInsideProvince(pathNode, box, preferred) {
  const svg = pathNode && pathNode.ownerSVGElement;
  if (!pathNode || !svg || typeof pathNode.isPointInFill !== 'function' || typeof svg.createSVGPoint !== 'function') {
    return preferred;
  }

  const test = (x, y) => {
    const pt = svg.createSVGPoint();
    pt.x = x;
    pt.y = y;
    return pathNode.isPointInFill(pt);
  };

  // 候选点：先尝试首选点，再尝试一组 bbox 相对位置
  const candidates = [
    [preferred.cx, preferred.cy],
    [box.x + box.width * 0.5, box.y + box.height * 0.62],
    [box.x + box.width * 0.35, box.y + box.height * 0.62],
    [box.x + box.width * 0.65, box.y + box.height * 0.62],
    [box.x + box.width * 0.3, box.y + box.height * 0.48],
    [box.x + box.width * 0.7, box.y + box.height * 0.48],
    [box.x + box.width * 0.2, box.y + box.height * 0.7],
    [box.x + box.width * 0.8, box.y + box.height * 0.7]
  ];

  for (let i = 0; i < candidates.length; i += 1) {
    const x = candidates[i][0];
    const y = candidates[i][1];
    if (test(x, y)) return { cx: x, cy: y };
  }

  // 扫描兜底：在 bbox 内找第一个可填充点
  const stepX = Math.max(10, box.width / 12);
  const stepY = Math.max(10, box.height / 10);
  for (let y = box.y + stepY; y <= box.y + box.height - stepY; y += stepY) {
    for (let x = box.x + stepX; x <= box.x + box.width - stepX; x += stepX) {
      if (test(x, y)) return { cx: x, cy: y };
    }
  }

  return preferred;
}

function renderChinaMap() {
  const mapEl = document.getElementById('map');
  const svgEl = document.getElementById('mapSvg');
  if (!mapEl || !svgEl) return;

  const w = mapEl.clientWidth || window.innerWidth;
  const h = mapEl.clientHeight || window.innerHeight;

  svgEl.innerHTML = '';

  const fitScale = Math.min(w / BASE_WIDTH, h / BASE_HEIGHT) * 0.95;
  const offsetX = (w - BASE_WIDTH * fitScale) / 2;
  const offsetY = (h - BASE_HEIGHT * fitScale) / 2;

  const map = china().width(w).height(h).scale(1).language('cn').colorDefault('#ffdce9').colorLake('#ffffff');
  map.draw('#mapSvg');

  const svg = d3.select('#mapSvg');
  const g = svg.select('g');

  const allCounts = Array.from(provinceGroupsMap.entries())
    .filter(([key]) => key !== '海外')
    .map(([, arr]) => arr.length);
  const maxCount = allCounts.length ? Math.max.apply(null, allCounts) : 1;

  g.selectAll('.province').each(function (d) {
    const count = getProvinceCountByName(d.name);
    d3.select(this).style('fill', colorByCount(count, maxCount));
  });

  const badgeLayer = g.append('g').attr('class', 'count-layer');
  g.selectAll('.province').each(function (d) {
    const count = getProvinceCountByName(d.name);
    if (!count) return;

    const box = this.getBBox();
    const preferredAnchor = getBadgeAnchorPoint(d, box);
    const insideAnchor = ensurePointInsideProvince(this, box, preferredAnchor);
    let cx = insideAnchor.cx;
    let cy = insideAnchor.cy;

    const offset = getBadgeOffsetByProvinceId(d.id);
    cx += offset.dx;
    cy += offset.dy;

    // 约束在地图画布内，避免徽标跑到可视区域外
    cx = Math.max(14, Math.min(BASE_WIDTH - 14, cx));
    cy = Math.max(14, Math.min(BASE_HEIGHT - 14, cy));

    const r = count > 99 ? 13 : 11;

    const badge = badgeLayer
      .append('g')
      .attr('class', 'count-badge')
      .attr('data-province-id', d.id)
      .attr('data-province-name', d.name)
      .attr('transform', 'translate(' + cx + ',' + cy + ')');
    badge.append('circle').attr('r', r);
    badge
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .text(count > 99 ? '99+' : String(count));

    badge.on('click', function () {
      const evt = d3.event;
      if (!evt) return;
      evt.stopPropagation();

      const shouldShowBubble = invertCtrlBubble ? !!evt.ctrlKey : !evt.ctrlKey;

      // 穿透：按省份点击处理，不弹气泡
      if (!shouldShowBubble) {
        selectedProvinceKey = normalizeProvinceName(d.name);
        g.selectAll('.province').classed('selected', false);
        const provincePath = g.select('#' + d.id);
        if (!provincePath.empty()) provincePath.classed('selected', true);
        showProvinceDetails(d.name);
        hideMapBubble();
        return;
      }

      // 显示气泡：仅弹出气泡，不触发省份选中态
      showMapBubbleByProvince(d.name, cx, cy);
    });
  });

  g.selectAll('.province').on('click', function (d) {
    selectedProvinceKey = normalizeProvinceName(d.name);
    g.selectAll('.province').classed('selected', false);
    d3.select(this).classed('selected', true);
    showProvinceDetails(d.name);
    hideMapBubble();
  });

  if (selectedProvinceKey) {
    g.selectAll('.province').classed('selected', function (d) {
      return normalizeProvinceName(d.name) === selectedProvinceKey;
    });

    if (selectedProvinceKey === '海外') {
      showProvinceDetails('海外');
    }
  }

  g.attr('transform', 'translate(' + offsetX + ',' + offsetY + ') scale(' + fitScale + ')');

  const zoom = d3.behavior
    .zoom()
    .scaleExtent([fitScale, fitScale * 12])
    .translate([offsetX, offsetY])
    .scale(fitScale)
    .on('zoom', function () {
      g.attr(
        'transform',
        'translate(' + d3.event.translate[0] + ',' + d3.event.translate[1] + ') scale(' + d3.event.scale + ')'
      );

      if (activeBubbleState) {
        placeMapBubble(activeBubbleState.anchorX, activeBubbleState.anchorY);
      }
    });

  svg.call(zoom).on('dblclick.zoom', null);

  mapViewState = {
    svg,
    g,
    zoom,
    width: w,
    height: h,
    minScale: fitScale,
    maxScale: fitScale * 12,
    baseScale: fitScale,
    baseTranslate: [offsetX, offsetY]
  };

  bindControlEvents();
  bindBubbleAction();

  if (activeBubbleState) {
    placeMapBubble(activeBubbleState.anchorX, activeBubbleState.anchorY);
  }
}

async function init() {
  await reloadBandoriData();
  bindCopyAction();
  bindIntroToggle();
  bindFeedbackModal();
  bindRightClickGuard();
  bindRefreshAction();
}

window.addEventListener('resize', renderChinaMap);
init();

