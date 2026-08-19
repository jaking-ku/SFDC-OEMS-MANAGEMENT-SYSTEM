// ===== ☁️ 시트 쓰기 요청 직렬화 (경쟁 상태 방지) =====
    // 여러 요청을 동시에 보내면 각 요청이 '같은 시점'의 시트를 읽어 행 번호를 계산하므로
    // 삭제·추가가 서로 밀려 일부만 반영되는 문제가 발생한다. → 반드시 한 건씩 순서대로 처리.
    let sheetQueue = Promise.resolve();
    let pendingWrites = 0;
    let syncTimer = null;

    function setSyncBadge(html) {
        document.querySelectorAll('.cloud-sync-badge').forEach(b => { b.innerHTML = html; });
    }

    function sendToSheet(payload) {
        if (!SCRIPT_URL.startsWith("https")) return Promise.resolve();

        pendingWrites++;
        setSyncBadge(`<span class="material-symbols-outlined text-[16px] animate-spin">sync</span> 저장 중 (${pendingWrites})`);

        sheetQueue = sheetQueue.then(async () => {
            try {
                const noCacheUrl = SCRIPT_URL + "?t=" + new Date().getTime();
                // ⚠️ await 필수: 응답을 받은 뒤에 다음 요청을 보내야 행 번호가 어긋나지 않음 (text/plain으로 CORS 프리플라이트 방지)
                const res = await fetch(noCacheUrl, { 
                    method: "POST", 
                    headers: { 'Content-Type': 'text/plain' },
                    cache: "no-store", 
                    body: JSON.stringify(payload) 
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
            } catch (e) {
                console.error('시트 저장 실패:', payload, e);
                setSyncBadge('<span class="material-symbols-outlined text-[13px] text-red-500">cloud_off</span> 저장 실패');
                showToast('구글 시트 저장에 실패했습니다. 네트워크 연결을 확인하세요.', 'error');
            } finally {
                pendingWrites--;
                if (pendingWrites > 0) {
                    setSyncBadge(`<span class="material-symbols-outlined text-[16px] animate-spin">sync</span> 저장 중 (${pendingWrites})`);
                }
            }
        });
        return sheetQueue;
    }

    // 대기 중인 쓰기가 모두 끝난 뒤에 한 번만 동기화 (중간에 읽으면 반쯤 지워진 상태를 보게 됨)
    function syncAfterWrites() {
        sheetQueue.then(() => {
            clearTimeout(syncTimer);
            syncTimer = setTimeout(loadEventsFromSheet, 400);
        });
    }

    // 💻 PC 렌더링 (가로 타임라인 & 버그 없는 드래그 앤 드롭)
    function generateCalendarPC() {
        const container = document.getElementById('calendar-pc-container');
        container.innerHTML = '';
        
        const firstDay = new Date(currentYear, currentMonth - 1, 1);
        const lastDay = new Date(currentYear, currentMonth, 0);
        let startIdx = (firstDay.getDay() + 6) % 7;
        let totalDays = lastDay.getDate();
        let weeks = [];
        let currentWeek = new Array(7).fill(null);
        let dayCount = 1;
        for (let i = startIdx; i < 7; i++) currentWeek[i] = dayCount++;
        weeks.push(currentWeek);
        while (dayCount <= totalDays) {
            let week = new Array(7).fill(null);
            for (let i = 0; i < 7 && dayCount <= totalDays; i++) week[i] = dayCount++;
            weeks.push(week);
        }
        const dayNames = ['월', '화', '수', '목', '금', '토', '일'];
        const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth()+1).padStart(2,'0')}-${String(todayObj.getDate()).padStart(2,'0')}`;

        weeks.forEach((week, wIdx) => {
            const weekLabel = document.createElement('h3');
            weekLabel.className = 'text-lg font-bold mb-3 border-l-4 border-primary pl-3 mt-6';
            weekLabel.innerText = `${currentMonth}월 ${wIdx + 1}주차`;
            container.appendChild(weekLabel);
            
            const gridWrapper = document.createElement('div');
            gridWrapper.className = 'overflow-x-auto no-scrollbar rounded-lg mb-8 shadow-sm';
            const grid = document.createElement('div');
            grid.className = 'grid-schedule min-w-[1100px]';
            
            grid.innerHTML += `<div class="grid-header text-text-muted">구분</div>`;
            week.forEach((day, idx) => {
                let color = idx === 5 ? 'text-blue-500' : idx === 6 ? 'text-red-500' : '';
                if (day) {
                    const dateStr = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                    const hol = isHoliday(dateStr);
                    const holBadge = hol ? '<span class="text-[9px] font-black text-orange-600 dark:text-orange-300 ml-1 border border-orange-400 rounded px-1">연휴</span>' : '';
                    grid.innerHTML += `<div class="grid-header date-header-clickable ${hol ? 'is-holiday-header' : color}" onclick="openHolidayModal('${dateStr}')" title="클릭하여 연휴 설정/해제">${dayNames[idx]+' ('+day+'일)'}${holBadge}</div>`;
                } else {
                    grid.innerHTML += `<div class="grid-header ${color}"></div>`;
                }
            });
            grid.innerHTML += `<div class="grid-header text-text-muted bg-gray-100 dark:bg-gray-800">비고</div>`;
            
            lines.forEach(line => {
                grid.innerHTML += `<div class="grid-header bg-surface text-sm">${line}</div>`;
                week.forEach(day => {
                    if (day) {
                        const dateStr = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                        const holClass = isHoliday(dateStr) ? 'is-holiday' : '';
                        grid.innerHTML += `<div class="grid-cell dropzone ${holClass} ${dateStr === todayStr ? 'is-today' : ''}" data-line="${line}" data-date="${dateStr}" onclick="openModal('${dateStr}', '${line}')"></div>`;
                    } else grid.innerHTML += `<div class="grid-cell bg-gray-100 dark:bg-gray-800/50 opacity-50 cursor-not-allowed"></div>`;
                });
                const noteId = `note-${currentYear}-${currentMonth}-W${wIdx+1}`;
                grid.innerHTML += `<div class="grid-cell dropzone is-note" data-line="${line}" data-date="${noteId}" onclick="openModal('${noteId}', '${line}')"></div>`;
            });
            gridWrapper.appendChild(grid);
            container.appendChild(gridWrapper);
        });
        
        // modal-line 옵션은 initLineSelect()에서 한 번만 초기화 (여기서 하면 수정 중 타이밍 버그 발생)
        
        // 💡 완벽하게 수정된 드래그 앤 드롭
        document.querySelectorAll('.dropzone').forEach(zone => {
            new Sortable(zone, {
                group: 'shared', animation: 150, ghostClass: 'opacity-50',
                // 연속 일정 막대(.span-card)와 자리표시자(.span-area)는 드래그 대상에서 제외
                draggable: '.event-card:not(.span-card)',
                onEnd: function(evt) {
                    const item = evt.item; const to = evt.to;
                    const isVac = to.dataset.line === "🏖️ 휴가자";
                    const eventId = item.dataset.id;

                    let existingEvent = cachedEvents.find(e => e.id === eventId);
                    if (existingEvent) {
                        existingEvent.date = to.dataset.date;
                        existingEvent.line = to.dataset.line;
                        existingEvent.isVacation = isVac;
                        item.className = `event-card ${isVac ? 'vacation' : (existingEvent.category || 'cat-normal')}`;
                        
                        sendToSheet({ 
                            action: 'update', id: existingEvent.id, date: existingEvent.date, 
                            line: existingEvent.line, title: existingEvent.title, 
                            worker: existingEvent.worker, category: existingEvent.category, isVacation: existingEvent.isVacation,
                            registeredBy: existingEvent.registeredBy, alarmOn: existingEvent.alarmOn,
                            workTags: existingEvent.workTags || ''
                        });
                        // 자리표시자 순서가 흐트러질 수 있으므로 레이아웃 재계산
                        setTimeout(renderCalendarUI, 0);
                    }
                }
            });
        });
    }

    // 📱 모바일 렌더링 (구글 캘린더형)
    function generateCalendarMobile() {
        const container = document.getElementById('calendar-mobile-container');
        container.innerHTML = '';
        
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-7 gap-px bg-border border border-border rounded-lg overflow-hidden mt-4 shadow-sm';
        
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        days.forEach((d, i) => {
            const color = i === 0 ? 'text-red-500' : (i === 6 ? 'text-blue-500' : 'text-text-muted');
            grid.innerHTML += `<div class="bg-background text-center py-2 text-[11px] font-bold ${color}">${d}</div>`;
        });

        const firstDayOffset = new Date(currentYear, currentMonth - 1, 1).getDay();
        const totalDays = new Date(currentYear, currentMonth, 0).getDate();
        const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth()+1).padStart(2,'0')}-${String(todayObj.getDate()).padStart(2,'0')}`;

        for (let i = 0; i < firstDayOffset; i++) {
            grid.innerHTML += `<div class="bg-gray-50 dark:bg-gray-800/30 min-h-[70px]"></div>`;
        }

        for (let day = 1; day <= totalDays; day++) {
            const dateStr = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const dayOfWeek = new Date(currentYear, currentMonth - 1, day).getDay();
            const dateColor = dayOfWeek === 0 ? 'text-red-500' : (dayOfWeek === 6 ? 'text-blue-500' : 'text-text-main');
            const hol = isHoliday(dateStr);
            const isToday = dateStr === todayStr ? 'bg-blue-50 dark:bg-blue-900/20' : (hol ? 'is-holiday bg-surface' : 'bg-surface');
            const holDot = hol ? '<div class="text-[8px] font-black text-orange-600 dark:text-orange-300 text-center leading-none">연휴</div>' : '';
            
            const dayEvents = cachedEvents.filter(ev => ev.date === dateStr);
            let eventsHtml = dayEvents.slice(0, 3).map(ev => {
                const isVac = ev.line === '🏖️ 휴가자' || ev.isVacation === 'true' || ev.isVacation === true;
                const catBg = isVac ? 'bg-blue-500' : (ev.category === 'cat-pm' ? 'bg-emerald-500' : (ev.category === 'cat-urgent' ? 'bg-amber-500' : (ev.category === 'cat-setup' ? 'bg-purple-500' : 'bg-red-600')));
                return `<div class="text-[9px] text-white truncate px-1 rounded-[2px] mt-[2px] ${catBg}">${ev.title}</div>`;
            }).join('');

            if (dayEvents.length > 3) eventsHtml += `<div class="text-[9px] font-bold text-text-muted text-center mt-[2px]">+${dayEvents.length - 3}건</div>`;

            const todayCircle = dateStr === todayStr ? `<span class="bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center">${day}</span>` : `<span>${day}</span>`;

            grid.innerHTML += `<div class="${isToday} min-h-[85px] p-1 flex flex-col cursor-pointer" onclick="openMobileDayView('${dateStr}')"><div class="text-[11px] font-bold ${dateColor} mb-0.5 flex justify-center">${todayCircle}</div>${holDot}<div class="flex-1 flex flex-col gap-[1px]">${eventsHtml}</div></div>`;
        }
        container.appendChild(grid);

        const notes = cachedEvents.filter(ev => ev.date.startsWith(`note-${currentYear}-${currentMonth}`));
        const noteBox = document.createElement('div');
        noteBox.className = 'mt-4 bg-surface border border-border rounded-lg p-3 shadow-sm';
        
        // 주차 수 계산 (최대 5주차까지)
        const weekCount = Math.ceil((firstDayOffset + totalDays) / 7);
        const weekButtonsHtml = Array.from({ length: weekCount }, (_, idx) => {
            const wId = `note-${currentYear}-${currentMonth}-W${idx + 1}`;
            const cnt = cachedEvents.filter(ev => ev.date === wId).length;
            return `<button type="button" onclick="openMobileDayView('${wId}', true)" class="py-2 px-1 text-[11px] font-bold bg-background hover:bg-gray-100 dark:hover:bg-gray-800 border border-border rounded-lg flex flex-col items-center justify-center transition-colors">
                <span>${idx + 1}주차</span>
                ${cnt > 0 ? `<span class="text-[9px] text-primary font-black mt-0.5">${cnt}건</span>` : '<span class="text-[9px] text-text-muted opacity-40">-</span>'}
            </button>`;
        }).join('');

        noteBox.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-bold text-text-muted flex items-center gap-1">
                    <span class="material-symbols-outlined text-[16px]">sticky_note_2</span> 이번 달 주차별 비고 (${notes.length}건)
                </span>
                <button type="button" onclick="openMobileDayView('note-${currentYear}-${currentMonth}', true)" class="text-[11px] font-bold text-primary hover:underline">전체보기</button>
            </div>
            <div class="grid grid-cols-${Math.min(weekCount, 5)} gap-1.5">
                ${weekButtonsHtml}
            </div>
        `;
        container.appendChild(noteBox);
    }
