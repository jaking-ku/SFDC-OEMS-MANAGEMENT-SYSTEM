// ===== ✅ Action Required List =====
    // 업무 지시 누락 방지용 부가 기능. 로그인 이름(hitachi_username)으로 본인을 식별하고
    // 담당자 목록은 [팀원관리]에 등록된 팀원을 그대로 사용한다.
    let actionItems = [];
    let actionTab = 'mine';
    let actionBackendReady = true;   // Apps Script 업데이트 여부
    let actionPickedAssignees = [];

    function escHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g,
            c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function todayStrLocal() { return toDateStr(new Date()); }

    // ---------- 서버 통신 ----------
    async function loadActions() {
        if (!SCRIPT_URL.startsWith("https")) return;
        try {
            const res = await fetch(SCRIPT_URL + "?t=" + new Date().getTime(),
                { method: "POST", cache: "no-store", body: JSON.stringify({ action: 'readActions' }) });
            const data = await res.json();
            if (Array.isArray(data)) {
                actionItems = data.filter(a => a && a.id);
                actionBackendReady = true;
            } else {
                actionBackendReady = false;   // 구버전 Apps Script
            }
        } catch (e) {
            console.error('Action 목록 로드 실패:', e);
        }
        updateActionBadge();
        checkActionNotifications();   // 나에게 온 변화만 감지해 개인 알림
        if (!document.getElementById('action-drawer').classList.contains('translate-x-full')) renderActionList();
    }

    // ---------- 배지 ----------
    function myOpenActions() {
        const me = getCurrentUsername();
        return actionItems.filter(a => a.assignee === me && a.status !== 'done');
    }
    function isOverdue(a) {
        return a.status !== 'done' && a.dueDate && String(a.dueDate) < todayStrLocal();
    }
    function updateActionBadge() {
        const mine = myOpenActions();
        const over = mine.filter(isOverdue).length;
        const label = mine.length > 99 ? '99+' : String(mine.length);
        const color = over > 0 ? '#dc2626' : '#f59e0b';

        // 사이드바 카운트
        const nav = document.getElementById('nav-action-count');
        if (nav) {
            nav.classList.toggle('hidden', mine.length === 0);
            nav.innerText = label;
            nav.style.background = color;
        }
        // 모바일 상단바 배지
        const m = document.getElementById('action-badge-m');
        if (m) {
            m.classList.toggle('hidden', mine.length === 0);
            m.innerText = label;
            m.style.background = color;
        }
    }

    // ---------- 드로어 ----------
    function openActionDrawer() {
        if (!getCurrentUsername()) { alert('먼저 이름을 설정해주세요. (우측 상단 이름 클릭)'); return openUsernameModal(); }
        document.getElementById('action-backdrop').classList.remove('hidden');
        document.getElementById('action-drawer').classList.remove('translate-x-full');
        renderNotifyControl();
        renderActionList();
        loadActions();
    }
    function closeActionDrawer() {
        document.getElementById('action-backdrop').classList.add('hidden');
        document.getElementById('action-drawer').classList.add('translate-x-full');
        toggleActionForm(false);
    }
    function switchActionTab(tab) {
        actionTab = tab;
        document.querySelectorAll('.act-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        renderActionList();
    }

    // ---------- 입력 폼 ----------
    function toggleActionForm(show, editItem) {
        const form = document.getElementById('action-form');
        const openBtn = document.getElementById('action-open-form-btn');
        if (!show) {
            form.classList.add('hidden');
            openBtn.parentElement.classList.remove('hidden');
            document.getElementById('action-edit-id').value = '';
            return;
        }
        form.classList.remove('hidden');
        openBtn.parentElement.classList.add('hidden');

        if (editItem) {
            document.getElementById('action-form-title').innerText = '업무 수정';
            document.getElementById('action-save-label').innerText = '수정 완료';
            document.getElementById('action-edit-id').value = editItem.id;
            document.getElementById('action-input-title').value = editItem.title || '';
            document.getElementById('action-input-detail').value = editItem.detail || '';
            document.getElementById('action-input-due').value = editItem.dueDate || '';
            document.getElementById('action-input-priority').value = editItem.priority || 'normal';
            actionPickedAssignees = editItem.assignee ? [editItem.assignee] : [];
        } else {
            document.getElementById('action-form-title').innerText = '새 업무 추가';
            document.getElementById('action-save-label').innerText = '등록';
            document.getElementById('action-edit-id').value = '';
            document.getElementById('action-input-title').value = '';
            document.getElementById('action-input-detail').value = '';
            document.getElementById('action-input-due').value = '';
            document.getElementById('action-input-priority').value = 'normal';
            actionPickedAssignees = [];
        }
        renderAssigneePicks();
        setTimeout(() => document.getElementById('action-input-title').focus(), 50);
    }

    function candidateAssignees() {
        const me = getCurrentUsername();
        const list = teamMembers.slice();
        if (me && !list.includes(me)) list.unshift(me);   // 팀원 목록에 없어도 본인은 항상 선택 가능
        return list;
    }

    function renderAssigneePicks() {
        const wrap = document.getElementById('action-assignee-picks');
        const hint = document.getElementById('action-assignee-hint');
        const isEdit = !!document.getElementById('action-edit-id').value;
        const cands = candidateAssignees();

        if (cands.length === 0) {
            hint.innerText = '';
            wrap.innerHTML = `<span class="text-[11px] text-text-muted">팀원이 없습니다. <button type="button" onclick="openTeamModal()" class="font-bold text-primary hover:underline">팀원관리</button>에서 먼저 등록해주세요.</span>`;
            return;
        }
        hint.innerText = isEdit ? '(1명)' : '(여러 명 선택 가능)';
        const me = getCurrentUsername();
        wrap.innerHTML = cands.map((n, i) => {
            const on = actionPickedAssignees.includes(n);
            return `<button type="button" class="act-pick ${on ? 'on' : ''}" onclick="toggleAssigneePick(${i})">${escHtml(n)}${n === me ? ' (나)' : ''}</button>`;
        }).join('');
    }

    function toggleAssigneePick(idx) {
        const name = candidateAssignees()[idx];
        if (name === undefined) return;
        const isEdit = !!document.getElementById('action-edit-id').value;
        if (isEdit) {
            actionPickedAssignees = [name];             // 수정 시에는 1명만
        } else if (actionPickedAssignees.includes(name)) {
            actionPickedAssignees = actionPickedAssignees.filter(n => n !== name);
        } else {
            actionPickedAssignees.push(name);
        }
        renderAssigneePicks();
    }

    // ---------- 저장 ----------
    function saveActionItem() {
        const title = document.getElementById('action-input-title').value.trim();
        const detail = document.getElementById('action-input-detail').value.trim();
        const dueDate = document.getElementById('action-input-due').value;
        const priority = document.getElementById('action-input-priority').value;
        const editId = document.getElementById('action-edit-id').value;
        const me = getCurrentUsername();

        if (!title) return alert('업무 내용을 입력해주세요.');
        if (actionPickedAssignees.length === 0) return alert('담당자를 선택해주세요.');

        if (editId) {
            const it = actionItems.find(a => a.id === editId);
            if (!it) return;
            Object.assign(it, { title, detail, dueDate, priority, assignee: actionPickedAssignees[0] });
            sendToSheet({ action: 'updateAction', ...it });
        } else {
            const now = todayStrLocal();
            actionPickedAssignees.forEach((assignee, i) => {
                const item = {
                    id: 'ACT_' + Date.now() + i + Math.floor(Math.random() * 1000),
                    title, detail, assigner: me, assignee, dueDate, priority,
                    status: 'open', createdAt: now, completedAt: ''
                };
                actionItems.push(item);
                sendToSheet({ action: 'addAction', ...item });
            });
        }

        toggleActionForm(false);
        renderActionList();
        updateActionBadge();
        syncAfterWrites();
    }

    function toggleActionDone(id) {
        const it = actionItems.find(a => a.id === id);
        if (!it) return;
        const done = it.status !== 'done';
        it.status = done ? 'done' : 'open';
        it.completedAt = done ? todayStrLocal() : '';
        sendToSheet({ action: 'updateAction', ...it });
        renderActionList();
        updateActionBadge();
        syncAfterWrites();
    }

    function editActionItem(id) {
        const it = actionItems.find(a => a.id === id);
        if (it) toggleActionForm(true, it);
    }

    function deleteActionItem(id) {
        const it = actionItems.find(a => a.id === id);
        if (!it) return;
        if (!confirm(`'${it.title}' 항목을 삭제하시겠습니까?`)) return;
        actionItems = actionItems.filter(a => a.id !== id);
        sendToSheet({ action: 'deleteAction', id });
        renderActionList();
        updateActionBadge();
        syncAfterWrites();
    }

    // ---------- 목록 렌더링 ----------
    function filteredActions() {
        const me = getCurrentUsername();
        let list = actionItems.slice();
        if (actionTab === 'mine') list = list.filter(a => a.assignee === me && a.status !== 'done');
        else if (actionTab === 'sent') list = list.filter(a => a.assigner === me && a.status !== 'done');
        else if (actionTab === 'all') list = list.filter(a => a.status !== 'done');
        else list = list.filter(a => a.status === 'done');

        const pOrder = { high: 0, normal: 1, low: 2 };
        if (actionTab === 'done') {
            list.sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));
        } else {
            // 기한 지남 → 기한 임박 → 기한 없음, 같은 조건이면 중요도 순
            list.sort((a, b) => {
                const ad = a.dueDate || '9999-99-99', bd = b.dueDate || '9999-99-99';
                if (ad !== bd) return ad.localeCompare(bd);
                return (pOrder[a.priority] ?? 1) - (pOrder[b.priority] ?? 1);
            });
        }
        return list;
    }

    function dueLabel(a) {
        if (a.status === 'done') return { text: a.completedAt ? `${a.completedAt} 완료` : '완료', cls: 'text-green-600 dark:text-green-400' };
        if (!a.dueDate) return { text: '기한 없음', cls: 'opacity-60' };
        const diff = Math.round((toDateObj(a.dueDate) - toDateObj(todayStrLocal())) / 86400000);
        if (diff < 0) return { text: `${Math.abs(diff)}일 지남 (${a.dueDate.slice(5)})`, cls: 'text-red-600 dark:text-red-400 font-black' };
        if (diff === 0) return { text: `오늘 마감`, cls: 'text-orange-600 dark:text-orange-400 font-black' };
        if (diff <= 2) return { text: `D-${diff} (${a.dueDate.slice(5)})`, cls: 'text-orange-600 dark:text-orange-400' };
        return { text: `D-${diff} (${a.dueDate.slice(5)})`, cls: '' };
    }

    const PRIORITY_META = {
        high: { label: '높음', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
        normal: { label: '보통', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
        low: { label: '낮음', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' }
    };

    function renderActionList() {
        const box = document.getElementById('action-list');
        const sub = document.getElementById('action-subtitle');
        const me = getCurrentUsername();

        const mine = myOpenActions();
        const over = mine.filter(isOverdue).length;
        sub.innerHTML = `${escHtml(me)} · 내 할 일 <b class="text-text-main">${mine.length}</b>건`
            + (over > 0 ? ` <span class="text-red-600 dark:text-red-400 font-black">· 기한 초과 ${over}건</span>` : '');

        if (!actionBackendReady) {
            box.innerHTML = `<div class="text-center py-10 px-4">
                <span class="material-symbols-outlined text-[40px] text-orange-400">cloud_off</span>
                <p class="text-sm font-bold text-text-main mt-2">Apps Script 업데이트가 필요합니다</p>
                <p class="text-xs text-text-muted mt-1.5 leading-relaxed">Action List는 시트에 <b>ActionDB</b> 저장 공간이 필요합니다.<br>함께 제공된 Apps Script 코드로 교체 후<br>[배포 → 새 버전으로 배포]를 진행해주세요.</p>
            </div>`;
            return;
        }

        const list = filteredActions();
        if (list.length === 0) {
            const msg = { mine: '내게 할당된 업무가 없습니다 👍', sent: '내가 지시한 업무가 없습니다.', all: '진행 중인 업무가 없습니다 👍', done: '완료된 업무가 없습니다.' }[actionTab];
            box.innerHTML = `<div class="text-center py-12 text-xs text-text-muted font-bold">${msg}</div>`;
            return;
        }

        box.innerHTML = list.map(a => {
            const p = PRIORITY_META[a.priority] || PRIORITY_META.normal;
            const due = dueLabel(a);
            const done = a.status === 'done';
            const canEdit = a.assigner === me || a.assignee === me;
            return `
            <div class="act-card act-p-${a.priority || 'normal'} ${isOverdue(a) ? 'act-overdue' : ''} ${done ? 'act-done' : ''}">
                <div class="flex items-start gap-2.5">
                    <input type="checkbox" class="act-check" ${done ? 'checked' : ''} onchange="toggleActionDone('${a.id}')" title="${done ? '미완료로 되돌리기' : '완료 처리'}">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-start justify-between gap-2">
                            <div class="act-title">${escHtml(a.title)}</div>
                            <span class="act-chip ${p.cls}">${p.label}</span>
                        </div>
                        ${a.detail ? `<div class="act-detail">${escHtml(a.detail)}</div>` : ''}
                        <div class="flex items-center justify-between gap-2 mt-2">
                            <div class="act-meta flex items-center gap-1 flex-wrap">
                                <span class="material-symbols-outlined text-[13px]">person</span>${escHtml(a.assignee)}
                                <span class="opacity-40">←</span>${escHtml(a.assigner || '?')}
                            </div>
                            <div class="flex items-center gap-1 flex-shrink-0">
                                <span class="act-meta ${due.cls}">${due.text}</span>
                                ${canEdit ? `
                                <button onclick="editActionItem('${a.id}')" class="text-text-muted hover:text-primary p-0.5" title="수정"><span class="material-symbols-outlined text-[15px]">edit</span></button>
                                <button onclick="deleteActionItem('${a.id}')" class="text-text-muted hover:text-red-500 p-0.5" title="삭제"><span class="material-symbols-outlined text-[15px]">delete</span></button>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
    }
    // ===========================
