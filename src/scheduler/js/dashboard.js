// ===== 📊 대시보드 =====
    // ScheduleDB(cachedEvents) · ActionDB(actionItems) · EquipmentDB(cachedEquipments)를
    // 그대로 재사용해 클라이언트에서 통계를 계산한다. (서버/시트 추가 변경 없음)
    let dashPeriod = 'month';   // month | 3m | all
    let dashTab = 'overview';
    let dashCharts = {};        // Chart.js 인스턴스 보관 (탭 전환 시 파괴 후 재생성)

    const CAT_META = {
        'cat-normal': { label: '일반', color: '#dc2626' },
        'cat-pm':     { label: 'PM',   color: '#16a34a' },
        'cat-urgent': { label: '긴급', color: '#f59e0b' },
        'cat-setup':  { label: 'Setup', color: '#9333ea' }
    };
    const LINE_COLORS = ['#b7000c', '#2563eb', '#16a34a', '#9333ea', '#f59e0b', '#0891b2', '#db2777', '#65a30d', '#7c3aed'];

    function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
    function destroyDashCharts() { Object.values(dashCharts).forEach(c => c && c.destroy()); dashCharts = {}; }

    // 차트 생성 실패(라이브러리 미로딩, 잘못된 데이터 등) 시 빈 화면 대신 안내 문구를 남긴다
    function createChart(name, canvasId, config) {
        const el = document.getElementById(canvasId);
        if (!el) return;
        try {
            dashCharts[name] = new Chart(el, config);
        } catch (e) {
            console.error('차트 생성 실패:', canvasId, e);
            if (el.parentElement) el.parentElement.innerHTML = `<div class="text-xs text-text-muted text-center py-10">차트를 그릴 수 없습니다.</div>`;
        }
    }

    function dashDateRange() {
        const today = todayStrLocal();
        if (dashPeriod === 'all') return { start: '2000-01-01', end: '9999-12-31', label: '전체 기간' };
        if (dashPeriod === '3m') {
            const d = toDateObj(today); d.setMonth(d.getMonth() - 3);
            return { start: toDateStr(d), end: today, label: '최근 3개월' };
        }
        const d = toDateObj(today);
        const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        return { start, end: today, label: `${d.getMonth() + 1}월 (이번달)` };
    }

    function dashScheduleRows() {
        const { start, end } = dashDateRange();
        return cachedEvents.filter(e => isDayDate(e.date) && e.date >= start && e.date <= end);
    }

    function openDashboard() {
        document.getElementById('dashboard-modal').classList.remove('hidden');
        renderPeriodPicks();
        // 차트 라이브러리(Chart.js)가 네트워크 문제 등으로 로드되지 않았을 경우를 대비한 안내
        if (typeof Chart === 'undefined') {
            document.getElementById('dtab-overview').innerHTML = `
                <div class="dash-card text-center py-10">
                    <span class="material-symbols-outlined text-[40px] text-orange-400">wifi_off</span>
                    <p class="text-sm font-bold text-text-main mt-2">차트 라이브러리를 불러오지 못했습니다</p>
                    <p class="text-xs text-text-muted mt-1.5 leading-relaxed">인터넷 연결을 확인한 뒤 새로고침(F5) 해주세요.<br>사내망에서 외부 CDN 접속이 차단된 경우 관리자에게 문의해주세요.</p>
                </div>`;
            return;
        }
        renderDashboard();
    }
    function closeDashboard() {
        document.getElementById('dashboard-modal').classList.add('hidden');
        destroyDashCharts();
    }
    function setDashPeriod(p) { dashPeriod = p; renderPeriodPicks(); renderDashboard(); }

    function renderPeriodPicks() {
        const opts = [['month', '이번달'], ['3m', '최근 3개월'], ['all', '전체']];
        const html = opts.map(([v, l]) => `<button class="dash-period ${dashPeriod === v ? 'active' : ''}" onclick="setDashPeriod('${v}')">${l}</button>`).join('');
        document.getElementById('dash-period-picks').innerHTML = html;
        document.getElementById('dash-period-picks-m').innerHTML = html;
    }

    function switchDashTab(tab) {
        dashTab = tab;
        document.querySelectorAll('.dash-tab').forEach(b => b.classList.toggle('active', b.dataset.dtab === tab));
        document.querySelectorAll('.dash-pane').forEach(p => p.classList.add('hidden'));
        document.getElementById('dtab-' + tab).classList.remove('hidden');
        renderDashboard();
    }

    function renderDashboard() {
        destroyDashCharts();
        if (dashTab === 'overview') renderDashOverview();
        else if (dashTab === 'team') renderDashTeam();
        else if (dashTab === 'line') renderDashLine();
        else if (dashTab === 'tags') renderDashTags();
        else renderDashAction();
    }

    // ---------- 개요 ----------
    function renderDashOverview() {
        const rows = dashScheduleRows();
        const work = rows.filter(e => e.line !== '🏖️ 휴가자');
        const range = dashDateRange();

        const kpiHtml = `
            <div class="grid grid-cols-2 gap-3">
                <div class="dash-kpi"><div class="dash-kpi-label">📅 총 일정 (${range.label})</div><div class="dash-kpi-value">${work.length}건</div></div>
                <div class="dash-kpi"><div class="dash-kpi-label">✅ Action 완료율</div><div class="dash-kpi-value">${actionCompletionRate()}%</div></div>
            </div>`;

        // 카테고리 분포
        const catCount = {};
        work.forEach(e => { const c = e.category || 'cat-normal'; catCount[c] = (catCount[c] || 0) + 1; });

        // 라인별 건수 (상위)
        const lineCount = {};
        work.forEach(e => { lineCount[e.line] = (lineCount[e.line] || 0) + 1; });
        const topLines = Object.entries(lineCount).sort((a, b) => b[1] - a[1]).slice(0, 8);

        const box = document.getElementById('dtab-overview');
        box.innerHTML = kpiHtml + `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="dash-card">
                    <div class="dash-card-title">🗂️ 카테고리 분포</div>
                    <div class="relative h-56"><canvas id="chart-cat"></canvas></div>
                </div>
                <div class="dash-card">
                    <div class="dash-card-title">🏭 라인별 작업 건수 (상위 8개)</div>
                    <div class="relative h-56"><canvas id="chart-topline"></canvas></div>
                </div>
            </div>
            <div class="dash-card">
                <div class="dash-card-title">📈 월별 추이 (최근 6개월)</div>
                <div class="relative h-64"><canvas id="chart-trend"></canvas></div>
            </div>`;

        // 카테고리 도넛
        const catLabels = Object.keys(catCount).map(c => (CAT_META[c] || { label: c }).label);
        const catColors = Object.keys(catCount).map(c => (CAT_META[c] || { color: '#94a3b8' }).color);
        createChart('cat', 'chart-cat', {
            type: 'doughnut',
            data: { labels: catLabels, datasets: [{ data: Object.values(catCount), backgroundColor: catColors, borderWidth: 0 }] },
            options: baseChartOpts({ legend: true })
        });

        // 라인별 바
        createChart('topline', 'chart-topline', {
            type: 'bar',
            data: { labels: topLines.map(x => x[0]), datasets: [{ data: topLines.map(x => x[1]), backgroundColor: '#b7000c', borderRadius: 4 }] },
            options: baseChartOpts({ indexAxis: 'y' })
        });

        // 월별 추이
        renderTrendChart();
    }

    function renderTrendChart() {
        const today = toDateObj(todayStrLocal());
        const months = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
        const workByMonth = months.map(() => 0);
        const vacByMonth = months.map(() => 0);
        cachedEvents.forEach(e => {
            if (!isDayDate(e.date)) return;
            const ym = String(e.date).slice(0, 7);
            const idx = months.indexOf(ym);
            if (idx === -1) return;
            if (e.line === '🏖️ 휴가자') vacByMonth[idx]++; else workByMonth[idx]++;
        });
        createChart('trend', 'chart-trend', {
            type: 'line',
            data: {
                labels: months.map(m => m.slice(5) + '월'),
                datasets: [
                    { label: '작업 일정', data: workByMonth, borderColor: '#b7000c', backgroundColor: 'rgba(183,0,12,0.1)', tension: 0.25, fill: true },
                    { label: '휴가', data: vacByMonth, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.08)', tension: 0.25, fill: true }
                ]
            },
            options: baseChartOpts({ legend: true })
        });
    }

    // 두 날짜 사이 일수 차이 (Action 완료 소요일 계산 등에 사용)
    function dayDiffLocal(fromStr, toStr) { return Math.round((toDateObj(toStr) - toDateObj(fromStr)) / 86400000); }

    function actionCompletionRate() {
        if (!actionItems || actionItems.length === 0) return 0;
        const done = actionItems.filter(a => a.status === 'done').length;
        return Math.round((done / actionItems.length) * 100);
    }

    // Chart.js 공통 옵션 (다크모드 대응)
    function baseChartOpts(opt = {}) {
        const textColor = cssVar('--text-main') || '#333';
        const gridColor = cssVar('--border-color') || '#e5e7eb';
        return {
            responsive: true, maintainAspectRatio: false,
            indexAxis: opt.indexAxis || 'x',
            plugins: {
                legend: { display: !!opt.legend, position: 'bottom', labels: { color: textColor, font: { size: 11, weight: 'bold' }, boxWidth: 12, padding: 10 } },
                tooltip: { titleFont: { size: 12 }, bodyFont: { size: 12 } }
            },
            scales: (opt.indexAxis === 'y') ? {
                x: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } },
                y: { ticks: { color: textColor, font: { size: 11, weight: 'bold' } }, grid: { display: false } }
            } : {
                x: { ticks: { color: textColor, font: { size: 10 } }, grid: { display: false } },
                y: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor }, beginAtZero: true }
            }
        };
    }

    // ---------- 팀원별 ----------
    function renderDashTeam() {
        // 팀원별 근무/휴가일 대신, 누가 어떤 작업유형을 얼마나 했는지 보여준다
        const rows = dashScheduleRows().filter(e => e.line !== '🏖️ 휴가자');
        const stat = {};
        teamMembers.forEach(m => { stat[m] = {}; });

        rows.forEach(e => {
            const tags = parseTagString(e.workTags).filter(t => MAIN_TAG_ORDER.includes(t));  // 세부 태그 제외, 대분류만
            if (tags.length === 0) return;
            const text = `${e.title || ''} ${e.worker || ''}`;
            teamMembers.forEach(m => {
                if (!text.includes(m)) return;
                if (!stat[m]) stat[m] = {};
                tags.forEach(tag => { stat[m][tag] = (stat[m][tag] || 0) + 1; });
            });
        });

        const names = Object.keys(stat)
            .filter(m => Object.values(stat[m]).some(v => v > 0))
            .sort((a, b) => Object.values(stat[b]).reduce((s, v) => s + v, 0) - Object.values(stat[a]).reduce((s, v) => s + v, 0));
        const range = dashDateRange();

        document.getElementById('dtab-team').innerHTML = `
            <div class="dash-card">
                <div class="dash-card-title">👥 팀원별 작업유형 분포 (${range.label})</div>
                ${teamMembers.length === 0
                    ? `<div class="text-xs text-text-muted py-6 text-center">등록된 팀원이 없습니다. <button onclick="closeDashboard();openTeamModal()" class="font-bold text-primary hover:underline">팀원관리</button>에서 먼저 등록해주세요.</div>`
                    : names.length === 0
                    ? `<div class="text-xs text-text-muted py-6 text-center">기간 내 작업유형 태그가 지정된 일정이 없습니다.<br>일정 등록 시 작업유형을 선택해주세요.</div>`
                    : `<div class="relative" style="height:${Math.max(220, names.length * 32)}px"><canvas id="chart-team"></canvas></div>`}
            </div>`;

        if (names.length === 0) return;

        createChart('team', 'chart-team', {
            type: 'bar',
            data: {
                labels: names,
                datasets: MAIN_TAG_ORDER.map(code => ({
                    label: TAG_META[code].label, data: names.map(n => stat[n][code] || 0),
                    backgroundColor: TAG_META[code].color, stack: 's'
                }))
            },
            options: { ...baseChartOpts({ indexAxis: 'y', legend: true }),
                scales: { x: { stacked: true, beginAtZero: true, ticks: { color: cssVar('--text-main'), font: { size: 10 } }, grid: { color: cssVar('--border-color') } },
                          y: { stacked: true, ticks: { color: cssVar('--text-main'), font: { size: 11, weight: 'bold' } }, grid: { display: false } } }
            }
        });
    }

    // ---------- 라인별 ----------
    function renderDashLine() {
        const rows = dashScheduleRows().filter(e => e.line !== '🏖️ 휴가자');
        const lines = [...new Set(rows.map(e => e.line))].filter(Boolean);
        const cats = Object.keys(CAT_META);

        const matrix = {};
        lines.forEach(l => { matrix[l] = { 'cat-normal': 0, 'cat-pm': 0, 'cat-urgent': 0, 'cat-setup': 0 }; });
        rows.forEach(e => { const c = e.category || 'cat-normal'; if (matrix[e.line]) matrix[e.line][c] = (matrix[e.line][c] || 0) + 1; });

        const sortedLines = lines.sort((a, b) =>
            Object.values(matrix[b]).reduce((s, v) => s + v, 0) - Object.values(matrix[a]).reduce((s, v) => s + v, 0));

        const range = dashDateRange();
        document.getElementById('dtab-line').innerHTML = `
            <div class="dash-card">
                <div class="dash-card-title">🏭 라인별 · 카테고리별 작업 건수 (${range.label})</div>
                ${sortedLines.length === 0 ? `<div class="text-xs text-text-muted py-6 text-center">기간 내 일정이 없습니다.</div>`
                    : `<div class="relative" style="height:${Math.max(220, sortedLines.length * 34)}px"><canvas id="chart-line"></canvas></div>`}
            </div>`;
        if (sortedLines.length === 0) return;

        createChart('line', 'chart-line', {
            type: 'bar',
            data: {
                labels: sortedLines,
                datasets: cats.map(c => ({
                    label: CAT_META[c].label, data: sortedLines.map(l => matrix[l][c]),
                    backgroundColor: CAT_META[c].color, stack: 's'
                }))
            },
            options: { ...baseChartOpts({ indexAxis: 'y', legend: true }),
                scales: { x: { stacked: true, beginAtZero: true, ticks: { color: cssVar('--text-main'), font: { size: 10 } }, grid: { color: cssVar('--border-color') } },
                          y: { stacked: true, ticks: { color: cssVar('--text-main'), font: { size: 11, weight: 'bold' } }, grid: { display: false } } }
            }
        });
    }

    // ---------- 작업유형 ----------
    function renderDashTags() {
        const rows = dashScheduleRows().filter(e => e.line !== '🏖️ 휴가자');
        const range = dashDateRange();

        const mainCount = {};
        const subCount = { BM: {}, PARTS: {} };   // 부모별 세부 집계
        let untagged = 0;

        rows.forEach(e => {
            const tags = parseTagString(e.workTags);
            if (tags.length === 0) { untagged++; return; }
            tags.forEach(t => {
                if (MAIN_TAG_ORDER.includes(t)) { mainCount[t] = (mainCount[t] || 0) + 1; return; }
                // 세부 태그가 어느 부모 그룹 소속인지 찾아서 집계
                for (const parent of Object.keys(SUB_TAG_GROUPS)) {
                    if (SUB_TAG_GROUPS[parent].subs[t]) { subCount[parent][t] = (subCount[parent][t] || 0) + 1; break; }
                }
            });
        });

        const mainLabels = MAIN_TAG_ORDER.filter(c => mainCount[c]);

        const subCardHtml = (parentCode, canvasId) => {
            const g = SUB_TAG_GROUPS[parentCode];
            const labels = Object.keys(g.subs).filter(c => subCount[parentCode][c]);
            return `<div class="dash-card">
                <div class="dash-card-title">${g.title.replace(' 세부 분류', '')} 세부 분류</div>
                ${labels.length === 0 ? `<div class="text-xs text-text-muted py-10 text-center">기간 내 해당 세부 태그가 지정된 일정이 없습니다.</div>`
                    : `<div class="relative h-64"><canvas id="${canvasId}"></canvas></div>`}
            </div>`;
        };

        document.getElementById('dtab-tags').innerHTML = `
            <div class="dash-card">
                <div class="dash-card-title">🏷️ 작업유형 분포 (${range.label})</div>
                ${mainLabels.length === 0 ? `<div class="text-xs text-text-muted py-10 text-center">태그가 지정된 일정이 없습니다.<br>일정을 등록/수정할 때 작업유형을 선택해주세요.</div>`
                    : `<div class="relative h-64"><canvas id="chart-tags"></canvas></div>`}
                ${untagged > 0 ? `<div class="text-[11px] text-text-muted mt-2">※ 태그 미지정 ${untagged}건은 집계에서 제외됨</div>` : ''}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${subCardHtml('BM', 'chart-bm')}
                ${subCardHtml('PARTS', 'chart-parts')}
            </div>`;

        if (mainLabels.length > 0) {
            createChart('tags', 'chart-tags', {
                type: 'bar',
                data: { labels: mainLabels.map(c => TAG_META[c].label), datasets: [{ data: mainLabels.map(c => mainCount[c]), backgroundColor: mainLabels.map(c => TAG_META[c].color), borderRadius: 4 }] },
                options: baseChartOpts({ indexAxis: 'y' })
            });
        }

        ['BM', 'PARTS'].forEach(parentCode => {
            const g = SUB_TAG_GROUPS[parentCode];
            const labels = Object.keys(g.subs).filter(c => subCount[parentCode][c]);
            if (labels.length === 0) return;
            createChart(parentCode.toLowerCase(), parentCode === 'BM' ? 'chart-bm' : 'chart-parts', {
                type: 'doughnut',
                data: { labels: labels.map(c => g.subs[c]), datasets: [{ data: labels.map(c => subCount[parentCode][c]), backgroundColor: g.colors, borderWidth: 0 }] },
                options: baseChartOpts({ legend: true })
            });
        });
    }

    // ---------- Action ----------
    function renderDashAction() {
        const total = actionItems.length;
        const done = actionItems.filter(a => a.status === 'done').length;
        const open = total - done;
        const overdue = actionItems.filter(isOverdue).length;

        // 완료 소요일 평균 (createdAt → completedAt)
        const durations = actionItems.filter(a => a.status === 'done' && a.createdAt && a.completedAt)
            .map(a => dayDiffLocal(a.createdAt, a.completedAt)).filter(d => d >= 0);
        const avgDays = durations.length ? (durations.reduce((s, d) => s + d, 0) / durations.length).toFixed(1) : '-';

        // 담당자별 열림/완료
        const byAssignee = {};
        actionItems.forEach(a => {
            const who = a.assignee || '(미지정)';
            if (!byAssignee[who]) byAssignee[who] = { open: 0, done: 0 };
            byAssignee[who][a.status === 'done' ? 'done' : 'open']++;
        });
        const names = Object.keys(byAssignee).sort((a, b) => (byAssignee[b].open + byAssignee[b].done) - (byAssignee[a].open + byAssignee[a].done));

        document.getElementById('dtab-action').innerHTML = `
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div class="dash-kpi"><div class="dash-kpi-label">전체 업무</div><div class="dash-kpi-value">${total}건</div></div>
                <div class="dash-kpi"><div class="dash-kpi-label">진행중</div><div class="dash-kpi-value">${open}건</div></div>
                <div class="dash-kpi"><div class="dash-kpi-label">기한 초과</div><div class="dash-kpi-value ${overdue > 0 ? 'text-red-600 dark:text-red-400' : ''}">${overdue}건</div></div>
                <div class="dash-kpi"><div class="dash-kpi-label">평균 처리 소요일</div><div class="dash-kpi-value">${avgDays}${avgDays !== '-' ? '일' : ''}</div></div>
            </div>
            <div class="dash-card">
                <div class="dash-card-title">👤 담당자별 진행 현황</div>
                ${names.length === 0 ? `<div class="text-xs text-text-muted py-6 text-center">등록된 업무가 없습니다.</div>`
                    : `<div class="relative" style="height:${Math.max(200, names.length * 34)}px"><canvas id="chart-action"></canvas></div>`}
            </div>`;
        if (names.length === 0) return;

        createChart('action', 'chart-action', {
            type: 'bar',
            data: {
                labels: names,
                datasets: [
                    { label: '진행중', data: names.map(n => byAssignee[n].open), backgroundColor: '#f59e0b', stack: 's' },
                    { label: '완료', data: names.map(n => byAssignee[n].done), backgroundColor: '#16a34a', stack: 's' }
                ]
            },
            options: { ...baseChartOpts({ indexAxis: 'y', legend: true }),
                scales: { x: { stacked: true, beginAtZero: true, ticks: { color: cssVar('--text-main'), font: { size: 10 } }, grid: { color: cssVar('--border-color') } },
                          y: { stacked: true, ticks: { color: cssVar('--text-main'), font: { size: 11, weight: 'bold' } }, grid: { display: false } } }
            }
        });
    }
    // ===========================
