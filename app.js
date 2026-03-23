// ==========================================
// 1. 常量与全局状态管理 (State Management)
// ==========================================
const CONFIG = {
  BASE_WIDTH: 960,
  BASE_HEIGHT: 700,
  API_URL: 'https://mapapi.enldm.cyou/api/bandori',
  FALLBACK_URLS: ['./bandori.json'],
  POLYMERIZATION_URL: './bandori_polymerization.json'
};

const State = {
  bandoriRows: [],
  provinceGroupsMap: new Map(),
  selectedProvinceKey: null,
  mapViewState: null,
  
  // UI 状态
  selectedCardAnimToken: 0,
  activeBubbleState: null,
  bubbleAnimToken: 0,
  invertCtrlBubble: false,
  developerModeEnabled: false,
  globalSearchEnabled: false,
  themePreference: 'system',
  systemThemeMediaQuery: null,
  
  // 详情与列表状态
  currentDetailProvinceName: '',
  currentDetailRows: [],
  listQuery: '',
  listType: 'all',
  listSort: 'default',
  currentDataSource: 'none',
  mobileSheetHeightPx: null,

  // 开发者模式相关
  resetClickBurstCount: 0,
  resetClickBurstTimer: null,
};

// ==========================================
// 2. 核心工具函数 (Utils)
// ==========================================
const Utils = {
  isMobileViewport: () => window.matchMedia('(max-width: 720px)').matches,
  extractUrl: (item) => {
    const source = `${item?.name || ''} ${item?.raw_text || ''} ${item?.info || ''}`;
    const match = source.match(/https?:\/\/[^\s]+|discord\.gg\/[^\s]+|discord\.com\/invite\/[^\s]+/i);
    if (!match) return null;
    const raw = match[0];
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  },
  
  normalizeProvinceName: (name) => {
    if (!name) return '';
    return String(name).trim().replace(/(壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|省|市)$/g, '');
  },

  groupTypeText: (type) => ({ school: '校群', region: '地区', 'non-regional': '非地区' }[type] || '其他'),
  
  typeFilterValue: (type) => ({ school: 'school', region: 'region', 'non-regional': 'non-regional' }[type] || 'other'),

  formatCreatedAt: (value) => {
    if (!value) return '建群时间未知';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },

  escapeHTML: (value) => String(value || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),

  // 防抖函数，用于 resize
  debounce: (fn, delay) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }
};

// ==========================================
// 3. UI 与 DOM 操作 (UI Layer)
// ==========================================
function applyMobileModeLayout() {
  const els = {
    map: document.getElementById('map'),
    selectedCard: document.getElementById('selectedCard'),
    overseasBtn: document.getElementById('overseasToggleBtn'),
    sheetHandle: document.getElementById('mobileSheetHandle'),
    controlCard: document.getElementById('controlCard'),
    introCard: document.getElementById('introCard')
  };
  if (!els.map || !els.selectedCard || !els.overseasBtn || !els.controlCard || !els.introCard || !els.sheetHandle) return;

  const nonRegionalBtn = document.getElementById('nonRegionalToggleBtn');
  const calendarBtn = document.getElementById('calendarToggleBtn');

  if (Utils.isMobileViewport()) {
    if (els.overseasBtn.parentElement !== els.selectedCard || els.sheetHandle.parentElement !== els.selectedCard) {
      els.selectedCard.insertBefore(els.sheetHandle, els.selectedCard.firstChild);
      els.selectedCard.insertBefore(els.overseasBtn, els.sheetHandle.nextSibling);
      if (nonRegionalBtn) {
        els.selectedCard.insertBefore(nonRegionalBtn, els.overseasBtn.nextSibling);
      }
      if (calendarBtn) {
        els.selectedCard.insertBefore(calendarBtn, (nonRegionalBtn || els.overseasBtn).nextSibling);
      }
    }
    els.overseasBtn.classList.add('mobile-inside');
    nonRegionalBtn?.classList.add('mobile-inside');
    calendarBtn?.classList.add('mobile-inside');
    els.controlCard.classList.add('mobile-hidden');
    els.introCard.classList.add('collapsed');

    if (State.mobileSheetHeightPx) {
      els.selectedCard.style.height = `${State.mobileSheetHeightPx}px`;
    } else if (!els.selectedCard.style.height) {
      els.selectedCard.style.height = '46vh';
    }
  } else {
    if (els.overseasBtn.parentElement !== els.map) {
      els.map.insertBefore(els.overseasBtn, els.controlCard);
    }
    if (nonRegionalBtn && nonRegionalBtn.parentElement !== els.map) {
      els.map.insertBefore(nonRegionalBtn, els.controlCard);
    }
    if (calendarBtn && calendarBtn.parentElement !== els.map) {
      els.map.insertBefore(calendarBtn, els.controlCard);
    }
    if (els.sheetHandle.parentElement !== els.map) {
      els.map.insertBefore(els.sheetHandle, els.controlCard);
    }
    els.overseasBtn.classList.remove('mobile-inside');
    nonRegionalBtn?.classList.remove('mobile-inside');
    calendarBtn?.classList.remove('mobile-inside');
    els.controlCard.classList.remove('mobile-hidden');
    els.selectedCard.style.height = '';
  }
}

function getPreferredTheme() {
  if (State.themePreference === 'light' || State.themePreference === 'dark') return State.themePreference;
  return State.systemThemeMediaQuery?.matches ? 'dark' : 'light';
}

function updateThemeMetaColor(theme) {
  const metaThemeColor = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!metaThemeColor) return;
  metaThemeColor.setAttribute('content', theme === 'dark' ? '#140913' : '#f06292');

  const supportsDynamicThemeColor = window.matchMedia('(display-mode: browser)').matches || window.matchMedia('(display-mode: standalone)').matches;
  if (supportsDynamicThemeColor) {
    document.documentElement.style.setProperty('background-color', theme === 'dark' ? '#140913' : '#fff7fa');
    document.body.style.setProperty('background-color', theme === 'dark' ? '#140913' : '#fff7fa');
  }
}

function updateThemeSwitchUI() {
  const themeSwitch = document.getElementById('themeSwitch');
  const label = document.getElementById('themeSwitchLabel');
  const effectiveTheme = getPreferredTheme();
  if (themeSwitch) themeSwitch.checked = effectiveTheme === 'dark';
  if (label) {
    label.textContent = State.themePreference === 'system'
      ? `暗黑模式（跟随系统：${effectiveTheme === 'dark' ? '开' : '关'}）`
      : `暗黑模式（临时${effectiveTheme === 'dark' ? '开启' : '关闭'}）`;
  }
}

function applyThemePreference() {
  const effectiveTheme = getPreferredTheme();
  if (State.themePreference === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', effectiveTheme);
  }
  updateThemeMetaColor(effectiveTheme);
  updateThemeSwitchUI();
}

function setThemePreference(preference) {
  State.themePreference = preference;
  applyThemePreference();
}

function initThemePreference() {
  State.systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const handleSystemThemeChange = () => {
    if (State.themePreference === 'system') applyThemePreference();
  };

  if (typeof State.systemThemeMediaQuery.addEventListener === 'function') {
    State.systemThemeMediaQuery.addEventListener('change', handleSystemThemeChange);
  } else if (typeof State.systemThemeMediaQuery.addListener === 'function') {
    State.systemThemeMediaQuery.addListener(handleSystemThemeChange);
  }

  applyThemePreference();
}

function bindMobileSheetResize() {
  const handle = document.getElementById('mobileSheetHandle');
  const card = document.getElementById('selectedCard');
  if (!handle || !card || handle.dataset.bound === 'true') return;
  handle.dataset.bound = 'true';

  let startY = 0;
  let startHeight = 0;
  let dragging = false;

  const minHeight = () => Math.round(window.innerHeight * 0.28);
  const maxHeight = () => Math.round(window.innerHeight * 0.82);

  const updateHeight = (clientY) => {
    const delta = startY - clientY;
    const next = Math.max(minHeight(), Math.min(maxHeight(), startHeight + delta));
    State.mobileSheetHeightPx = next;
    card.style.height = `${next}px`;
  };

  const onMouseMove = (e) => {
    if (!dragging || !Utils.isMobileViewport()) return;
    updateHeight(e.clientY);
  };

  const onTouchMove = (e) => {
    if (!dragging || !Utils.isMobileViewport()) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    updateHeight(touch.clientY);
    e.preventDefault();
  };

  const stopDrag = () => {
    dragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', stopDrag);
  };

  const startDrag = (clientY) => {
    if (!Utils.isMobileViewport()) return;
    dragging = true;
    startY = clientY;
    startHeight = card.getBoundingClientRect().height;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', stopDrag);
  };

  handle.addEventListener('mousedown', (e) => startDrag(e.clientY));
  handle.addEventListener('touchstart', (e) => {
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    startDrag(touch.clientY);
  }, { passive: true });
}

function setGlobalSearchEnabled(enabled, options = { resetToDefault: false }) {
  State.globalSearchEnabled = !!enabled;
  const btn = document.getElementById('globalSearchBtn');
  
  if (btn) {
    btn.classList.toggle('active', State.globalSearchEnabled);
    btn.setAttribute('aria-pressed', State.globalSearchEnabled ? 'true' : 'false');
  }

  if (State.globalSearchEnabled) {
    State.selectedProvinceKey = null;
    State.currentDetailProvinceName = '';
    State.currentDetailRows = [];
    if (State.mapViewState?.g) {
      State.mapViewState.g.selectAll('.province').classed('selected', false);
    }
  } else if (options.resetToDefault) {
    State.selectedProvinceKey = null;
    State.currentDetailProvinceName = '';
    State.currentDetailRows = [];
    hideMapBubble();
    updateSummaryUI(State.currentDataSource);
  }
}

function updateSortButtonView() {
  const sortBar = document.getElementById('sortBar');
  if (!sortBar) return;

  sortBar.querySelectorAll('.sort-btn').forEach((btn) => {
    const key = btn.getAttribute('data-sort') || '';
    btn.classList.remove('active');

    const config = {
      default: { text: '默认', active: State.listSort === 'default', next: 'default' },
      time_desc: { text: State.listSort === 'time_asc' ? '认证时间 ↑' : '认证时间 ↓', active: ['time_asc', 'time_desc'].includes(State.listSort), next: State.listSort === 'time_asc' ? 'time_asc' : 'time_desc' },
      name_asc: { text: State.listSort === 'name_desc' ? '首字母 Z→A' : '首字母 A→Z', active: ['name_asc', 'name_desc'].includes(State.listSort), next: State.listSort === 'name_desc' ? 'name_desc' : 'name_asc' },
      type_asc: { text: State.listSort === 'type_desc' ? '类型 Z→A' : '类型 A→Z', active: ['type_asc', 'type_desc'].includes(State.listSort), next: State.listSort === 'type_desc' ? 'type_desc' : 'type_asc' }
    };

    const targetConfig = config[key.split('_')[0] + (key.includes('desc') ? '_desc' : (key === 'default' ? '' : '_asc'))] || config[key];
    
    if (targetConfig) {
      btn.textContent = targetConfig.text;
      if (targetConfig.active) btn.classList.add('active');
      btn.setAttribute('data-sort', targetConfig.next);
    }
  });
}

function getFilteredSortedRows(rows) {
  let result = rows.slice();

  // 1. 筛选
  if (State.listType !== 'all') {
    result = result.filter(item => Utils.typeFilterValue(item.type) === State.listType);
  }

  if (State.listQuery) {
    result = result.filter(item => 
      String(item.name || '').toLowerCase().includes(State.listQuery) || 
      String(item.info || '').toLowerCase().includes(State.listQuery)
    );
  }

  // 2. 排序策略 (Strategy Pattern)
  const sortStrategies = {
    time_desc: (a, b) => (new Date(b.created_at || 0).getTime() || 0) - (new Date(a.created_at || 0).getTime() || 0),
    time_asc: (a, b) => (new Date(a.created_at || 0).getTime() || 0) - (new Date(b.created_at || 0).getTime() || 0),
    name_asc: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN-u-co-pinyin'),
    name_desc: (a, b) => String(b.name || '').localeCompare(String(a.name || ''), 'zh-CN-u-co-pinyin'),
    type_asc: (a, b) => Utils.groupTypeText(a.type).localeCompare(Utils.groupTypeText(b.type), 'zh-CN-u-co-pinyin') || String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN-u-co-pinyin'),
    type_desc: (a, b) => Utils.groupTypeText(b.type).localeCompare(Utils.groupTypeText(a.type), 'zh-CN-u-co-pinyin') || String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN-u-co-pinyin'),
    default: (a, b) => {
      if ((b.verified || 0) !== (a.verified || 0)) return (b.verified || 0) - (a.verified || 0);
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
    }
  };

  result.sort(sortStrategies[State.listSort] || sortStrategies.default);
  return result;
}

function renderGroupList(rows) {
  const listEl = document.getElementById('groupList');
  if (!listEl) return;

  if (!rows.length) {
    listEl.innerHTML = '<div class="empty-text">没有匹配到结果</div>';
    return;
  }

  listEl.innerHTML = rows.map((item) => {
    const name = Utils.escapeHTML(item.name || '未命名群');
    const rawText = Utils.escapeHTML(item.raw_text || item.name || '');
    const detectedUrl = Utils.extractUrl(item);
    const rawInfo = detectedUrl || item.info || '';
    const infoText = rawInfo || '无联系方式';
    const info = Utils.escapeHTML(infoText);
    const copyValue = encodeURIComponent(String(rawInfo));
    const type = Utils.escapeHTML(Utils.groupTypeText(item.type));
    const verifyMeta = Utils.escapeHTML(item.verified ? '已认证' : '未认证') + ' · 认证时间：' + Utils.escapeHTML(Utils.formatCreatedAt(item.created_at));
    const actionText = detectedUrl ? '复制链接' : '复制群号';
    const infoClass = detectedUrl ? 'group-info copy-number link-like' : 'group-info copy-number';
    const infoAttrs = detectedUrl
      ? `data-href="${Utils.escapeHTML(detectedUrl)}" title="点击打开链接"`
      : `data-copy="${copyValue}" title="点击复制群号"`;
    const buttonAttrs = rawInfo ? `data-copy="${copyValue}"` : 'disabled';
    
    return `
        <article class="group-item">
          <div class="group-top">
            <h3 class="group-name" title="${rawText}">${name}</h3>
            <span class="group-chip">${type}</span>
          </div>
        <div class="group-info-row">
          <p class="${infoClass}" ${infoAttrs}>${info}</p>
          <button class="copy-btn" ${buttonAttrs} type="button">${actionText}</button>
        </div>
        <p class="group-meta">${verifyMeta}</p>
      </article>
    `;
  }).join('');
}

function renderCurrentDetail() {
  if (!State.currentDetailProvinceName && !State.globalSearchEnabled) return;

  const sourceRows = State.globalSearchEnabled ? State.bandoriRows : State.currentDetailRows;
  const filtered = getFilteredSortedRows(sourceRows);
  
  const schoolCount = filtered.filter(x => x.type === 'school').length;
  const regionCount = filtered.filter(x => x.type === 'region').length;
  const otherCount = filtered.length - schoolCount - regionCount;

  animateSelectedCardUpdate(() => {
    document.getElementById('selectedTitle').textContent = State.globalSearchEnabled ? '全局搜索 · 群详情' : `${State.currentDetailProvinceName} · 群详情`;
    document.getElementById('selectedProvince').textContent = `${filtered.length} / ${sourceRows.length} 个群`;
    document.getElementById('selectedMeta').textContent = `范围 ${State.globalSearchEnabled ? '全局' : State.currentDetailProvinceName || '未选择'} · 地区 ${regionCount} · 校群 ${schoolCount} · 其他 ${otherCount}`;
    renderGroupList(filtered);
  });
}

function updateSummaryUI(source, animate = true) {
  const applySummary = () => {
    const mainlandTotal = Array.from(State.provinceGroupsMap.keys()).reduce((sum, key) => key === '海外' ? sum : sum + (State.provinceGroupsMap.get(key)?.length || 0), 0);
    
    document.getElementById('selectedTitle').textContent = '全国邦群数据';
    document.getElementById('selectedProvince').textContent = `${mainlandTotal} 个群`;
    document.getElementById('selectedMeta').textContent = `数据源：${source}`;
    document.getElementById('groupList').innerHTML = '<div class="empty-text">点击地图省份查看详细群信息</div>';
  };

  if (animate) animateSelectedCardUpdate(applySummary);
  else applySummary();

  // Reset states and UI
  document.getElementById('searchInput').value = '';
  document.getElementById('typeFilter').value = 'all';
  State.listQuery = '';
  State.listType = 'all';
  State.listSort = 'default';
  State.currentDetailProvinceName = '';
  State.currentDetailRows = [];
  
  updateSortButtonView();
  setGlobalSearchEnabled(false, { resetToDefault: false });
  document.getElementById('overseasToggleBtn')?.classList.remove('active');
}

function showProvinceDetails(provinceName) {
  const key = Utils.normalizeProvinceName(provinceName);
  State.currentDetailProvinceName = provinceName;
  State.currentDetailRows = key === '非地区' ? (State.provinceGroupsMap.get('__non_regional__') || []) : (State.provinceGroupsMap.get(key) || []);
  renderCurrentDetail();

  const overseasBtn = document.getElementById('overseasToggleBtn');
  const nonRegionalBtn = document.getElementById('nonRegionalToggleBtn');
  if (overseasBtn) overseasBtn.classList.toggle('active', key === '海外');
  if (nonRegionalBtn) nonRegionalBtn.classList.toggle('active', key === '非地区');
}

// ==========================================
// 4. 动画与气泡交互 (Animations & Bubble)
// ==========================================
function animateSelectedCardUpdate(updateFn) {
  const card = document.getElementById('selectedCard');
  if (!card) return updateFn();

  State.selectedCardAnimToken++;
  const myToken = State.selectedCardAnimToken;

  const startHeight = card.getBoundingClientRect().height;
  card.style.height = `${startHeight}px`;
  card.classList.add('switching');

  updateFn();

  card.style.height = 'auto';
  const targetHeight = card.getBoundingClientRect().height;
  
  card.style.height = `${startHeight}px`;
  void card.offsetHeight; // 强制回流

  requestAnimationFrame(() => {
    if (myToken !== State.selectedCardAnimToken) return;
    card.style.height = `${targetHeight}px`;
  });

  const clear = () => {
    if (myToken !== State.selectedCardAnimToken) return;
    card.style.height = '';
    card.classList.remove('switching');
    card.removeEventListener('transitionend', clear);
  };
  card.addEventListener('transitionend', clear);
  setTimeout(clear, 560);
}

function hideMapBubble() {
  document.getElementById('badgeBubble')?.classList.remove('open');
  State.activeBubbleState = null;
}

function placeMapBubble(anchorX, anchorY) {
  if (!State.mapViewState) return;
  const bubble = document.getElementById('badgeBubble');
  if (!bubble) return;

  const scale = State.mapViewState.zoom.scale();
  const tr = State.mapViewState.zoom.translate();
  bubble.style.left = `${tr[0] + anchorX * scale}px`;
  bubble.style.top = `${tr[1] + anchorY * scale}px`;
}

function showMapBubbleByProvince(provinceName, anchorX, anchorY) {
  const bubble = document.getElementById('badgeBubble');
  if (!bubble) return;

  const key = Utils.normalizeProvinceName(provinceName);
  const rows = State.provinceGroupsMap.get(key) || [];
  if (!rows.length) return hideMapBubble();

  State.bubbleAnimToken++;
  const myToken = State.bubbleAnimToken;
  const isCurrentlyOpen = bubble.classList.contains('open');
  let startRect;

  if (!isCurrentlyOpen) {
    bubble.classList.add('instant-place');
  }

  if (isCurrentlyOpen) {
    startRect = bubble.getBoundingClientRect();
    bubble.style.width = `${startRect.width}px`;
    bubble.style.height = `${startRect.height}px`;
  }

  bubble.innerHTML = `
    <div class="map-bubble-scroll">
      <h3 class="map-bubble-title">${Utils.escapeHTML(provinceName)} · ${rows.length} 个群</h3>
      ${rows.slice(0, 12).map(item => `
        <article class="map-bubble-item" data-copy="${encodeURIComponent(String(item.info || ''))}" title="点击复制群号">
          <div class="bubble-name-wrap"><span class="bubble-name">${Utils.escapeHTML(item.name || '未命名')}</span></div>
          <div class="bubble-id">${Utils.escapeHTML(String(item.info || '无群号'))}</div>
        </article>
      `).join('')}
    </div>
  `;

  State.activeBubbleState = { provinceName, anchorX, anchorY };
  placeMapBubble(anchorX, anchorY);

  bubble.style.width = 'auto';
  bubble.style.height = 'auto';

  if (isCurrentlyOpen) {
    const targetRect = bubble.getBoundingClientRect();
    bubble.style.width = `${startRect.width}px`;
    bubble.style.height = `${startRect.height}px`;
    void bubble.offsetHeight;

    requestAnimationFrame(() => {
      if (myToken !== State.bubbleAnimToken) return;
      bubble.style.width = `${targetRect.width}px`;
      bubble.style.height = `${targetRect.height}px`;
    });

    setTimeout(() => {
      if (myToken === State.bubbleAnimToken) {
        bubble.style.width = '';
        bubble.style.height = '';
      }
    }, 420);
  }

  requestAnimationFrame(() => {
    bubble.classList.add('open');
    bubble.querySelectorAll('.bubble-name').forEach(el => {
      el.classList.toggle('marquee', el.scrollWidth > el.parentElement.clientWidth + 4);
    });

    if (!isCurrentlyOpen) {
      void bubble.offsetHeight;
      bubble.classList.remove('instant-place');
    }
  });
}

// ==========================================
// 5. 地图渲染与计算 (Map Rendering)
// ==========================================
const MapUtils = {
  colorByCount: (count, maxCount) => {
    if (!count) return '#ffdce9';
    const ratio = Math.max(0, Math.min(1, count / Math.max(1, maxCount)));
    return ratio > 0.75 ? '#c2185b' : ratio > 0.5 ? '#d94f84' : ratio > 0.25 ? '#ec78a5' : '#f59cc0';
  },
  
  getBadgeOffset: (id) => ({ sh: { dx: 16, dy: -10 }, hk: { dx: 20, dy: -12 }, mc: { dx: -18, dy: 10 }, hb: { dx: 0, dy: 20 }, im: { dx: 0, dy: 0 } }[id] || { dx: 0, dy: 0 }),
  
  ensurePointInsideProvince: (pathNode, box, preferred) => {
    const svg = pathNode?.ownerSVGElement;
    if (!pathNode || !svg || typeof pathNode.isPointInFill !== 'function') return preferred;

    const test = (x, y) => {
      const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
      return pathNode.isPointInFill(pt);
    };

    const candidates = [
      [preferred.cx, preferred.cy],
      [box.x + box.width * 0.5, box.y + box.height * 0.62],
      [box.x + box.width * 0.35, box.y + box.height * 0.62],
      [box.x + box.width * 0.65, box.y + box.height * 0.62]
    ];

    for (let [x, y] of candidates) if (test(x, y)) return { cx: x, cy: y };
    return preferred;
  }
};

function renderChinaMap() {
  const mapEl = document.getElementById('map');
  const svgEl = document.getElementById('mapSvg');
  if (!mapEl || !svgEl) return;

  const w = mapEl.clientWidth || window.innerWidth;
  const h = mapEl.clientHeight || window.innerHeight;
  svgEl.innerHTML = '';

  const fitScale = Math.min(w / CONFIG.BASE_WIDTH, h / CONFIG.BASE_HEIGHT) * 0.95;
  const offsetX = (w - CONFIG.BASE_WIDTH * fitScale) / 2;
  const offsetY = (h - CONFIG.BASE_HEIGHT * fitScale) / 2;

  china().width(w).height(h).scale(1).language('cn').colorDefault('#ffdce9').colorLake('#ffffff').draw('#mapSvg');

  const svg = d3.select('#mapSvg');
  const g = svg.select('g');

  const allCounts = Array.from(State.provinceGroupsMap.entries()).filter(([k]) => k !== '海外').map(([, arr]) => arr.length);
  const maxCount = allCounts.length ? Math.max(...allCounts) : 1;

  g.selectAll('.province').each(function (d) {
    const count = State.provinceGroupsMap.get(Utils.normalizeProvinceName(d.name))?.length || 0;
    d3.select(this).style('fill', MapUtils.colorByCount(count, maxCount));
  });

  const badgeLayer = g.append('g').attr('class', 'count-layer');
  
  g.selectAll('.province').each(function (d) {
    const count = State.provinceGroupsMap.get(Utils.normalizeProvinceName(d.name))?.length || 0;
    if (!count) return;

    const box = this.getBBox();
    const preferredAnchor = { cx: box.x + box.width / (d.id === 'im' ? 2.8 : 2), cy: box.y + box.height / (d.id === 'im' ? 1.5 : 2) };
    const insideAnchor = MapUtils.ensurePointInsideProvince(this, box, preferredAnchor);
    const offset = MapUtils.getBadgeOffset(d.id);
    
    const cx = Math.max(14, Math.min(CONFIG.BASE_WIDTH - 14, insideAnchor.cx + offset.dx));
    const cy = Math.max(14, Math.min(CONFIG.BASE_HEIGHT - 14, insideAnchor.cy + offset.dy));

    const badge = badgeLayer.append('g').attr('class', 'count-badge')
      .attr('transform', `translate(${cx},${cy})`);
      
    badge.append('circle').attr('r', count > 99 ? 13 : 11);
    badge.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em').text(count > 99 ? '99+' : count);

    badge.on('click', () => {
      d3.event?.stopPropagation();
      const shouldShowBubble = State.invertCtrlBubble ? !!d3.event.ctrlKey : !d3.event.ctrlKey;
      
      if (!shouldShowBubble) {
        setGlobalSearchEnabled(false);
        State.selectedProvinceKey = Utils.normalizeProvinceName(d.name);
        g.selectAll('.province').classed('selected', p => p.id === d.id);
        showProvinceDetails(d.name);
        hideMapBubble();
      } else {
        showMapBubbleByProvince(d.name, cx, cy);
      }
    });
  });

  g.selectAll('.province').on('click', function (d) {
    setGlobalSearchEnabled(false);
    State.selectedProvinceKey = Utils.normalizeProvinceName(d.name);
    g.selectAll('.province').classed('selected', false);
    d3.select(this).classed('selected', true);
    showProvinceDetails(d.name);
    hideMapBubble();
  });

  if (State.selectedProvinceKey) {
    g.selectAll('.province').classed('selected', d => Utils.normalizeProvinceName(d.name) === State.selectedProvinceKey);
  }

  const zoom = d3.behavior.zoom().scaleExtent([fitScale, fitScale * 12]).translate([offsetX, offsetY]).scale(fitScale)
    .on('zoom', () => {
      g.attr('transform', `translate(${d3.event.translate[0]},${d3.event.translate[1]}) scale(${d3.event.scale})`);
      if (State.activeBubbleState) placeMapBubble(State.activeBubbleState.anchorX, State.activeBubbleState.anchorY);
    });

  svg.call(zoom).on('dblclick.zoom', null);
  g.attr('transform', `translate(${offsetX},${offsetY}) scale(${fitScale})`);

  State.mapViewState = { svg, g, zoom, width: w, height: h, minScale: fitScale, maxScale: fitScale * 12, baseScale: fitScale, baseTranslate: [offsetX, offsetY] };
  if (State.activeBubbleState) placeMapBubble(State.activeBubbleState.anchorX, State.activeBubbleState.anchorY);
}

// ==========================================
// 6. 数据请求 (Data Fetching)
// ==========================================
async function reloadBandoriData() {
  let rows = [], source = 'none';
  for (const url of [CONFIG.API_URL, ...CONFIG.FALLBACK_URLS]) {
    try {
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) continue;
      const json = await resp.json();
      if (json?.data && Array.isArray(json.data)) {
        rows = json.data; source = url; break;
      }
    } catch (e) {} // Fallback
  }

  // API 内部去重：相同群号时保留认证时间更新的那条
  if (rows.length) {
    const dedupedMap = new Map();
    rows.forEach((item) => {
      const key = String(item.info || '').trim();
      if (!key) {
        dedupedMap.set(Symbol('no-info'), item);
        return;
      }

      const prev = dedupedMap.get(key);
      if (!prev) {
        dedupedMap.set(key, item);
        return;
      }

      const prevTime = new Date(prev.created_at || 0).getTime() || 0;
      const currTime = new Date(item.created_at || 0).getTime() || 0;
      if (currTime >= prevTime) {
        dedupedMap.set(key, item);
      }
    });

    rows = Array.from(dedupedMap.values());
  }

  try {
    const polymerResp = await fetch(CONFIG.POLYMERIZATION_URL, { cache: 'no-store' });
    if (polymerResp.ok) {
      const polymerJson = await polymerResp.json();
      if (polymerJson?.data && Array.isArray(polymerJson.data)) {
        const apiInfoSet = new Set(rows.map(item => String(item.info || '').trim()).filter(Boolean));
        const mergedRows = rows.slice();

        polymerJson.data.forEach((item) => {
          const infoKey = String(item.info || '').trim();
          if (infoKey && apiInfoSet.has(infoKey)) return;
          mergedRows.push(item);
        });

        rows = mergedRows;
        if (source !== 'none') {
          source += ' + 作者收集';
        } else {
          source = CONFIG.POLYMERIZATION_URL;
        }
      }
    }
  } catch (e) {}

  State.bandoriRows = rows;
  State.currentDataSource = source;
  State.provinceGroupsMap = new Map();
  
  rows.forEach(item => {
    const key = item.type === 'non-regional'
      ? '__non_regional__'
      : Utils.normalizeProvinceName(item.province);
    if (!key) return;
    if (!State.provinceGroupsMap.has(key)) State.provinceGroupsMap.set(key, []);
    State.provinceGroupsMap.get(key).push(item);
  });

  updateSummaryUI(source, false);
  renderChinaMap();
  if (State.selectedProvinceKey === '海外') showProvinceDetails('海外');
}

// ==========================================
// 7. 全局事件绑定 (Event Listeners)
// ==========================================
function bindAllStaticEvents() {
  // 1. 复制功能 (事件委托)
  document.addEventListener('click', async (e) => {
    const linkTrigger = e.target.closest('.copy-number[data-href]');
    if (linkTrigger) {
      const href = linkTrigger.getAttribute('data-href');
      if (href) window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }

    const trigger = e.target.closest('.copy-btn, .copy-number, .map-bubble-item');
    if (!trigger) return;
    
    const text = decodeURIComponent(trigger.getAttribute('data-copy') || '');
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      const targetEl = trigger.querySelector('.bubble-id') || trigger;
      const oldText = targetEl.textContent;
      targetEl.textContent = '已复制';
      setTimeout(() => targetEl.textContent = oldText, 900);
    } catch (err) {}
  });

  // 2. 列表工具栏
  document.getElementById('searchInput')?.addEventListener('input', (e) => { State.listQuery = e.target.value.trim().toLowerCase(); renderCurrentDetail(); });
  document.getElementById('typeFilter')?.addEventListener('change', (e) => { State.listType = e.target.value || 'all'; renderCurrentDetail(); });
  document.getElementById('globalSearchBtn')?.addEventListener('click', () => { setGlobalSearchEnabled(!State.globalSearchEnabled, { resetToDefault: true }); renderCurrentDetail(); });
  document.getElementById('sortBar')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.sort-btn');
    if (btn) { State.listSort = btn.getAttribute('data-sort') || 'default'; updateSortButtonView(); renderCurrentDetail(); }
  });

  // 3. 地图控制与重置视图
  const stepScale = (factor) => {
    if (!State.mapViewState) return;
    const { svg, g, zoom, minScale, maxScale, width, height } = State.mapViewState;
    const current = zoom.scale(), next = Math.max(minScale, Math.min(maxScale, current * factor));
    const t = zoom.translate(), k = next / current, nextT = [width / 2 - (width / 2 - t[0]) * k, height / 2 - (height / 2 - t[1]) * k];
    zoom.scale(next).translate(nextT);
    g.attr('transform', `translate(${nextT[0]},${nextT[1]}) scale(${next})`);
    svg.call(zoom);
  };

  document.getElementById('zoomInBtn')?.addEventListener('click', () => stepScale(1.2));
  document.getElementById('zoomOutBtn')?.addEventListener('click', () => stepScale(1 / 1.2));
  document.getElementById('resetViewBtn')?.addEventListener('click', () => {
    // 开发者模式连点逻辑
    State.resetClickBurstCount++;
    clearTimeout(State.resetClickBurstTimer);
    State.resetClickBurstTimer = setTimeout(() => State.resetClickBurstCount = 0, 1400);
    
    if (State.resetClickBurstCount >= 6) {
      State.developerModeEnabled = !State.developerModeEnabled;
      State.resetClickBurstCount = 0;
      const btn = document.getElementById('resetViewBtn');
      if(btn) {
         btn.textContent = State.developerModeEnabled ? '重置（开发者）' : '重置';
         btn.title = State.developerModeEnabled ? '允许右键' : '禁止右键';
      }
    }

    if (State.mapViewState) {
      const { svg, g, zoom, baseScale, baseTranslate } = State.mapViewState;
      zoom.scale(baseScale).translate([...baseTranslate]);
      g.attr('transform', `translate(${baseTranslate[0]},${baseTranslate[1]}) scale(${baseScale})`);
      svg.call(zoom);
    }
  });

  // 4. 海外切换
  document.getElementById('overseasToggleBtn')?.addEventListener('click', () => {
    setGlobalSearchEnabled(false);
    State.selectedProvinceKey = '海外';
    showProvinceDetails('海外');
    hideMapBubble();
    State.mapViewState?.g.selectAll('.province').classed('selected', false);
  });

  document.getElementById('nonRegionalToggleBtn')?.addEventListener('click', () => {
    setGlobalSearchEnabled(false);
    State.selectedProvinceKey = '非地区';
    showProvinceDetails('非地区');
    hideMapBubble();
    State.mapViewState?.g.selectAll('.province').classed('selected', false);
  });

  document.getElementById('calendarToggleBtn')?.addEventListener('click', () => {
    document.getElementById('calendarModal')?.classList.add('open');
    document.getElementById('calendarModal')?.setAttribute('aria-hidden', 'false');
  });

  // 5. 点击空白处关闭气泡
  document.getElementById('map')?.addEventListener('click', (e) => {
    if (!e.target.closest('#badgeBubble') && !e.target.closest('.count-badge')) hideMapBubble();
  });

  // 6. 刷新数据
  const refreshBtn = document.getElementById('refreshApiBtn');
  refreshBtn?.addEventListener('click', async () => {
    refreshBtn.textContent = '刷新中...';
    refreshBtn.disabled = true;
    await reloadBandoriData();
    refreshBtn.disabled = false;
    refreshBtn.textContent = '刷新数据';
    refreshBtn.classList.remove('show');
  });

  // 7. Intro 与反馈模态框
  document.getElementById('introCloseBtn')?.addEventListener('click', () => document.getElementById('introCard')?.classList.add('collapsed'));
  document.getElementById('introExpandBtn')?.addEventListener('click', () => document.getElementById('introCard')?.classList.remove('collapsed'));
  
  const invertSwitch = document.getElementById('invertCtrlSwitch');
  invertSwitch?.addEventListener('change', () => {
    State.invertCtrlBubble = !!invertSwitch.checked;
    const label = document.getElementById('invertCtrlLabel');
    if(label) label.textContent = State.invertCtrlBubble ? '反转操作（已开启）' : '反转操作（默认关）';
  });

  const themeSwitch = document.getElementById('themeSwitch');
  themeSwitch?.addEventListener('change', () => {
    const currentEffectiveTheme = getPreferredTheme();
    const nextTheme = currentEffectiveTheme === 'dark' ? 'light' : 'dark';
    setThemePreference(nextTheme);
  });

  themeSwitch?.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    setThemePreference('system');
  });

  const feedbackModal = document.getElementById('feedbackModal');
  document.getElementById('feedbackModalBtn')?.addEventListener('click', () => { feedbackModal?.classList.add('open'); feedbackModal?.setAttribute('aria-hidden', 'false'); });
  document.getElementById('feedbackModalClose')?.addEventListener('click', () => { feedbackModal?.classList.remove('open'); feedbackModal?.setAttribute('aria-hidden', 'true'); });
  feedbackModal?.addEventListener('click', (e) => { if (e.target === feedbackModal) feedbackModal.classList.remove('open'); });

  // 8. 右键菜单拦截
  document.addEventListener('contextmenu', (e) => {
    if (State.developerModeEnabled) return;
    e.preventDefault();

    if (e.target.closest('#siteFooter')) {
      document.getElementById('siteFooter')?.classList.add('site-footer-hidden');
      return;
    }

    if (refreshBtn) {
      const nextLeft = `${Math.min(Math.max(8, window.innerWidth - 120), e.clientX + 8)}px`;
      const nextTop = `${Math.min(Math.max(8, window.innerHeight - 48), e.clientY + 8)}px`;
      const wasOpen = refreshBtn.classList.contains('show');

      if (!wasOpen) refreshBtn.classList.add('instant-place');

      refreshBtn.style.left = nextLeft;
      refreshBtn.style.top = nextTop;
      refreshBtn.classList.add('show');

      if (!wasOpen) {
        void refreshBtn.offsetHeight;
        refreshBtn.classList.remove('instant-place');
      }
    }
  }, true);
  document.addEventListener('click', (e) => { if (e.target !== refreshBtn) refreshBtn?.classList.remove('show'); }, true);

  // 9. 彩蛋逻辑
  let easterClickCount = 0, easterTimer = null;
  document.getElementById('introTitle')?.addEventListener('click', () => {
    easterClickCount++;
    clearTimeout(easterTimer);
    easterTimer = setTimeout(() => easterClickCount = 0, 2600);
    if (easterClickCount >= 10) {
      easterClickCount = 0;
      const modal = document.getElementById('easterModal');
      document.getElementById('easterText').textContent = '又到了深夜，我又开始想念户山香澄了。他们都说二次元是假的，但我知道，ksm那句キラキラドキドキ划破次元壁击中我心脏的时候，那种痛觉是真实的。没有ksm的氧气是涩的，没有ksm的太阳是暗的。我现在只要一闭上眼，满脑子全都是星星。医生说我病了，我说对，我得了没有ksm就会死掉的病。如果这个世界上只剩下最后一点星光，那一定是ksm在唱歌。嘿嘿……ksm……我的星星……🤤'; // 简略，不影响逻辑
      modal?.classList.add('open');
    }
  });
  document.getElementById('easterModalClose')?.addEventListener('click', () => document.getElementById('easterModal')?.classList.remove('open'));

  // 10. 移动端防缩放与边缘回弹 (Passive 事件优化)
  document.addEventListener('touchmove', (e) => { if (Utils.isMobileViewport() && e.touches.length >= 2 && !e.target.closest('#map')) e.preventDefault(); }, { passive: false });
  ['gesturestart', 'gesturechange'].forEach(evt => document.addEventListener(evt, (e) => { if (Utils.isMobileViewport() && !e.target.closest('#map')) e.preventDefault(); }, { passive: false }));
}

// ==========================================
// 8. 初始化 (Initialization)
// ==========================================
async function init() {
  initThemePreference();
  bindAllStaticEvents(); // 仅绑定一次
  bindMobileSheetResize();
  applyMobileModeLayout();
  await reloadBandoriData();
}

// 监听窗口尺寸变化 (防抖)
window.addEventListener('resize', Utils.debounce(() => {
  applyMobileModeLayout();
  renderChinaMap();
}, 150)); // 150ms 防抖，大幅降低缩放时的浏览器性能损耗

init();
