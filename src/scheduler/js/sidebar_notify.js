// ===== 🧭 사이드바 =====
    function toggleSidebar(show) {
        const sb = document.getElementById('sidebar');
        const bd = document.getElementById('sidebar-backdrop');
        const open = show === undefined ? sb.classList.contains('-translate-x-full') : show;
        sb.classList.toggle('-translate-x-full', !open);
        bd.classList.toggle('hidden', !open);
    }

    // 메뉴 클릭 → 모바일에서는 사이드바를 닫고 실행
    function navAction(fnName) {
        if (window.innerWidth < 768) toggleSidebar(false);
        const fn = window[fnName];
        if (typeof fn === 'function') setTimeout(fn, window.innerWidth < 768 ? 150 : 0);
    }

    // ===== 🔔 브라우저 개인 알림 =====
    // 채널 전체에 뿌리지 않고, 로그인한 본인에게 할당된 업무만 알린다.
    const BASE_TITLE = 'HITACHI Team Scheduler';
    const NOTIFY_PREF_KEY = 'hitachi_notify_on';
    const SEEN_KEY = 'hitachi_seen_actions';
    const DUE_LOG_KEY = 'hitachi_notified_due';

    function notifySupported() { return typeof Notification !== 'undefined'; }
    function notifyEnabled() {
        return notifySupported() && Notification.permission === 'granted' && localStorage.getItem(NOTIFY_PREF_KEY) !== '0';
    }

    function renderNotifyControl() {
        const icon = document.getElementById('notify-icon');
        const btn = document.getElementById('notify-toggle');
        const banner = document.getElementById('notify-banner');
        if (!icon) return;

        const on = notifyEnabled();
        icon.innerText = on ? 'notifications_active' : 'notifications_off';
        btn.className = `p-1.5 rounded-lg hover:bg-background ${on ? 'text-green-600 dark:text-green-400' : 'text-text-muted'}`;
        btn.title = on ? '알림 켜짐 (클릭하면 끄기)' : '내 업무 브라우저 알림 켜기';

        // 권한이 아직 없고, 사용자가 명시적으로 끈 것도 아닐 때만 안내
        const showBanner = notifySupported() && !on && Notification.permission !== 'denied'
            && localStorage.getItem(NOTIFY_PREF_KEY) !== '0';
        banner.classList.toggle('hidden', !showBanner);
    }

    async function toggleBrowserNotify() {
        if (!notifySupported()) return alert('이 브라우저는 알림을 지원하지 않습니다.');

        if (notifyEnabled()) {                       // 끄기
            localStorage.setItem(NOTIFY_PREF_KEY, '0');
            renderNotifyControl();
            return;
        }
        if (Notification.permission === 'denied') {
            return alert('브라우저에서 이 사이트의 알림이 차단되어 있습니다.\n주소창 왼쪽 자물쇠 아이콘 → 알림 → 허용으로 변경해주세요.');
        }

        let perm = Notification.permission;
        if (perm !== 'granted') perm = await Notification.requestPermission();
        if (perm !== 'granted') { renderNotifyControl(); return; }

        localStorage.setItem(NOTIFY_PREF_KEY, '1');
        seedSeenActions();                           // 기존 항목은 '이미 확인함'으로 처리 (한꺼번에 쏟아지는 것 방지)
        renderNotifyControl();
        showNotification('🔔 알림이 켜졌습니다', '나에게 지시된 새 업무와 마감 임박 건을 알려드립니다.');
    }

    function seedSeenActions() {
        localStorage.setItem(SEEN_KEY, JSON.stringify(actionItems.map(a => a.id)));
    }

    function showNotification(title, body) {
        try {
            const n = new Notification(title, { body: body, tag: 'ts-' + Date.now() });
            n.onclick = () => { window.focus(); openActionDrawer(); n.close(); };
        } catch (e) { console.error('알림 표시 실패:', e); }
    }

    // 탭 제목에 미완료 건수 표시 (권한이 없어도 동작하는 소극적 알림)
    function updateTabTitle() {
        const mine = myOpenActions();
        const over = mine.filter(isOverdue).length;
        document.title = mine.length > 0 ? `(${mine.length}${over > 0 ? '!' : ''}) ${BASE_TITLE}` : BASE_TITLE;
    }

    // 동기화(60초)마다 호출되어 '나에게 온 변화'만 감지해 알림
    function checkActionNotifications() {
        updateTabTitle();
        if (!notifyEnabled()) return;

        const me = getCurrentUsername();
        if (!me) return;

        // 최초 실행이면 기준선만 저장하고 종료 (기존 업무를 신규로 오인하지 않도록)
        if (localStorage.getItem(SEEN_KEY) === null) { seedSeenActions(); return; }

        const seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
        const dueLog = JSON.parse(localStorage.getItem(DUE_LOG_KEY) || '{}');
        const today = todayStrLocal();
        const mineOpen = actionItems.filter(a => a.assignee === me && a.status !== 'done');

        // ① 새로 지시받은 업무 (내가 스스로 만든 건 제외)
        const fresh = mineOpen.filter(a => !seen.has(a.id) && a.assigner !== me);
        if (fresh.length === 1) {
            const f = fresh[0];
            showNotification('📥 새 업무가 지시되었습니다',
                `${f.title}\n지시: ${f.assigner || '?'}${f.dueDate ? ' · 마감 ' + f.dueDate : ''}`);
        } else if (fresh.length > 1) {
            showNotification(`📥 새 업무 ${fresh.length}건이 지시되었습니다`,
                fresh.slice(0, 4).map(a => '· ' + a.title).join('\n'));
        }

        // ② 기한 초과 / 오늘 마감 / D-1 → 항목별 하루 1회만
        const dueSoon = mineOpen.filter(a => {
            if (!a.dueDate) return false;
            if (dueLog[a.id] === today) return false;
            const diff = Math.round((toDateObj(a.dueDate) - toDateObj(today)) / 86400000);
            return diff <= 1;
        });
        if (dueSoon.length > 0) {
            const over = dueSoon.filter(isOverdue).length;
            const title = over > 0 ? `🔴 기한이 지난 업무 ${over}건이 있습니다` : `🟠 마감이 임박한 업무 ${dueSoon.length}건`;
            const body = dueSoon.slice(0, 4).map(a => {
                const d = Math.round((toDateObj(a.dueDate) - toDateObj(today)) / 86400000);
                const when = d < 0 ? `${Math.abs(d)}일 지남` : d === 0 ? '오늘 마감' : 'D-1';
                return `· [${when}] ${a.title}`;
            }).join('\n');
            showNotification(title, body);
            dueSoon.forEach(a => { dueLog[a.id] = today; });
        }

        // 기준선 갱신 + 삭제된 항목 기록 정리
        localStorage.setItem(SEEN_KEY, JSON.stringify(actionItems.map(a => a.id)));
        const alive = new Set(actionItems.map(a => a.id));
        Object.keys(dueLog).forEach(k => { if (!alive.has(k)) delete dueLog[k]; });
        localStorage.setItem(DUE_LOG_KEY, JSON.stringify(dueLog));
    }
    // ===========================

    // ===== 사용자 이름 관리 =====
    function getCurrentUsername() {
        return localStorage.getItem('hitachi_username') || '';
    }

    function updateHeaderUsername() {
        const name = getCurrentUsername();
        const el = document.getElementById('header-username');
        el.innerText = name || '이름 미설정';
    }

    function openUsernameModal() {
        document.getElementById('username-input').value = getCurrentUsername();
        document.getElementById('username-modal').classList.remove('hidden');
        setTimeout(() => document.getElementById('username-input').focus(), 50);
    }

    function saveUsername() {
        const name = document.getElementById('username-input').value.trim();
        if (!name) return alert('이름을 입력해주세요.');
        localStorage.setItem('hitachi_username', name);
        document.getElementById('username-modal').classList.add('hidden');
        updateHeaderUsername();
        updateActionBadge();   // 사용자 변경 시 '내 할 일' 재계산
    }

    // 초기 방문 시 이름 팝업
    function checkUsername() {
        if (!getCurrentUsername()) {
            document.getElementById('username-modal').classList.remove('hidden');
            setTimeout(() => document.getElementById('username-input').focus(), 50);
        }
        updateHeaderUsername();
    }
    // ===========================

    // ===== 🔔 Setup 알림 관리 =====
    // 알람 대상 일정 계산: category가 Setup이고 alarmOn이 true이며,
    // 시작일이 오늘부터 14일 이내(과거 지난 일정은 제외)인 경우
    function getAlarmEvents() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const limit = new Date(today);
        limit.setDate(limit.getDate() + 14);

        return cachedEvents.filter(ev => {
            const isAlarmOn = ev.alarmOn === true || ev.alarmOn === 'true';
            if (!isAlarmOn || ev.category !== 'cat-setup') return false;
            if (!ev.date || ev.date.startsWith('note-')) return false;
            const evDate = new Date(ev.date);
            if (isNaN(evDate)) return false;
            return evDate >= today && evDate <= limit;
        }).sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    function updateAlarmBadge() {
        const alarms = getAlarmEvents();
        const badge = document.getElementById('nav-alarm-count');
        if (!badge) return;
        if (alarms.length > 0) {
            badge.classList.remove('hidden');
            badge.innerText = alarms.length > 99 ? '99+' : alarms.length;
        } else {
            badge.classList.add('hidden');
        }
    }

    function openAlarmModal() {
        const alarms = getAlarmEvents();
        const listEl = document.getElementById('alarm-list');
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (alarms.length === 0) {
            listEl.innerHTML = '<div class="text-center text-text-muted py-10 text-sm">14일 이내 예정된 Setup 알림이 없습니다.</div>';
        } else {
            listEl.innerHTML = alarms.map(ev => {
                const evDate = toDateObj(ev.date);
                const dDay = Math.round((evDate - today) / (1000 * 60 * 60 * 24));
                const dDayLabel = dDay === 0 ? 'D-DAY' : `D-${dDay}`;
                return `
                    <div class="relative border-l-4 border-purple-500 bg-purple-50/50 dark:bg-gray-800 p-3 rounded-r-lg shadow-sm cursor-pointer active:opacity-70" onclick="closeAlarmModal(); openEditModal('${escHtml(ev.id)}')">
                        <div class="flex justify-between items-start mb-1">
                            <span class="text-xs font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">${escHtml(dDayLabel)}</span>
                            <span class="text-[10px] text-text-muted">${escHtml(ev.date)} · ${escHtml(ev.line)}</span>
                        </div>
                        <div class="text-sm font-bold text-text-main dark:text-gray-100">${escHtml(ev.title)}</div>
                        ${ev.worker ? `<div class="text-[10px] text-text-muted mt-1 flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">person</span>${escHtml(ev.worker)}</div>` : ''}
                    </div>`;
            }).join('');
        }
        document.getElementById('alarm-modal').classList.remove('hidden');
    }

    function closeAlarmModal() { document.getElementById('alarm-modal').classList.add('hidden'); }
    // ===========================
