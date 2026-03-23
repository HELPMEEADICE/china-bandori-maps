(() => {
  const state = {
    events: [],
    currentDate: new Date(),
  };

  const els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseEventDate(str) {
    if (!str) return null;
    const m = String(str).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  async function loadEvents() {
    try {
      const resp = await fetch('./bandori_events.json', { cache: 'no-store' });
      if (!resp.ok) return;
      const json = await resp.json();
      if (Array.isArray(json?.events)) {
        state.events = json.events
          .map((item) => ({
            ...item,
            parsedDate: parseEventDate(item.date),
          }))
          .filter((item) => item.parsedDate instanceof Date && !Number.isNaN(item.parsedDate.getTime()));
      }
    } catch (e) {}
  }

  function openCalendar() {
    els.calendarModal.classList.add('open');
    els.calendarModal.setAttribute('aria-hidden', 'false');
    renderCalendar();
  }

  function closeCalendar() {
    els.calendarModal.classList.remove('open');
    els.calendarModal.setAttribute('aria-hidden', 'true');
  }

  function openPoster(eventData) {
    els.eventPosterTitle.textContent = eventData.event || '活动详情';
    els.eventPosterText.textContent = eventData.raw_text || '';
    els.eventPosterImage.src = `./images/${eventData.image}`;
    els.eventPosterModal.classList.add('open');
    els.eventPosterModal.setAttribute('aria-hidden', 'false');
  }

  function closePoster() {
    els.eventPosterModal.classList.remove('open');
    els.eventPosterModal.setAttribute('aria-hidden', 'true');
  }

  function renderCalendar() {
    const current = state.currentDate;
    const year = current.getFullYear();
    const month = current.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = firstDay.getDay();
    const totalDays = lastDay.getDate();

    els.calendarTitle.textContent = `${year}年${month + 1}月 活动日历`;

    const eventMap = new Map();
    state.events.forEach((item) => {
      const key = formatDateKey(item.parsedDate);
      if (!eventMap.has(key)) eventMap.set(key, []);
      eventMap.get(key).push(item);
    });

    const weekLabels = ['日', '一', '二', '三', '四', '五', '六'];
    const cells = weekLabels.map((w) => `<div class="calendar-weekday">${w}</div>`);

    for (let i = 0; i < startWeekday; i += 1) {
      cells.push('<div class="calendar-cell empty"></div>');
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const date = new Date(year, month, day);
      const key = formatDateKey(date);
      const events = eventMap.get(key) || [];
      cells.push(`
        <button class="calendar-cell ${events.length ? 'has-event' : ''}" type="button" data-date="${key}">
          <span class="calendar-day">${day}</span>
          ${events.length ? `<span class="calendar-dot">${events.length}</span>` : ''}
        </button>
      `);
    }

    els.calendarGrid.innerHTML = cells.join('');

    const monthEvents = state.events
      .filter((item) => item.parsedDate.getFullYear() === year && item.parsedDate.getMonth() === month)
      .sort((a, b) => a.parsedDate - b.parsedDate);

    if (!monthEvents.length) {
      els.calendarEventList.innerHTML = '<div class="calendar-empty">本月暂无活动</div>';
      return;
    }

    els.calendarEventList.innerHTML = monthEvents
      .map((item, index) => {
        const dateKey = formatDateKey(item.parsedDate);
        return `
          <button class="calendar-event-item" type="button" data-index="${index}" data-date="${dateKey}">
            <div class="calendar-event-date">${dateKey}</div>
            <div class="calendar-event-name">${item.event || '未命名活动'}</div>
            <div class="calendar-event-text">${item.raw_text || ''}</div>
          </button>
        `;
      })
      .join('');
  }

  function bindEvents() {
    els.calendarToggleBtn?.addEventListener('click', openCalendar);
    els.calendarModalClose?.addEventListener('click', closeCalendar);
    els.calendarModal?.addEventListener('click', (e) => {
      if (e.target === els.calendarModal) closeCalendar();
    });

    els.calendarPrevBtn?.addEventListener('click', () => {
      state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() - 1, 1);
      renderCalendar();
    });

    els.calendarNextBtn?.addEventListener('click', () => {
      state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 1);
      renderCalendar();
    });

    els.calendarEventList?.addEventListener('click', (e) => {
      const item = e.target.closest('.calendar-event-item');
      if (!item) return;
      const date = item.getAttribute('data-date');
      const indexInMonth = Number(item.getAttribute('data-index'));
      const current = state.currentDate;
      const monthEvents = state.events
        .filter((ev) => ev.parsedDate.getFullYear() === current.getFullYear() && ev.parsedDate.getMonth() === current.getMonth())
        .sort((a, b) => a.parsedDate - b.parsedDate);
      const eventData = monthEvents[indexInMonth];
      if (eventData) openPoster(eventData);
    });

    els.calendarGrid?.addEventListener('click', (e) => {
      const cell = e.target.closest('.calendar-cell.has-event');
      if (!cell) return;
      const dateKey = cell.getAttribute('data-date');
      const match = state.events.find((item) => formatDateKey(item.parsedDate) === dateKey);
      if (match) openPoster(match);
    });

    els.eventPosterClose?.addEventListener('click', closePoster);
    els.eventPosterModal?.addEventListener('click', (e) => {
      if (e.target === els.eventPosterModal) closePoster();
    });
  }

  async function init() {
    els.calendarToggleBtn = $('calendarToggleBtn');
    els.calendarModal = $('calendarModal');
    els.calendarModalClose = $('calendarModalClose');
    els.calendarPrevBtn = $('calendarPrevBtn');
    els.calendarNextBtn = $('calendarNextBtn');
    els.calendarTitle = $('calendarTitle');
    els.calendarGrid = $('calendarGrid');
    els.calendarEventList = $('calendarEventList');
    els.eventPosterModal = $('eventPosterModal');
    els.eventPosterClose = $('eventPosterClose');
    els.eventPosterTitle = $('eventPosterTitle');
    els.eventPosterImage = $('eventPosterImage');
    els.eventPosterText = $('eventPosterText');

    await loadEvents();
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
