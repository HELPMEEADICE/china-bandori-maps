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
let mobileEdgeBounceBound = false;
let easterEggBound = false;
let mobilePinchGuardBound = false;
let footerHideBound = false;
let listToolsBound = false;
let currentDetailProvinceName = '';
let currentDetailRows = [];
let listQuery = '';
let listType = 'all';
let listSort = 'default';
let globalSearchEnabled = false;
let currentDataSource = 'none';

function isMobileViewport() {
  return window.matchMedia('(max-width: 720px)').matches;
}

function applyMobileModeLayout() {
  const mapEl = document.getElementById('map');
  const selectedCard = document.getElementById('selectedCard');
  const overseasBtn = document.getElementById('overseasToggleBtn');
  const controlCard = document.getElementById('controlCard');
  const introCard = document.getElementById('introCard');
  if (!mapEl || !selectedCard || !overseasBtn || !controlCard || !introCard) return;

  if (isMobileViewport()) {
    if (overseasBtn.parentElement !== selectedCard) {
      selectedCard.insertBefore(overseasBtn, selectedCard.firstChild);
    }
    overseasBtn.classList.add('mobile-inside');
    controlCard.classList.add('mobile-hidden');
    introCard.classList.add('collapsed');
    return;
  }

  if (overseasBtn.parentElement !== mapEl) {
    mapEl.insertBefore(overseasBtn, document.getElementById('controlCard'));
  }
  overseasBtn.classList.remove('mobile-inside');
  controlCard.classList.remove('mobile-hidden');
}

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

function typeFilterValue(type) {
  if (type === 'school') return 'school';
  if (type === 'region') return 'region';
  return 'other';
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

function bindListTools() {
  if (listToolsBound) return;

  const searchInput = document.getElementById('searchInput');
  const typeFilter = document.getElementById('typeFilter');
  const sortBar = document.getElementById('sortBar');
  const globalSearchBtn = document.getElementById('globalSearchBtn');
  if (!searchInput || !typeFilter || !sortBar || !globalSearchBtn) return;

  searchInput.addEventListener('input', () => {
    listQuery = String(searchInput.value || '').trim().toLowerCase();
    renderCurrentDetail();
  });

  typeFilter.addEventListener('change', () => {
    listType = typeFilter.value || 'all';
    renderCurrentDetail();
  });

  globalSearchBtn.addEventListener('click', () => {
    if (!globalSearchEnabled) {
      setGlobalSearchEnabled(true, { resetToDefault: false });
      renderCurrentDetail();
    } else {
      setGlobalSearchEnabled(false, { resetToDefault: true });
    }
  });

  sortBar.addEventListener('click', (event) => {
    const btn = event.target.closest('.sort-btn');
    if (!btn) return;

    const key = btn.getAttribute('data-sort') || 'default';
    if (key === 'time_desc' || key === 'time_asc') {
      listSort = listSort === 'time_desc' ? 'time_asc' : 'time_desc';
    } else if (key === 'name_asc' || key === 'name_desc') {
      listSort = listSort === 'name_asc' ? 'name_desc' : 'name_asc';
    } else if (key === 'type_asc' || key === 'type_desc') {
      listSort = listSort === 'type_asc' ? 'type_desc' : 'type_asc';
    } else {
      listSort = 'default';
    }

    updateSortButtonView();
    renderCurrentDetail();
  });

  updateSortButtonView();

  listToolsBound = true;
}

function setGlobalSearchEnabled(enabled, options = {}) {
  const { resetToDefault = false } = options;

  globalSearchEnabled = !!enabled;

  const globalSearchBtn = document.getElementById('globalSearchBtn');
  if (globalSearchBtn) {
    globalSearchBtn.classList.toggle('active', globalSearchEnabled);
    globalSearchBtn.setAttribute('aria-pressed', globalSearchEnabled ? 'true' : 'false');
  }

  if (globalSearchEnabled) {
    selectedProvinceKey = null;
    currentDetailProvinceName = '';
    currentDetailRows = [];
    if (mapViewState && mapViewState.g) {
      mapViewState.g.selectAll('.province').classed('selected', false);
    }
  }

  if (!globalSearchEnabled && resetToDefault) {
    selectedProvinceKey = null;
    currentDetailProvinceName = '';
    currentDetailRows = [];
    hideMapBubble();
    updateSummaryUI(currentDataSource);
  }
}

function updateSortButtonView() {
  const sortBar = document.getElementById('sortBar');
  if (!sortBar) return;

  const buttons = Array.from(sortBar.querySelectorAll('.sort-btn'));
  buttons.forEach((btn) => {
    const key = btn.getAttribute('data-sort') || '';
    btn.classList.remove('active');

    if (key === 'default') {
      btn.textContent = '默认';
      if (listSort === 'default') btn.classList.add('active');
      return;
    }

    if (key === 'time_desc' || key === 'time_asc') {
      btn.textContent = listSort === 'time_asc' ? '认证时间 ↑' : '认证时间 ↓';
      if (listSort === 'time_asc' || listSort === 'time_desc') btn.classList.add('active');
      btn.setAttribute('data-sort', listSort === 'time_asc' ? 'time_asc' : 'time_desc');
      return;
    }

    if (key === 'name_asc' || key === 'name_desc') {
      btn.textContent = listSort === 'name_desc' ? '首字母 Z→A' : '首字母 A→Z';
      if (listSort === 'name_asc' || listSort === 'name_desc') btn.classList.add('active');
      btn.setAttribute('data-sort', listSort === 'name_desc' ? 'name_desc' : 'name_asc');
      return;
    }

    if (key === 'type_asc' || key === 'type_desc') {
      btn.textContent = listSort === 'type_desc' ? '类型 Z→A' : '类型 A→Z';
      if (listSort === 'type_asc' || listSort === 'type_desc') btn.classList.add('active');
      btn.setAttribute('data-sort', listSort === 'type_desc' ? 'type_desc' : 'type_asc');
    }
  });
}

function getFilteredSortedRows(rows) {
  let result = rows.slice();

  if (listType !== 'all') {
    result = result.filter((item) => typeFilterValue(item.type) === listType);
  }

  if (listQuery) {
    result = result.filter((item) => {
      const name = String(item.name || '').toLowerCase();
      const info = String(item.info || '').toLowerCase();
      return name.includes(listQuery) || info.includes(listQuery);
    });
  }

  const byTimeDesc = (a, b) => {
    const ta = new Date(a.created_at || 0).getTime() || 0;
    const tb = new Date(b.created_at || 0).getTime() || 0;
    return tb - ta;
  };

  if (listSort === 'time_desc') {
    result.sort(byTimeDesc);
  } else if (listSort === 'time_asc') {
    result.sort((a, b) => byTimeDesc(b, a));
  } else if (listSort === 'name_asc') {
    result.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN-u-co-pinyin'));
  } else if (listSort === 'name_desc') {
    result.sort((a, b) => String(b.name || '').localeCompare(String(a.name || ''), 'zh-CN-u-co-pinyin'));
  } else if (listSort === 'type_asc') {
    result.sort((a, b) => {
      const ta = groupTypeText(a.type);
      const tb = groupTypeText(b.type);
      const cmp = ta.localeCompare(tb, 'zh-CN-u-co-pinyin');
      if (cmp !== 0) return cmp;
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN-u-co-pinyin');
    });
  } else if (listSort === 'type_desc') {
    result.sort((a, b) => {
      const ta = groupTypeText(a.type);
      const tb = groupTypeText(b.type);
      const cmp = tb.localeCompare(ta, 'zh-CN-u-co-pinyin');
      if (cmp !== 0) return cmp;
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN-u-co-pinyin');
    });
  } else {
    result.sort((a, b) => {
      if ((b.verified || 0) !== (a.verified || 0)) return (b.verified || 0) - (a.verified || 0);
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
    });
  }

  return result;
}

function renderGroupList(rows) {
  const listEl = document.getElementById('groupList');
  if (!listEl) return;

  if (!rows.length) {
    listEl.innerHTML = '<div class="empty-text">没有匹配到结果</div>';
    return;
  }

  listEl.innerHTML = rows
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
}

function renderCurrentDetail() {
  if (!currentDetailProvinceName && !globalSearchEnabled) return;

  const titleEl = document.getElementById('selectedTitle');
  const countEl = document.getElementById('selectedProvince');
  const metaEl = document.getElementById('selectedMeta');

  const sourceRows = globalSearchEnabled ? bandoriRows : currentDetailRows;
  const filtered = getFilteredSortedRows(sourceRows);
  const schoolCount = filtered.filter((x) => x.type === 'school').length;
  const regionCount = filtered.filter((x) => x.type === 'region').length;
  const otherCount = filtered.length - schoolCount - regionCount;

  const scopeName = currentDetailProvinceName || '未选择省份';

  animateSelectedCardUpdate(() => {
    if (titleEl) titleEl.textContent = globalSearchEnabled ? '全局搜索 · 群详情' : `${currentDetailProvinceName} · 群详情`;
    if (countEl) countEl.textContent = `${filtered.length} / ${sourceRows.length} 个群`;
    if (metaEl) {
      const scope = globalSearchEnabled ? '范围 全局' : `范围 ${scopeName}`;
      metaEl.textContent = `${scope} · 地区 ${regionCount} · 校群 ${schoolCount} · 其他 ${otherCount}`;
    }
    renderGroupList(filtered);
  });
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

      const footer = document.getElementById('siteFooter');
      if (footer && event.target instanceof Element && event.target.closest('#siteFooter')) {
        event.preventDefault();
        footer.classList.add('site-footer-hidden');
        return;
      }

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

function bindFooterHide() {
  if (footerHideBound) return;
  footerHideBound = true;
}

async function reloadBandoriData() {
  const { rows, source } = await fetchBandoriData();
  bandoriRows = rows;
  currentDataSource = source;
  provinceGroupsMap = buildProvinceMap(bandoriRows);
  updateSummaryUI(source, false);
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

function bindMobileEdgeBounce() {
  if (mobileEdgeBounceBound) return;

  const attach = (scrollEl, bounceEl) => {
    if (!scrollEl || !bounceEl) return;

    let startY = 0;
    let lock = false;

    scrollEl.addEventListener(
      'touchstart',
      (event) => {
        if (!isMobileViewport()) return;
        startY = event.touches?.[0]?.clientY || 0;
        lock = false;
      },
      { passive: true }
    );

    scrollEl.addEventListener(
      'touchmove',
      (event) => {
        if (!isMobileViewport() || lock) return;
        const currentY = event.touches?.[0]?.clientY || startY;
        const dy = currentY - startY;
        const atTop = scrollEl.scrollTop <= 0;
        const atBottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1;

        if (atTop && dy > 12) {
          bounceEl.classList.remove('edge-bounce-down');
          void bounceEl.offsetHeight;
          bounceEl.classList.add('edge-bounce-down');
          setTimeout(() => bounceEl.classList.remove('edge-bounce-down'), 280);
          lock = true;
        } else if (atBottom && dy < -12) {
          bounceEl.classList.remove('edge-bounce-up');
          void bounceEl.offsetHeight;
          bounceEl.classList.add('edge-bounce-up');
          setTimeout(() => bounceEl.classList.remove('edge-bounce-up'), 280);
          lock = true;
        }
      },
      { passive: true }
    );
  };

  attach(document.getElementById('groupList'), document.getElementById('selectedCard'));
  attach(document.getElementById('introCard'), document.getElementById('introCard'));

  mobileEdgeBounceBound = true;
}

function bindEasterEgg() {
  if (easterEggBound) return;

  const titleEl = document.getElementById('introTitle');
  const modal = document.getElementById('easterModal');
  const closeBtn = document.getElementById('easterModalClose');
  const textEl = document.getElementById('easterText');
  if (!titleEl || !modal || !closeBtn || !textEl) return;

  const easterText =
    '又到了深夜，我又开始想念户山香澄了。他们都说二次元是假的，但我知道，ksm那句キラキラドキドキ划破次元壁击中我心脏的时候，那种痛觉是真实的。没有ksm的氧气是涩的，没有ksm的太阳是暗的。我现在只要一闭上眼，满脑子全都是星星。医生说我病了，我说对，我得了没有ksm就会死掉的病。如果这个世界上只剩下最后一点星光，那一定是ksm在唱歌。嘿嘿……ksm……我的星星……🤤';

  let clickCount = 0;
  let clickTimer = null;

  const open = () => {
    textEl.textContent = easterText;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  };

  const close = () => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  };

  titleEl.addEventListener('click', () => {
    clickCount += 1;
    if (clickTimer) clearTimeout(clickTimer);

    clickTimer = setTimeout(() => {
      clickCount = 0;
    }, 2600);

    if (clickCount >= 10) {
      clickCount = 0;
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      open();
    }
  });

  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });

  easterEggBound = true;
}

function bindMobilePinchGuard() {
  if (mobilePinchGuardBound) return;

  const shouldBlock = (event) => {
    if (!isMobileViewport()) return false;
    const target = event.target;
    if (!target || !(target instanceof Element)) return false;
    return !target.closest('#map');
  };

  document.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches && event.touches.length >= 2 && shouldBlock(event)) {
        event.preventDefault();
      }
    },
    { passive: false }
  );

  document.addEventListener(
    'gesturestart',
    (event) => {
      if (shouldBlock(event)) {
        event.preventDefault();
      }
    },
    { passive: false }
  );

  document.addEventListener(
    'gesturechange',
    (event) => {
      if (shouldBlock(event)) {
        event.preventDefault();
      }
    },
    { passive: false }
  );

  mobilePinchGuardBound = true;
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

function updateSummaryUI(source, animate = true) {
  const titleEl = document.getElementById('selectedTitle');
  const countEl = document.getElementById('selectedProvince');
  const metaEl = document.getElementById('selectedMeta');
  const listEl = document.getElementById('groupList');

  const mainlandTotal = Array.from(provinceGroupsMap.keys()).reduce((sum, key) => {
    if (key === '海外') return sum;
    return sum + (provinceGroupsMap.get(key)?.length || 0);
  }, 0);

  const applySummary = () => {
    if (titleEl) titleEl.textContent = '全国邦群数据';
    if (countEl) countEl.textContent = `${mainlandTotal} 个群`;
    if (metaEl) metaEl.textContent = `数据源：${source}`;
    if (listEl) {
      listEl.innerHTML = '<div class="empty-text">点击地图省份查看详细群信息</div>';
    }
  };

  if (animate) animateSelectedCardUpdate(applySummary);
  else applySummary();

  const searchInput = document.getElementById('searchInput');
  const typeFilter = document.getElementById('typeFilter');
  const sortBar = document.getElementById('sortBar');
  if (searchInput) searchInput.value = '';
  if (typeFilter) typeFilter.value = 'all';
  if (sortBar) {
    listSort = 'default';
    updateSortButtonView();
  }
  const globalSearchBtn = document.getElementById('globalSearchBtn');
  if (globalSearchBtn) {
    globalSearchEnabled = false;
    globalSearchBtn.classList.remove('active');
    globalSearchBtn.setAttribute('aria-pressed', 'false');
  }
  listQuery = '';
  listType = 'all';
  listSort = 'default';
  currentDetailProvinceName = '';
  currentDetailRows = [];

  const overseasBtn = document.getElementById('overseasToggleBtn');
  if (overseasBtn) overseasBtn.classList.remove('active');
}

function showProvinceDetails(provinceName) {
  const key = normalizeProvinceName(provinceName);
  const rows = provinceGroupsMap.get(key) || [];

  currentDetailProvinceName = provinceName;
  currentDetailRows = rows;
  renderCurrentDetail();

  const overseasBtn = document.getElementById('overseasToggleBtn');
  if (overseasBtn) {
    if (key === '海外') overseasBtn.classList.add('active');
    else overseasBtn.classList.remove('active');
  }
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
      if (globalSearchEnabled) {
        setGlobalSearchEnabled(false, { resetToDefault: false });
      }
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
        if (globalSearchEnabled) {
          setGlobalSearchEnabled(false, { resetToDefault: false });
        }
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
    if (globalSearchEnabled) {
      setGlobalSearchEnabled(false, { resetToDefault: false });
    }
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
  applyMobileModeLayout();
  await reloadBandoriData();
  bindCopyAction();
  bindListTools();
  bindIntroToggle();
  bindFeedbackModal();
  bindRightClickGuard();
  bindRefreshAction();
  bindMobileEdgeBounce();
  bindEasterEgg();
  bindMobilePinchGuard();
  bindFooterHide();
}

window.addEventListener('resize', () => {
  applyMobileModeLayout();
  renderChinaMap();
});
init();

