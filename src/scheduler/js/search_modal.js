// 🔍 통합 일정 및 작업 이력 검색 엔진
    // ==========================================
    let searchFilterType = 'all';
    let currentSearchResults = [];

    function openSearchModal(initialQuery = '') {
        const modal = document.getElementById('search-modal');
        modal.classList.remove('hidden');
        const input = document.getElementById('search-input');
        if (initialQuery) {
            input.value = initialQuery;
        }
        setTimeout(() => {
            input.focus();
            if (initialQuery) performSearch();
        }, 50);
    }

    function closeSearchModal() {
        document.getElementById('search-modal').classList.add('hidden');
    }

    function clearSearchInput() {
        const input = document.getElementById('search-input');
        input.value = '';
        input.focus();
        performSearch();
    }

    function quickSearch(keyword) {
        const input = document.getElementById('search-input');
        input.value = keyword;
        performSearch();
    }

    function setSearchFilter(type) {
        searchFilterType = type;
        document.querySelectorAll('.search-filter-chip').forEach(c => {
            c.classList.toggle('active', c.dataset.filter === type);
        });
        performSearch();
    }

    // Ctrl+K 및 ESC 키보드 단축키 지원
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            const modal = document.getElementById('search-modal');
            if (modal.classList.contains('hidden')) {
                openSearchModal();
            } else {
                closeSearchModal();
            }
        }
    });

    // 검색어 하이라이트 헬퍼
    function highlightKeyword(text, keyword) {
        const safeText = escHtml(text || '');
        if (!keyword || !keyword.trim()) return safeText;
        const kw = keyword.trim().replace(/[-[\]{}()*+?.,\^$|#\s]/g, '\\$&');
        const regex = new RegExp(`(${kw})`, 'gi');
        return safeText.replace(regex, '<mark class="bg-amber-200 dark:bg-amber-800 text-text-main rounded px-0.5 font-bold">$1</mark>');
    }

    // 검색 실행 (연속 일정은 그룹으로 묶어 하나로 표시 + 단일 일정 표시)
    function performSearch() {
        const input = document.getElementById('search-input');
        const query = (input.value || '').trim();
        const clearBtn = document.getElementById('search-clear-btn');
        const csvBtn = document.getElementById('search-csv-btn');
        const summaryCount = document.getElementById('search-result-count');
        const keywordBadge = document.getElementById('search-keyword-badge');
        const container = document.getElementById('search-result-list');
        const sortOrder = document.getElementById('search-sort').value;

        clearBtn.classList.toggle('hidden', !query);

        if (!query && searchFilterType === 'all') {
            currentSearchResults = [];
            csvBtn.classList.add('hidden');
            summaryCount.innerText = '검색어를 입력하면 전체 이력을 검색합니다.';
            keywordBadge.classList.add('hidden');
            container.innerHTML = `
                <div class="py-14 text-center text-text-muted flex flex-col items-center justify-center">
                    <span class="material-symbols-outlined text-[48px] opacity-30 mb-2 text-primary">search</span>
                    <p class="text-sm font-bold text-text-main mb-1">검색어를 입력하여 작업 이력을 찾아보세요</p>
                    <p class="text-xs opacity-70 mb-4">설비 호기(MDIB701 등), 작업명(PM 등), 작업자, 태그 등으로 빠르게 조회할 수 있습니다.</p>
                    <div class="flex items-center gap-2 flex-wrap justify-center max-w-md">
                        <span class="text-[11px] font-bold opacity-60">추천 검색어:</span>
                        <button onclick="quickSearch('PM')" class="px-2.5 py-1 bg-background hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg text-xs font-bold border border-border">PM</button>
                        <button onclick="quickSearch('Setup')" class="px-2.5 py-1 bg-background hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg text-xs font-bold border border-border">Setup</button>
                        <button onclick="quickSearch('MDIB701')" class="px-2.5 py-1 bg-background hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg text-xs font-bold border border-border">MDIB701</button>
                        <button onclick="quickSearch('P1F')" class="px-2.5 py-1 bg-background hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg text-xs font-bold border border-border">P1F</button>
                        <button onclick="quickSearch('부품교체')" class="px-2.5 py-1 bg-background hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg text-xs font-bold border border-border">부품교체</button>
                    </div>
                </div>`;
            return;
        }

        const qLower = query.toLowerCase();

        // 1) 그룹별로 묶어 연속 일정 정보 생성
        const groups = new Map();
        cachedEvents.forEach(ev => {
            const d = String(ev.date || '');
            if (!d || d.startsWith('config-')) return;
            const k = groupKeyOf(ev.id);
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(ev);
        });

        const itemsToSearch = [];
        groups.forEach((list, gKey) => {
            const dayEvents = list.filter(e => isDayDate(e.date)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
            const noteEvents = list.filter(e => !isDayDate(e.date));

            if (dayEvents.length > 0) {
                const rep = dayEvents[0];
                const startDate = dayEvents[0].date;
                const endDate = dayEvents[dayEvents.length - 1].date;
                itemsToSearch.push({
                    id: rep.id,
                    gKey,
                    isMulti: dayEvents.length > 1,
                    totalDays: dayEvents.length,
                    startDate,
                    endDate,
                    dateDisplay: dayEvents.length > 1 ? `${startDate} ~ ${endDate} (${dayEvents.length}일간)` : startDate,
                    sortDate: startDate,
                    line: rep.line,
                    title: rep.title || '',
                    worker: rep.worker || '',
                    registeredBy: rep.registeredBy || '',
                    category: rep.category || 'cat-normal',
                    isVacation: rep.line === '🏖️ 휴가자' || rep.isVacation === 'true' || rep.isVacation === true,
                    alarmOn: rep.alarmOn === true || rep.alarmOn === 'true',
                    workTags: rep.workTags || '',
                    rawEvents: dayEvents
                });
            }

            noteEvents.forEach(rep => {
                itemsToSearch.push({
                    id: rep.id,
                    gKey,
                    isMulti: false,
                    totalDays: 1,
                    startDate: rep.date,
                    endDate: rep.date,
                    dateDisplay: rep.date.replace('note-', '').replace('-W', '년 ') + '주차 비고',
                    sortDate: rep.date,
                    line: rep.line,
                    title: rep.title || '',
                    worker: rep.worker || '',
                    registeredBy: rep.registeredBy || '',
                    category: rep.category || 'cat-normal',
                    isVacation: rep.isVacation === 'true' || rep.isVacation === true,
                    alarmOn: rep.alarmOn === true || rep.alarmOn === 'true',
                    workTags: rep.workTags || '',
                    rawEvents: [rep]
                });
            });
        });

        // 2) 필터링 조건 검사
        let matched = itemsToSearch.filter(item => {
            // 필터 탭 검사
            if (searchFilterType === 'pm') {
                const isPm = item.category === 'cat-pm' || item.workTags.includes('PM') || item.title.toLowerCase().includes('pm');
                if (!isPm) return false;
            } else if (searchFilterType === 'setup') {
                const isSetup = item.category === 'cat-setup' || item.workTags.includes('SETUP') || item.title.toLowerCase().includes('setup');
                if (!isSetup) return false;
            } else if (searchFilterType === 'bm') {
                const isBm = item.workTags.includes('BM') || item.title.toLowerCase().includes('bm') || item.title.toLowerCase().includes('trouble');
                if (!isBm) return false;
            } else if (searchFilterType === 'parts') {
                const isParts = item.workTags.includes('PARTS') || item.title.includes('부품') || item.title.toLowerCase().includes('parts');
                if (!isParts) return false;
            } else if (searchFilterType === 'vacation') {
                if (!item.isVacation) return false;
            }

            // 검색어 텍스트 매칭
            if (!query) return true;

            const textToSearch = `${item.title} ${item.worker} ${item.line} ${item.workTags} ${item.registeredBy} ${item.startDate} ${item.endDate}`.toLowerCase();
            return textToSearch.includes(qLower);
        });

        // 3) 정렬
        matched.sort((a, b) => {
            if (sortOrder === 'recent') {
                return String(b.sortDate).localeCompare(String(a.sortDate));
            } else {
                return String(a.sortDate).localeCompare(String(b.sortDate));
            }
        });

        currentSearchResults = matched;
        csvBtn.classList.remove('hidden');
        summaryCount.innerHTML = `총 <b class="text-primary">${matched.length}건</b>의 일정/이력이 검색되었습니다.`;

        // 4) 렌더링
        if (matched.length === 0) {
            container.innerHTML = `
                <div class="py-14 text-center text-text-muted flex flex-col items-center justify-center">
                    <span class="material-symbols-outlined text-[42px] opacity-30 mb-2">sentiment_dissatisfied</span>
                    <p class="text-sm font-bold text-text-main mb-1">'${escHtml(query)}' 검색 결과가 없습니다.</p>
                    <p class="text-xs opacity-70">다른 검색어를 입력하시거나 필터 조건을 확인해주세요.</p>
                </div>`;
            return;
        }

        const todayStr = toDateStr(new Date());

        container.innerHTML = matched.map(item => {
            const catBorder = item.isVacation ? 'border-l-blue-500' : (item.category === 'cat-pm' ? 'border-l-emerald-500' : (item.category === 'cat-urgent' ? 'border-l-amber-500' : (item.category === 'cat-setup' ? 'border-l-purple-500' : 'border-l-red-600')));
            const catBadge = item.isVacation ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">🏖️ 휴가</span>' : (item.category === 'cat-pm' ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">PM</span>' : (item.category === 'cat-urgent' ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">긴급</span>' : (item.category === 'cat-setup' ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">Setup</span>' : '<span class="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">일반</span>')));

            // 태그 칩
            const tagChips = item.workTags ? item.workTags.split(',').map(t => {
                const meta = TAG_META[t] || { label: t, color: '#6b7280' };
                return `<span class="text-[9.5px] font-black px-1.5 py-0.5 rounded text-white" style="background:${meta.color}">${highlightKeyword(meta.label || t, query)}</span>`;
            }).join(' ') : '';

            // D-day 계산 (날짜형인 경우)
            let dDayHtml = '';
            if (isDayDate(item.startDate)) {
                const diff = dayDiffLocal(todayStr, item.startDate);
                if (diff === 0) dDayHtml = '<span class="text-[10px] font-black px-1.5 py-0.5 rounded bg-red-500 text-white">TODAY</span>';
                else if (diff > 0 && diff <= 14) dDayHtml = `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">D-${diff}</span>`;
                else if (diff < 0) dDayHtml = `<span class="text-[10px] font-bold text-text-muted opacity-70">${Math.abs(diff)}일 전</span>`;
            }

            return `
                <div class="search-item-card ${catBorder} flex flex-col md:flex-row md:items-center justify-between gap-3" onclick="openEditModal('${escHtml(item.id)}')">
                    <div class="flex-1 min-w-0 space-y-1.5">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-xs font-black text-text-main flex items-center gap-1">
                                <span class="material-symbols-outlined text-[15px] text-text-muted">calendar_today</span>
                                ${item.dateDisplay}
                            </span>
                            ${dDayHtml}
                            <span class="text-[11px] font-bold px-2 py-0.5 rounded bg-background border border-border text-text-main">${highlightKeyword(item.line, query)}</span>
                            ${catBadge}
                            ${tagChips}
                        </div>
                        <div class="text-sm md:text-base font-bold text-text-main break-words">
                            ${item.alarmOn ? '<span class="material-symbols-outlined text-[14px] text-amber-500 align-middle mr-1" title="알림설정 켜짐">notifications</span>' : ''}
                            ${highlightKeyword(item.title, query)}
                        </div>
                        <div class="flex items-center gap-3 text-xs text-text-muted flex-wrap">
                            ${item.worker ? `<span class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">person</span>작업자: <b class="text-text-main">${highlightKeyword(item.worker, query)}</b></span>` : ''}
                            ${item.registeredBy ? `<span class="flex items-center gap-1 opacity-75"><span class="material-symbols-outlined text-[14px]">edit</span>등록자: ${highlightKeyword(item.registeredBy, query)}</span>` : ''}
                        </div>
                    </div>
                    <div class="flex items-center gap-2 self-end md:self-center shrink-0" onclick="event.stopPropagation()">
                        ${isDayDate(item.startDate) ? `
                        <button type="button" onclick="jumpToEventDate('${item.startDate}')" class="px-2.5 py-1.5 text-xs font-bold text-text-muted hover:text-primary hover:bg-background border border-border rounded-lg flex items-center gap-1 transition-colors" title="해당 캘린더 날짜로 이동">
                            <span class="material-symbols-outlined text-[16px]">event</span> 달력 이동
                        </button>` : ''}
                        <button type="button" onclick="openEditModal('${escHtml(item.id)}')" class="px-3 py-1.5 text-xs font-bold bg-primary text-white hover:opacity-90 rounded-lg flex items-center gap-1 transition-opacity">
                            <span class="material-symbols-outlined text-[16px]">edit</span> 상세/수정
                        </button>
                    </div>
                </div>`;
        }).join('');
    }

    // 검색 결과 항목에서 캘린더의 해당 월로 점프
    function jumpToEventDate(dateStr) {
        if (!dateStr || !isDayDate(dateStr)) return;
        const p = dateStr.split('-').map(Number);
        currentYear = p[0];
        currentMonth = p[1];
        closeSearchModal();
        renderCalendarUI();
        showToast(`${currentYear}년 ${currentMonth}월 캘린더로 이동했습니다.`, 'success');
    }

    // 검색 결과 전용 CSV 다운로드
    function downloadSearchResultsCSV() {
        if (!currentSearchResults || currentSearchResults.length === 0) return alert('다운로드할 검색 결과가 없습니다.');
        const headers = ["ID", "시작일", "마감일", "일수", "라인", "제목", "카테고리", "작업자", "등록자", "작업유형태그", "알림설정"];
        
        function toCsvCell(val) {
            const str = String(val == null ? '' : val);
            if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        }

        const rows = currentSearchResults.map(it => [
            toCsvCell(it.id),
            toCsvCell(it.startDate),
            toCsvCell(it.endDate),
            toCsvCell(it.totalDays),
            toCsvCell(it.line),
            toCsvCell(it.title),
            toCsvCell(it.category),
            toCsvCell(it.worker),
            toCsvCell(it.registeredBy),
            toCsvCell(it.workTags),
            toCsvCell(it.alarmOn ? 'ON' : 'OFF')
        ].join(','));

        const csvContent = [headers.map(toCsvCell).join(','), ...rows].join('\n');
        const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        const query = (document.getElementById('search-input').value || '검색결과').trim();
        link.setAttribute("download", `ScheduleSearch_${query}_${toDateStr(new Date())}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
