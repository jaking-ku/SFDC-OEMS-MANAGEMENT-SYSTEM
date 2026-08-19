// ===== 🔗 연속 일정 그룹 관리 =====
    // 같은 일정에서 파생된 날짜들은 id를 "<그룹키>__<날짜>" 형태로 만들어 하나로 묶는다.
    // (구글 시트 컬럼 추가 없이 그룹을 표현하므로 Apps Script 수정 불필요)
    function groupKeyOf(id) { return String(id || '').split('__')[0]; }

    function isDayDate(d) {
        d = String(d || '');
        return d && !d.startsWith('note-') && !d.startsWith('config-');
    }

    // 같은 그룹에 속한 '날짜형' 일정들 (비고 일정 제외)
    function getGroupDayEvents(id) {
        const k = groupKeyOf(id);
        return cachedEvents
            .filter(e => groupKeyOf(e.id) === k && isDayDate(e.date))
            .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    }

    function toDateObj(str) {
        const p = String(str).split('-').map(Number);
        return new Date(p[0], p[1] - 1, p[2]);
    }
    function toDateStr(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    function dateRangeList(startStr, endStr) {
        const out = [];
        const end = toDateObj(endStr);
        for (let d = toDateObj(startStr); d <= end; d.setDate(d.getDate() + 1)) out.push(toDateStr(d));
        return out;
    }
    function isNextDay(prevStr, nextStr) {
        const d = toDateObj(prevStr);
        d.setDate(d.getDate() + 1);
        return toDateStr(d) === nextStr;
    }

    // 🖥️ 화면만 다시 그리기 (네트워크 요청 없음 - 이미 받아온 cachedEvents 사용)
    function renderCalendarUI() {
        document.getElementById('month-title').innerText = `${currentYear}년 ${currentMonth}월`;
        generateCalendarPC();
        generateCalendarMobile();
        renderEventsToPC();
        updateAlarmBadge();
    }

    // ===== ➡️ PC 캘린더 일정 배치 (연속 일정은 하나의 긴 막대로) =====
    const SPAN_LANE_H = 34;   // 막대 높이(px)
    const SPAN_LANE_GAP = 4;  // 막대 사이 간격(px)

    function findCell(dateStr, line) {
        return document.querySelector(`#calendar-pc-container [data-date="${dateStr}"][data-line="${line}"]`);
    }

    function renderEventsToPC() {
        // 0) 기존 카드/자리표시자 제거
        document.querySelectorAll('#calendar-pc-container .event-card, #calendar-pc-container .span-area').forEach(el => el.remove());
        document.querySelectorAll('#calendar-pc-container .grid-cell.has-span').forEach(el => el.classList.remove('has-span'));

        // 1) 그룹키로 묶기
        const groups = new Map();
        cachedEvents.forEach(ev => {
            const d = String(ev.date || '');
            if (!d || d.startsWith('config-')) return;
            const k = groupKeyOf(ev.id);
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(ev);
        });

        const singles = [];   // 하루짜리 → 기존 카드 그대로
        const runs = [];      // 연속 구간 → 막대 { line, events[] }

        groups.forEach(list => {
            list.filter(e => !isDayDate(e.date)).forEach(e => singles.push(e)); // 비고 일정
            const days = list.filter(e => isDayDate(e.date));
            if (days.length === 0) return;
            if (days.length === 1) { singles.push(days[0]); return; }

            // 드래그로 라인이 갈라졌을 수 있으므로 라인별로 나눈 뒤, 날짜가 연속된 구간만 막대로 처리
            const byLine = {};
            days.forEach(ev => { (byLine[ev.line] = byLine[ev.line] || []).push(ev); });
            Object.keys(byLine).forEach(line => {
                const arr = byLine[line].sort((a, b) => String(a.date).localeCompare(String(b.date)));
                let run = [arr[0]];
                for (let i = 1; i < arr.length; i++) {
                    if (isNextDay(arr[i - 1].date, arr[i].date)) run.push(arr[i]);
                    else { (run.length > 1 ? runs : singles).push(run.length > 1 ? { line, events: run } : run[0]); run = [arr[i]]; }
                }
                (run.length > 1 ? runs : singles).push(run.length > 1 ? { line, events: run } : run[0]);
            });
        });

        // 2) 연속 구간을 '같은 주(week) 그리드' 단위로 잘라 배치 정보 생성
        const placements = [];
        runs.forEach(run => {
            let seg = null;
            run.events.forEach(ev => {
                const cell = findCell(ev.date, run.line);
                if (!cell) { seg = null; return; } // 이번 달 화면에 없는 날짜
                if (seg && seg.grid === cell.parentElement && isNextDay(seg.endDate, ev.date)) {
                    seg.count++; seg.endDate = ev.date;
                } else {
                    seg = { grid: cell.parentElement, line: run.line, startCell: cell, count: 1,
                            startDate: ev.date, endDate: ev.date, ev: run.events[0], run };
                    placements.push(seg);
                }
            });
        });

        // 3) 같은 (주 × 라인) 안에서 막대가 겹치지 않도록 위아래 층(lane) 배정
        const laneMap = new Map(); // grid → (line → [각 lane의 마지막 종료일])
        placements.sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
        placements.forEach(p => {
            if (!laneMap.has(p.grid)) laneMap.set(p.grid, new Map());
            const lines = laneMap.get(p.grid);
            if (!lines.has(p.line)) lines.set(p.line, []);
            const lanes = lines.get(p.line);
            let lane = lanes.findIndex(endDate => endDate < p.startDate);
            if (lane === -1) { lane = lanes.length; lanes.push(p.endDate); }
            else lanes[lane] = p.endDate;
            p.lane = lane;
        });

        // 4) 막대가 놓인 (주 × 라인) 행의 모든 날짜 칸에 동일한 높이의 자리표시자를 넣어
        //    아래쪽 일반 카드들이 막대에 가리지 않도록 공간을 확보
        laneMap.forEach((lines, grid) => {
            lines.forEach((lanes, line) => {
                const h = lanes.length * (SPAN_LANE_H + SPAN_LANE_GAP);
                grid.querySelectorAll(`.grid-cell[data-line="${line}"]`).forEach(cell => {
                    const d = cell.dataset.date || '';
                    if (!isDayDate(d)) return; // 비고 칸은 제외
                    const area = document.createElement('div');
                    area.className = 'span-area';
                    area.style.height = h + 'px';
                    cell.insertBefore(area, cell.firstChild);
                });
            });
        });

        // 5) 하루짜리/비고 일정은 기존 방식으로 카드 렌더링 (자리표시자 아래에 쌓임)
        singles.forEach(ev => appendCardToPC(ev));

        // 6) 연속 막대 렌더링
        placements.forEach(p => appendSpanBar(p));
    }

    function appendSpanBar(p) {
        const ev = p.ev;
        const cell = p.startCell;
        cell.classList.add('has-span');

        const isVac = p.line === '🏖️ 휴가자' || ev.isVacation === 'true' || ev.isVacation === true;
        const bar = document.createElement('div');
        bar.className = `event-card span-card ${isVac ? 'vacation' : (ev.category || 'cat-normal')}`;
        bar.dataset.id = ev.id;

        const isFirst = p.startDate === p.run.events[0].date;
        const isLast = p.endDate === p.run.events[p.run.events.length - 1].date;
        if (!isFirst) bar.classList.add('span-cont-left');
        if (!isLast) bar.classList.add('span-cont-right');

        // 칸 너비 100% × N + 칸 사이 여백(1px) − 좌우 안쪽 여백(12px)
        bar.style.width = `calc(${p.count}00% + ${(p.count - 1) - 12}px)`;
        bar.style.left = '6px';
        bar.style.top = (6 + p.lane * (SPAN_LANE_H + SPAN_LANE_GAP)) + 'px';
        bar.style.height = SPAN_LANE_H + 'px';

        const totalDays = p.run.events.length;
        const alarmIcon = (ev.alarmOn === true || ev.alarmOn === 'true')
            ? '<span class="material-symbols-outlined text-[12px] align-middle mr-0.5">notifications</span>' : '';
        const sub = [ev.worker || '', `${totalDays}일`].filter(Boolean).join(' · ');
        bar.title = `${ev.title}\n${p.run.events[0].date} ~ ${p.run.events[totalDays - 1].date} (${totalDays}일)${ev.worker ? '\n작업자: ' + ev.worker : ''}`;

        bar.innerHTML = `
            <div class="span-title">${!isFirst ? '◀ ' : ''}${alarmIcon}${escHtml(ev.title)}${!isLast ? ' ▶' : ''}</div>
            ${sub ? `<div class="span-sub">${escHtml(sub)}</div>` : ''}
            <span class="material-symbols-outlined delete-btn text-[16px]" onclick="deleteEvent(event, this)">close</span>
        `;
        bar.onclick = (e) => { e.stopPropagation(); openEditModal(ev.id); };
        cell.appendChild(bar);
    }

    // ☁️ 데이터 로딩 및 동기화 (서버에서 새로 받아올 때만 호출)
    async function loadEventsFromSheet() {
        // 저장 요청이 남아 있으면 읽지 않는다 (반쯤 반영된 상태를 화면에 덮어쓰는 것을 방지)
        if (pendingWrites > 0) return;

        setSyncBadge('<span class="material-symbols-outlined text-[13px] animate-spin">sync</span> 동기화 중...');

        try {
            const url = SCRIPT_URL + "?t=" + new Date().getTime();
            const res = await fetch(url, { method: "POST", cache: "no-store", body: JSON.stringify({ action: 'read' }) });
            cachedEvents = extractTeamConfig(await res.json());

            renderCalendarUI();

            const t = new Date();
            const hhmm = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
            setSyncBadge(`<span class="material-symbols-outlined text-[13px] text-green-500">cloud_done</span> 자동 sync: ${hhmm}`);
            loadActions();   // Action List 함께 동기화
        } catch (e) { 
            setSyncBadge('<span class="material-symbols-outlined text-[13px] text-red-500">cloud_off</span> 연결 실패');
            console.error(e);
        }
    }

    // 카드 화면에 그리기 (글자 줄바꿈 적용)
    function appendCardToPC(ev) {
        const target = document.querySelector(`#calendar-pc-container [data-date="${ev.date}"][data-line="${ev.line}"]`);
        if (target) {
            const card = document.createElement('div');
            const isVac = ev.line === '🏖️ 휴가자' || ev.isVacation === 'true' || ev.isVacation === true;
            card.className = `event-card ${isVac ? 'vacation' : (ev.category || 'cat-normal')}`;
            card.dataset.id = ev.id;
            card.dataset.catClass = ev.category || 'cat-normal';
            
            card.onclick = (e) => { e.stopPropagation(); openEditModal(ev.id); };
            card.innerHTML = `
                <div class="break-words whitespace-pre-wrap pr-5 leading-snug">${(ev.alarmOn === true || ev.alarmOn === 'true') ? '<span class="material-symbols-outlined text-[12px] align-middle mr-0.5">notifications</span>' : ''}${escHtml(ev.title)}</div>
                ${ev.worker ? `<div class="text-[10px] opacity-70 mt-1">${escHtml(ev.worker)}</div>` : ''}
                ${ev.registeredBy ? `<div class="text-[10px] opacity-50 mt-0.5 flex items-center gap-0.5"><span class="material-symbols-outlined text-[10px]">edit</span>${escHtml(ev.registeredBy)}</div>` : ''}
                <span class="material-symbols-outlined delete-btn text-[16px]" onclick="deleteEvent(event, this)">close</span>
            `;
            target.appendChild(card);
        }
    }

    // 📱 모바일 상세 뷰
    function openMobileDayView(dateStr, isNotes = false) {
        const titleEl = document.getElementById('mobile-day-title');
        const container = document.getElementById('mobile-day-events');
        const addBtn = document.getElementById('mobile-add-btn');
        const holBtn = document.getElementById('mobile-holiday-btn');
        
        if (isNotes) {
            const wNum = dateStr.includes('-W') ? dateStr.split('-W')[1] : '';
            titleEl.innerText = `${currentMonth}월 ${wNum ? wNum + '주차 ' : ''}비고 일정`;
            addBtn.onclick = () => { closeMobileDayView(); openModal(dateStr); };
            holBtn.classList.add('hidden');
        } else {
            const d = toDateObj(dateStr);
            const holMark = isHoliday(dateStr) ? ' 🇰🇷' : '';
            titleEl.innerText = `${d.getMonth()+1}월 ${d.getDate()}일 일정${holMark}`;
            addBtn.onclick = () => { closeMobileDayView(); openModal(dateStr); };
            // 연휴 설정/해제 버튼
            holBtn.classList.remove('hidden');
            document.getElementById('mobile-holiday-btn-label').innerText = isHoliday(dateStr) ? '연휴 해제' : '연휴 설정';
            holBtn.onclick = () => { closeMobileDayView(); openHolidayModal(dateStr); };
        }

        container.innerHTML = '';
        let dayEvents = isNotes 
            ? (dateStr.includes('-W') ? cachedEvents.filter(ev => ev.date === dateStr) : cachedEvents.filter(ev => ev.date.startsWith(`note-${currentYear}-${currentMonth}`)))
            : cachedEvents.filter(ev => ev.date === dateStr);

        if(dayEvents.length === 0) {
            container.innerHTML = '<div class="text-center text-text-muted py-10 text-sm">등록된 일정이 없습니다.</div>';
        } else {
            dayEvents.forEach(ev => {
                const isVac = ev.line === '🏖️ 휴가자' || ev.isVacation === 'true' || ev.isVacation === true;
                const catBorder = isVac ? 'border-blue-500 bg-blue-50/50' : (ev.category === 'cat-pm' ? 'border-emerald-500 bg-emerald-50/50' : (ev.category === 'cat-urgent' ? 'border-amber-500 bg-amber-50/50' : (ev.category === 'cat-setup' ? 'border-purple-500 bg-purple-50/50' : 'border-red-600 bg-red-50/50')));
                const textColor = isVac ? 'text-blue-700' : (ev.category === 'cat-pm' ? 'text-emerald-700' : (ev.category === 'cat-urgent' ? 'text-amber-700' : (ev.category === 'cat-setup' ? 'text-purple-700' : 'text-red-700')));
                
                const grp = isDayDate(ev.date) ? getGroupDayEvents(ev.id) : [];
                const spanBadge = grp.length > 1
                    ? `<span class="text-[10px] font-bold text-orange-600 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/30 px-1.5 py-0.5 rounded ml-1">${escHtml(grp[0].date.slice(5))} ~ ${escHtml(grp[grp.length-1].date.slice(5))} (${grp.length}일)</span>`
                    : '';

                container.innerHTML += `
                    <div class="relative border-l-4 ${catBorder} dark:bg-gray-800 p-3 mb-2 rounded-r-lg shadow-sm cursor-pointer active:opacity-70" onclick="closeMobileDayView(); openEditModal('${escHtml(ev.id)}')" data-id="${escHtml(ev.id)}">
                        <div class="flex justify-between items-start mb-1 pr-8">
                            <span class="text-xs font-bold text-text-muted bg-background px-2 py-0.5 rounded border border-border">${escHtml(ev.line)}${spanBadge}</span>
                            ${isNotes && ev.date.includes('-W') ? `<span class="text-[10px] text-text-muted">${escHtml(ev.date.split('-W')[1])}주차</span>` : ''}
                        </div>
                        <div class="text-sm font-bold ${textColor} dark:text-gray-100 mb-1 pr-8">${escHtml(ev.title)}</div>
                        ${ev.worker ? `<div class="text-[10px] text-gray-500 flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">person</span>${escHtml(ev.worker)}</div>` : ''}
                        ${ev.registeredBy ? `<div class="text-[10px] text-gray-400 flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">edit</span>등록: ${escHtml(ev.registeredBy)}</div>` : ''}
                        
                        <button type="button" class="absolute top-2.5 right-2.5 text-text-muted hover:text-red-500 bg-surface/80 border border-border rounded p-1.5 flex items-center justify-center shadow-sm backdrop-blur-sm z-10" onclick="deleteEvent(event, this)">
                            <span class="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                    </div>`;
            });
        }
        document.getElementById('mobile-day-modal').classList.remove('hidden');
    }

    function closeMobileDayView() { document.getElementById('mobile-day-modal').classList.add('hidden'); }

    // 🔔 분류가 Setup일 때만 알림 체크박스 노출
    function toggleAlarmWrapper() {
        const cat = document.getElementById('modal-category').value;
        const wrapper = document.getElementById('modal-alarm-wrapper');
        if (cat === 'cat-setup') {
            wrapper.classList.remove('hidden');
        } else {
            wrapper.classList.add('hidden');
            document.getElementById('modal-alarm-checkbox').checked = false;
        }
    }

    // 📝 팝업창 열기/닫기
    function openModal(dateStr = '', lineStr = lines[0]) {
        document.getElementById('modal-event-id').value = '';
        document.getElementById('modal-title').value = '';
        document.getElementById('modal-worker').value = '';
        document.getElementById('modal-registered-by').value = getCurrentUsername();
        document.getElementById('modal-line').value = lineStr;
        document.getElementById('modal-category').value = 'cat-normal';
        document.getElementById('modal-alarm-checkbox').checked = false;
        toggleAlarmWrapper();
        selectedTags = [];
        renderTagPicks();
        clearTagAutoNotice();
        document.getElementById('modal-header-title').innerHTML = `<span class="material-symbols-outlined text-primary">work</span> 새 일정 추가`;
        
        if (dateStr.startsWith('note-')) {
            document.getElementById('modal-date-wrapper').classList.add('hidden');
            document.getElementById('modal-note-msg').classList.remove('hidden');
            document.getElementById('modal-note-id').value = dateStr;
        } else {
            document.getElementById('modal-date-wrapper').classList.remove('hidden');
            document.getElementById('modal-note-msg').classList.add('hidden');
            document.getElementById('modal-note-id').value = '';
            const defDate = dateStr || `${todayObj.getFullYear()}-${String(todayObj.getMonth()+1).padStart(2,'0')}-${String(todayObj.getDate()).padStart(2,'0')}`;
            document.getElementById('modal-start-date').value = defDate;
            document.getElementById('modal-end-date').value = defDate;
        }
        renderWorkerChecklist();
        document.getElementById('event-modal').classList.remove('hidden');
    }

    function openEditModal(id) {
        const ev = cachedEvents.find(e => e.id === id);
        if (!ev) return;
        document.getElementById('modal-event-id').value = ev.id;
        document.getElementById('modal-title').value = ev.title;
        document.getElementById('modal-worker').value = ev.worker || '';
        document.getElementById('modal-registered-by').value = ev.registeredBy || '(기록 없음)';
        
        // 라인 select 옵션을 순회하여 정확히 일치하는 값 선택 (자동으로 휴가자 탭으로 이동되는 버그 수정)
        const lineSelect = document.getElementById('modal-line');
        let lineMatched = false;
        for (let i = 0; i < lineSelect.options.length; i++) {
            if (lineSelect.options[i].value === ev.line) {
                lineSelect.selectedIndex = i;
                lineMatched = true;
                break;
            }
        }
        if (!lineMatched) lineSelect.value = ev.line;
        
        document.getElementById('modal-category').value = ev.category || 'cat-normal';
        document.getElementById('modal-alarm-checkbox').checked = ev.alarmOn === true || ev.alarmOn === 'true';
        toggleAlarmWrapper();
        selectedTags = parseTagString(ev.workTags);
        renderTagPicks();
        clearTagAutoNotice();
        document.getElementById('modal-header-title').innerHTML = `<span class="material-symbols-outlined text-blue-500">edit</span> 일정 수정`;
        
        if (ev.date.startsWith('note-')) {
            document.getElementById('modal-date-wrapper').classList.add('hidden');
            document.getElementById('modal-note-msg').classList.remove('hidden');
            document.getElementById('modal-note-id').value = ev.date;
        } else {
            document.getElementById('modal-date-wrapper').classList.remove('hidden');
            document.getElementById('modal-note-msg').classList.add('hidden');
            document.getElementById('modal-note-id').value = '';
            // 연속 일정이면 그룹 전체의 시작일~마감일을 불러온다 (마감일 수정이 반영되지 않던 문제 해결)
            const group = getGroupDayEvents(ev.id);
            const startStr = group.length ? group[0].date : ev.date;
            const endStr = group.length ? group[group.length - 1].date : ev.date;
            document.getElementById('modal-start-date').value = startStr;
            document.getElementById('modal-end-date').value = endStr;
        }
        renderWorkerChecklist();
        document.getElementById('event-modal').classList.remove('hidden');
    }

    function closeModal() { document.getElementById('event-modal').classList.add('hidden'); }

    // 🚀 저장 및 즉시 반영 기능 (Optimistic UI)
    function saveEventFromModal() {
        const id = document.getElementById('modal-event-id').value;
        const title = document.getElementById('modal-title').value.trim();
        const worker = document.getElementById('modal-worker').value.trim();
        const registeredBy = document.getElementById('modal-registered-by').value.trim();
        const line = document.getElementById('modal-line').value;
        const category = document.getElementById('modal-category').value;
        const alarmOn = category === 'cat-setup' && document.getElementById('modal-alarm-checkbox').checked;
        const noteId = document.getElementById('modal-note-id').value;
        
        if (!title) return alert("제목을 입력하세요.");
        closeModal(); 

        const isVacation = line === '🏖️ 휴가자';
        const workTags = selectedTags.join(',');

        if (id) {
            if (noteId) {
                // 비고 일정: 기간 개념이 없으므로 해당 건만 수정
                const evIndex = cachedEvents.findIndex(e => e.id === id);
                if (evIndex > -1) cachedEvents[evIndex] = { ...cachedEvents[evIndex], date: noteId, line, title, worker, category, isVacation, alarmOn, workTags };
                sendToSheet({ action: 'update', id, date: noteId, line, title, worker, registeredBy, category, isVacation, alarmOn, workTags });
            } else {
                // 📌 그룹 단위 수정: 기간이 늘면 날짜 추가, 줄면 삭제, 나머지는 내용 갱신
                const startStr = document.getElementById('modal-start-date').value;
                let endStr = document.getElementById('modal-end-date').value || startStr;
                if (endStr < startStr) endStr = startStr;

                const desired = dateRangeList(startStr, endStr);
                const gKey = groupKeyOf(id);
                const groupEvents = getGroupDayEvents(id);
                const byDate = {};
                groupEvents.forEach(e => { byDate[e.date] = e; });

                // (1) 범위에서 빠진 날짜 삭제
                groupEvents.forEach(e => {
                    if (!desired.includes(e.date)) {
                        sendToSheet({ action: 'delete', id: e.id });
                        cachedEvents = cachedEvents.filter(x => x.id !== e.id);
                    }
                });

                // (2) 기존 날짜는 갱신, 새 날짜는 같은 그룹키로 추가
                desired.forEach(dStr => {
                    const ex = byDate[dStr];
                    if (ex) {
                        Object.assign(ex, { date: dStr, line, title, worker, category, isVacation, alarmOn, workTags });
                        sendToSheet({ action: 'update', id: ex.id, date: dStr, line, title, worker, registeredBy, category, isVacation, alarmOn, workTags });
                    } else {
                        const newEv = { id: `${gKey}__${dStr}`, date: dStr, line, title, worker, registeredBy, category, isVacation, alarmOn, workTags };
                        cachedEvents.push(newEv);
                        sendToSheet({ action: 'add', ...newEv });
                    }
                });
            }
        } else {
            if (noteId) {
                const newId = 'EVT_' + Date.now();
                const newEv = { id: newId, date: noteId, line, title, worker, registeredBy, category, isVacation, alarmOn, workTags };
                cachedEvents.push(newEv);
                sendToSheet({ action: 'add', ...newEv });
            } else {
                const startStr = document.getElementById('modal-start-date').value;
                let endStr = document.getElementById('modal-end-date').value || startStr;
                if (endStr < startStr) endStr = startStr;

                // 하나의 그룹키를 공유하도록 id 생성 → 이후 수정 시 기간 변경이 정상 반영됨
                const gKey = 'EVT_' + Date.now() + Math.floor(Math.random() * 1000);
                dateRangeList(startStr, endStr).forEach(dStr => {
                    const newEv = { id: `${gKey}__${dStr}`, date: dStr, line, title, worker, registeredBy, category, isVacation, alarmOn, workTags };
                    cachedEvents.push(newEv);
                    sendToSheet({ action: 'add', ...newEv });
                });
            }
        }

        // 로컬 데이터로 즉시 화면 다시 그리기
        renderCalendarUI();

        // 2초 뒤 조용히 동기화
        syncAfterWrites();
    }

    // 🚀 삭제 및 즉시 반영
    function deleteEvent(e, btn) { 
        e.stopPropagation(); 
        const host = btn.closest('[data-id]');
        const id = host && host.dataset.id;
        if (!id) return;

        const target = cachedEvents.find(ev => ev.id === id);
        const group = (target && isDayDate(target.date)) ? getGroupDayEvents(id) : [];
        const isMulti = group.length > 1;

        const msg = isMulti
            ? `연속 일정입니다. ${group[0].date} ~ ${group[group.length - 1].date} (${group.length}일) 전체를 삭제하시겠습니까?`
            : '삭제하시겠습니까?';
        if (!confirm(msg)) return;

        const ids = isMulti ? group.map(x => x.id) : [id];
        // 한 건씩 순서대로 전송 (sendToSheet 내부 큐가 순서를 보장)
        ids.forEach(i => sendToSheet({ action: 'delete', id: i }));
        cachedEvents = cachedEvents.filter(ev => !ids.includes(ev.id));

        renderCalendarUI();
        syncAfterWrites();
    }

    function changeMonth(d) { 
        currentMonth += d; 
        if(currentMonth>12){currentMonth=1; currentYear++;} 
        if(currentMonth<1){currentMonth=12; currentYear--;} 
        renderCalendarUI(); // 이미 로드된 데이터로 즉시 렌더링 (서버 재요청 없음)
    }
    
    function toggleDarkMode() {
        document.documentElement.classList.toggle('dark');
        // 대시보드가 열려 있으면 차트 색상(축/텍스트)을 새 테마에 맞게 다시 그린다
        if (!document.getElementById('dashboard-modal').classList.contains('hidden')) renderDashboard();
    }

    function downloadCSV() {
        if (cachedEvents.length === 0) return alert("다운로드할 데이터가 없습니다.");
        const headers = ["ID", "날짜", "라인", "제목", "휴가여부", "카테고리", "작업자", "등록자", "작업유형태그", "알림설정"];
        
        function toCsvCell(val) {
            const str = String(val == null ? '' : val);
            if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        }

        const csvContent = [
            headers.map(toCsvCell).join(","), 
            ...cachedEvents.map(ev => [
                toCsvCell(ev.id), 
                toCsvCell(ev.date), 
                toCsvCell(ev.line), 
                toCsvCell(ev.title), 
                toCsvCell(ev.isVacation), 
                toCsvCell(ev.category), 
                toCsvCell(ev.worker || ''), 
                toCsvCell(ev.registeredBy || ''),
                toCsvCell(ev.workTags || ''),
                toCsvCell((ev.alarmOn === true || ev.alarmOn === 'true') ? 'ON' : 'OFF')
            ].join(","))
        ].join("\n");

        const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", `ScheduleDB_${toDateStr(new Date())}.csv`);
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }

    // ===== 🏷️ 작업유형 태그 =====
    // 제목(title)은 자유 텍스트로 그대로 두고, 통계 집계는 이 구조화된 태그로 처리한다.
    // 한 일정에 여러 작업(PM + 부품교체 + Cleaning 등)이 섞여도 태그를 여러 개 선택하면 된다.
    const TAG_META = {
        PM:      { label: 'PM',        color: '#16a34a' },
        SETUP:   { label: 'Setup',     color: '#9333ea' },
        PARTS:   { label: '부품교체',   color: '#2563eb' },
        CHECK:   { label: '점검',      color: '#0891b2' },
        MOVE:    { label: '반입/반출', color: '#65a30d' },
        ETC:     { label: '기타',      color: '#6b7280' },
        BM:      { label: 'Trouble/BM', color: '#dc2626' }
    };
    // 부모 태그를 체크하면 관련 세부 분류 칩이 추가로 펼쳐진다 (다중 선택)
    const SUB_TAG_GROUPS = {
        BM: {
            title: '🔧 Trouble/BM 증상 세부 분류',
            colors: ['#dc2626', '#ea580c', '#d97706', '#65a30d', '#0891b2', '#7c3aed', '#db2777', '#0284c7', '#16a34a', '#94a3b8'],
            subs: {
                BM_ALIGN:    'Align/Focus',
                BM_STAGE:    'Stage',
                BM_ROBOT:    'Robot',
                BM_PORT:     'Port',
                BM_TDI:      'TDI',
                BM_MOTOR:    'Motor',
                BM_SW:       'Software',
                BM_REVOLVER: 'Revolver',
                BM_LASER:    'Laser',
                BM_ETC:      '기타'
            }
        },
        PARTS: {
            title: '🔩 부품교체 세부 분류',
            colors: ['#2563eb', '#0891b2', '#7c3aed', '#db2777', '#65a30d', '#f59e0b'],
            subs: {
                PARTS_SCALEHEAD: 'Scale Head',
                PARTS_REVOLVER:  'Revolver',
                PARTS_TDI:       'TDI',
                PARTS_LASER:     'Laser',
                PARTS_CYLINDER:  'Cylinder',
                PARTS_BOARD:     'Board'
            }
        }
    };
    const MAIN_TAG_ORDER = ['PM', 'SETUP', 'PARTS', 'CHECK', 'MOVE', 'ETC', 'BM'];
    let selectedTags = [];   // 현재 모달에서 선택 중인 태그 배열 (메인 + 세부)

    function parseTagString(s) { return String(s || '').split(',').map(t => t.trim()).filter(Boolean); }

    function renderTagPicks() {
        const mainWrap = document.getElementById('tag-picks-main');
        const subContainer = document.getElementById('tag-sub-groups');

        mainWrap.innerHTML = MAIN_TAG_ORDER.map(code => {
            const meta = TAG_META[code];
            const on = selectedTags.includes(code);
            const bmCls = code === 'BM' ? 'bm-pick' : '';
            return `<button type="button" class="tag-pick ${bmCls} ${on ? 'on' : ''}" style="${on && code !== 'BM' ? `background:${meta.color}` : ''}" onclick="toggleTag('${code}')">${meta.label}</button>`;
        }).join('');

        // 선택된 부모 태그 중 세부 분류가 있는 것만 순서대로 펼쳐 보여준다
        subContainer.innerHTML = Object.keys(SUB_TAG_GROUPS).filter(p => selectedTags.includes(p)).map(parent => {
            const g = SUB_TAG_GROUPS[parent];
            const chips = Object.entries(g.subs).map(([code, label]) => {
                const on = selectedTags.includes(code);
                return `<button type="button" class="tag-pick bm-pick ${on ? 'on' : ''}" onclick="toggleTag('${code}')">${label}</button>`;
            }).join('');
            return `<div class="mt-2 pt-2 border-t border-dashed border-border">
                <div class="text-[10.5px] font-bold text-text-muted mb-1.5">${g.title} (다중 선택)</div>
                <div class="flex flex-wrap gap-1.5">${chips}</div>
            </div>`;
        }).join('');
    }

    function toggleTag(code) {
        if (selectedTags.includes(code)) {
            selectedTags = selectedTags.filter(t => t !== code);
            // 부모 태그를 해제하면 그에 딸린 세부 태그도 함께 제거
            if (SUB_TAG_GROUPS[code]) {
                const subCodes = Object.keys(SUB_TAG_GROUPS[code].subs);
                selectedTags = selectedTags.filter(t => !subCodes.includes(t));
            }
        } else {
            selectedTags.push(code);
        }
        renderTagPicks();
    }

    function clearTagAutoNotice() { document.getElementById('tag-auto-notice').classList.add('hidden'); }

    // 제목 텍스트를 키워드로 분석해 태그를 추천 (완전 자동은 아니고 확인 후 저장하는 보조 기능)
    function classifyTitleToTags(title) {
        const t = String(title || '');
        const tags = [];
        // ⚠️ \b는 밑줄(_)을 단어문자로 취급해 "DI46_MDI4211_PM" 같은 표기를 놓치므로 직접 경계를 검사한다
        if (/(^|[^A-Za-z])PM([^A-Za-z]|$)/i.test(t)) tags.push('PM');
        if (/(셋업|셋-업|set[- ]?up|턴온|turn[- ]?on|신규\s*설비|인증|헬스\s*체크|설치|업그레이드|upgrade)/i.test(t)) tags.push('SETUP');
        if (/(점검|teaching|loading position|interlock|matching|cleaning|focus|마킹)/i.test(t)) tags.push('CHECK');
        if (/(반입|반출)/.test(t)) tags.push('MOVE');

        // 부품교체 + 세부(어떤 부품인지)
        if (/교체/.test(t)) {
            tags.push('PARTS');
            if (/(scale\s*head|스케일\s*헤드)/i.test(t)) tags.push('PARTS_SCALEHEAD');
            if (/(revolver|리볼버)/i.test(t)) tags.push('PARTS_REVOLVER');
            if (/(^|[^A-Za-z])TDI([^A-Za-z]|$)/i.test(t)) tags.push('PARTS_TDI');
            if (/(laser|레이저)/i.test(t)) tags.push('PARTS_LASER');
            if (/(cylinder|실린더)/i.test(t)) tags.push('PARTS_CYLINDER');
            if (/(board|보드)/i.test(t)) tags.push('PARTS_BOARD');
        }

        // Trouble/BM + 세부(증상 부위)
        const isTrouble = /(error|fail|고장|불량|이슈|trouble|긴급)/i.test(t);
        if (isTrouble) {
            tags.push('BM');
            if (/(align|정렬|focus)/i.test(t)) tags.push('BM_ALIGN');
            if (/(^|[^A-Za-z])Stage([^A-Za-z]|$)/i.test(t)) tags.push('BM_STAGE');
            if (/(robot|로봇)/i.test(t)) tags.push('BM_ROBOT');
            if (/(port|포트)/i.test(t)) tags.push('BM_PORT');
            if (/(^|[^A-Za-z])TDI([^A-Za-z]|$)/i.test(t)) tags.push('BM_TDI');
            if (/(motor|모터)/i.test(t)) tags.push('BM_MOTOR');
            if (/(firmware|software|에러|error|코드)/i.test(t)) tags.push('BM_SW');
            if (/(revolver|리볼버)/i.test(t)) tags.push('BM_REVOLVER');
            if (/(laser|레이저)/i.test(t)) tags.push('BM_LASER');
            if (!tags.some(x => x.indexOf('BM_') === 0)) tags.push('BM_ETC');
        }
        if (tags.length === 0) tags.push('ETC');
        return [...new Set(tags)];
    }

    function autoSuggestTags() {
        const title = document.getElementById('modal-title').value;
        if (!title.trim()) return alert('먼저 작업 이름을 입력해주세요.');
        selectedTags = classifyTitleToTags(title);
        renderTagPicks();
        document.getElementById('tag-auto-notice').classList.remove('hidden');
    }
    // ===========================
