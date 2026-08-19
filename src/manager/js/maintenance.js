// 5. [Business: Maintenance] 설비 소모품(Laser, Scale Head, Mirror) 유지보수
// ==============================================================================

/** 중복 날짜 이력 제거 (정보가 더 많이 채워진 쪽 우선) */
function dedupeHistoryArray(arr) {
    const seen = {};
    (arr || []).forEach(h => {
        const key = h.date;
        if (!key) return;
        if (!seen[key]) { seen[key] = h; return; }
        const score = x => Object.values(x).filter(v => v && v !== '-').length;
        if (score(h) > score(seen[key])) seen[key] = h;
    });
    return Object.values(seen).sort((x, y) => new Date((x.date || '').replace(' ', 'T')) - new Date((y.date || '').replace(' ', 'T')));
}

/** 유지보수 데이터 객체 구조 정규화 */
function normalizeMaintShape(d) {
    if (!d) d = {};
    if (!d.laser) d.laser = { replaceDate: null, offsetDays: 0, history: [] };
    d.laser.history = dedupeHistoryArray(d.laser.history);

    if (!d.scaleHead || typeof d.scaleHead !== 'object' || 'replaceDate' in d.scaleHead) {
        d.scaleHead = {};
    }
    SCALE_AXES.forEach(a => { 
        if (!d.scaleHead[a.key]) {
            d.scaleHead[a.key] = { replaceDate: null, history: [] }; 
        }
        d.scaleHead[a.key].history = dedupeHistoryArray(d.scaleHead[a.key].history); 
    });

    if (!d.consumables) d.consumables = [];
    return d;
}

/** 설비 키 기준 유지보수 데이터 조회 */
function getMaintData(key) {
    const all = JSON.parse(localStorage.getItem("equipMaintenance") || "{}");
    if (!all[key]) all[key] = {};
    all[key] = normalizeMaintShape(all[key]);
    return all[key];
}

/** 설비 키 기준 유지보수 데이터 저장 및 Push */
function saveMaintData(key, data) {
    const all = JSON.parse(localStorage.getItem("equipMaintenance") || "{}");
    all[key] = data;
    localStorage.setItem("equipMaintenance", JSON.stringify(all));
    if (typeof autoMergeAndSave === "function") autoMergeAndSave({ scope: 'maintenance' });
}

/** 유지보수 데이터 병합 함수 (객체 레벨) */
function mergeMaintDataObjects(target, source) {
    if (!source) return target;
    target = normalizeMaintShape(target); 
    source = normalizeMaintShape(source);
    
    target.laser.history = dedupeHistoryArray([...(target.laser.history || []), ...(source.laser.history || [])]);
    if (source.laser.replaceDate && (!target.laser.replaceDate || new Date(source.laser.replaceDate) > new Date(target.laser.replaceDate))) {
        target.laser.replaceDate = source.laser.replaceDate;
        target.laser.offsetHours = source.laser.offsetHours || 0;
        target.laser.headSN = source.laser.headSN || target.laser.headSN;
        target.laser.psSN = source.laser.psSN || target.laser.psSN;
        target.laser.diodeSN = source.laser.diodeSN || target.laser.diodeSN;
    }

    SCALE_AXES.forEach(a => {
        const sa = source.scaleHead[a.key]; 
        const ta = target.scaleHead[a.key];
        ta.history = dedupeHistoryArray([...ta.history, ...sa.history]);
        if (ta.history.length) { 
            const last = ta.history[ta.history.length - 1]; 
            ta.replaceDate = last.date; 
            ta.sn = last.sn || ta.sn; 
        }
    });

    const consMerged = {}; 
    [...(target.consumables || []), ...(source.consumables || [])].forEach(c => { 
        consMerged[`${c.date}|${c.name}`] = c; 
    });
    target.consumables = Object.values(consMerged);
    return target;
}

/** 외부 백업/동기화에서 들어온 유지보수 데이터를 S/N 키 기준으로 안전 병합 */
function applyIncomingMaintenance(incomingMaint) {
    try {
        const equipList = JSON.parse(localStorage.getItem("equipmentData") || "[]");
        const nameToSN = {}; 
        const snSet = new Set();
        equipList.forEach(eq => { 
            if (eq.name && eq.sn) nameToSN[eq.name.trim()] = eq.sn.trim(); 
            if (eq.sn) snSet.add(eq.sn.trim()); 
        });
        const resolveKey = k => (snSet.has((k || '').trim()) ? k : (nameToSN[(k || '').trim()] || k));

        const current = JSON.parse(localStorage.getItem("equipMaintenance") || "{}");
        const result = {};
        Object.keys(current).forEach(key => {
            const t = resolveKey(key);
            result[t] = result[t] ? mergeMaintDataObjects(result[t], current[key]) : normalizeMaintShape(current[key]);
        });
        Object.keys(incomingMaint || {}).forEach(key => {
            const t = resolveKey(key);
            result[t] = result[t] ? mergeMaintDataObjects(result[t], incomingMaint[key]) : normalizeMaintShape(incomingMaint[key]);
        });
        localStorage.setItem("equipMaintenance", JSON.stringify(result));
    } catch (err) {
        console.error("유지보수 데이터 병합 실패:", err);
    }
}

/** S/N 변경 시 유지보수 및 작업 이력 키 이전 */
async function migrateEquipmentSN(oldSN, newSN) {
    if (!oldSN || !newSN || oldSN === newSN) return;
    
    // 1) equipMaintenance 이전
    const all = JSON.parse(localStorage.getItem("equipMaintenance") || "{}");
    const oldData = all[oldSN];
    if (oldData) {
        all[newSN] = all[newSN] ? mergeMaintDataObjects(all[newSN], oldData) : oldData;
        delete all[oldSN];
        localStorage.setItem("equipMaintenance", JSON.stringify(all));
    }

    // 2) IndexedDB 히스토리 sn 필드 이전
    const allHist = await getIDBHistory();
    let changed = false;
    allHist.forEach(e => { 
        if (e.sn === oldSN) { 
            e.sn = newSN; 
            changed = true; 
        } 
    });
    if (changed) await putIDBHistory(allHist);

    autoMergeAndSave({ scope: 'all' });
    showToast("S/N 변경 반영", `이력이 새 S/N(${newSN})으로 이전되었습니다.`);
}

/** 최초 1회: 기존 호기명 기반 이력을 S/N 기반으로 마이그레이션 */
async function migrateEquipmentDataToSN() {
    try {
        const equipList = JSON.parse(localStorage.getItem("equipmentData") || "[]");
        const nameToSN = {}; 
        const snSet = new Set();
        equipList.forEach(eq => { 
            if (eq.name && eq.sn) nameToSN[eq.name.trim()] = eq.sn.trim(); 
            if (eq.sn) snSet.add(eq.sn.trim()); 
        });
        const resolveKey = k => (snSet.has((k || '').trim()) ? k : (nameToSN[(k || '').trim()] || k));

        const maint = JSON.parse(localStorage.getItem("equipMaintenance") || "{}");
        const newMaint = {};
        Object.keys(maint).forEach(key => {
            const targetKey = resolveKey(key);
            newMaint[targetKey] = newMaint[targetKey] ? mergeMaintDataObjects(newMaint[targetKey], maint[key]) : normalizeMaintShape(maint[key]);
        });
        localStorage.setItem("equipMaintenance", JSON.stringify(newMaint));

        const hist = await getIDBHistory();
        let changed = false;
        hist.forEach(e => { 
            if (!e.sn && nameToSN[(e.machine || '').trim()]) { 
                e.sn = nameToSN[e.machine.trim()]; 
                changed = true; 
            } 
        });
        if (changed) await putIDBHistory(hist);

        localStorage.setItem("snMigrationV1Done", "true");
        console.log(`[S/N 정합성 점검] 완료 (설비 ${Object.keys(nameToSN).length}대 매칭)`);
    } catch (err) {
        console.error("S/N 마이그레이션 실패:", err);
    }
}

/** 날짜 경과일수 계산 유틸 */
function daysSince(dateStr) {
    if (!dateStr) return 0;
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date(); 
    today.setHours(0, 0, 0, 0);
    return Math.floor((today - d) / 86400000);
}
function localDatetimeValue(date) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function normalizeDatetimeValue(v) { 
    if (!v) return ''; 
    return v.length === 10 ? v + 'T00:00' : v; 
}
function elapsedParts(dtStr) {
    if (!dtStr) return { days: 0, hours: 0 };
    const d = new Date(normalizeDatetimeValue(dtStr));
    let diffMs = new Date() - d; 
    if (diffMs < 0) diffMs = 0;
    return { days: Math.floor(diffMs / 86400000), hours: Math.floor((diffMs % 86400000) / 3600000) };
}

/** Laser 유지보수 섹션 렌더링 */
function renderLaserSection(name) {
    const data = getMaintData(name); 
    const l = data.laser;
    const auto = elapsedParts(l.replaceDate);
    const totalManualHours = l.offsetHours !== undefined ? l.offsetHours : (l.offsetDays ? l.offsetDays * 24 : 0);
    const totalHours = (auto.days * 24) + auto.hours + totalManualHours;
    const displayDays = Math.floor(totalHours / 24);
    const hasRecord = l.replaceDate || totalManualHours > 0;
    
    const wrap = document.getElementById('detailLaserWrap');
    wrap.innerHTML = `
        <div class="flex flex-wrap gap-4 items-end mb-6 bg-background p-4 border border-border rounded">
            <div class="w-full md:w-64">
                <label class="label-base mb-2">수동입력 (누적 시간 단위 추가)</label>
                <input type="number" class="input-base h-10 px-3 rounded" id="laserOffsetInput" value="${totalManualHours}" placeholder="예: 168 (7일)">
            </div>
            <button class="btn-text bg-surface border border-border h-10 px-6 text-[10px] rounded hover:!text-primary" onclick="saveLaserOffset('${escapeHtml(name)}')">시간 저장</button>
        </div>
        
        <div class="mb-4">
            <div class="flex items-center justify-between mb-2">
                <div>
                    <span class="label-base !mb-0">현재 누적 사용시간</span>
                    <p class="text-2xl font-black text-primary mt-1">${hasRecord ? `${displayDays}일 / ${totalHours}시간 사용 중` : '기록 없음'}</p>
                    ${l.replaceDate ? `<p class="text-xs text-text-muted mt-1">기준 시작일: <span class="font-mono">${l.replaceDate.replace('T', ' ')}</span></p>` : ''}
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6 p-4 bg-background border border-border rounded">
            <div><span class="label-base mb-1">Laser Head S/N</span><input class="input-base h-9 px-2 rounded text-xs" id="laserHeadSN" value="${escapeHtml(l.headSN || '')}" placeholder="Head S/N"></div>
            <div><span class="label-base mb-1">P/S S/N</span><input class="input-base h-9 px-2 rounded text-xs" id="laserPsSN" value="${escapeHtml(l.psSN || '')}" placeholder="P/S S/N"></div>
            <div><span class="label-base mb-1">Diode S/N</span><input class="input-base h-9 px-2 rounded text-xs" id="laserDiodeSN" value="${escapeHtml(l.diodeSN || '')}" placeholder="Diode S/N"></div>
        </div>

        <div class="border-t border-border pt-6 mt-6">
            <div class="flex items-center justify-between mb-3">
                <span class="label-base !mb-0">새 Laser 교체 등록</span>
                <span class="text-[10px] text-text-muted">교체 완료 시 기존 기록은 아래 이력에 보관됩니다</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end bg-background p-4 border border-border rounded">
                <div>
                    <label class="label-base mb-2">교체 일시</label>
                    <input type="datetime-local" class="input-base h-10 px-3 rounded" id="newLaserDate" value="${localDatetimeValue(new Date())}">
                </div>
                <button class="btn-primary h-10 text-[10px] rounded" onclick="completeLaserReplace('${escapeHtml(name)}')">이력 추가 및 교체완료</button>
            </div>
        </div>

        <div class="mt-6">
            <span class="label-base mb-3">Laser 교체 히스토리</span>
            ${l.history && l.history.length > 0 ? `
                <div class="border border-border rounded overflow-hidden">
                    <table class="w-full text-xs">
                        <thead class="bg-background">
                            <tr><th class="th-base">교체일자</th><th class="th-base">사용기간</th><th class="th-base">Head S/N</th><th class="th-base">P/S S/N</th><th class="th-base">Diode S/N</th><th class="th-base text-right">관리</th></tr>
                        </thead>
                        <tbody>
                            ${l.history.slice().reverse().map((h, rIdx) => {
                                const originalIndex = l.history.length - 1 - rIdx;
                                const hHours = h.usedHours !== undefined ? h.usedHours : (h.usedDays ? h.usedDays * 24 : 0);
                                const hDays = Math.floor(hHours / 24);
                                return `<tr class="border-t border-border hover:bg-background/40"><td class="td-base font-mono">${escapeHtml((h.date || '-').replace('T', ' '))}</td><td class="td-base font-bold text-primary">${hDays}일 (${hHours}시간)</td><td class="td-base font-mono">${escapeHtml(h.headSN || '-')}</td><td class="td-base font-mono">${escapeHtml(h.psSN || '-')}</td><td class="td-base font-mono">${escapeHtml(h.diodeSN || '-')}</td><td class="td-base text-right"><button class="btn-text hover:!text-red-600 ml-2" onclick="deleteLaserHistory('${escapeHtml(name)}', ${originalIndex})">삭제</button></td></tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            ` : '<p class="text-text-muted text-xs">이전 교체 이력이 없습니다.</p>'}
        </div>
    `;
}

function saveLaserOffset(name) {
    const val = parseInt(document.getElementById('laserOffsetInput').value) || 0;
    const data = getMaintData(name);
    data.laser.offsetHours = val;
    data.laser.offsetDays = Math.floor(val / 24);
    data.laser.headSN = document.getElementById('laserHeadSN').value.trim();
    data.laser.psSN = document.getElementById('laserPsSN').value.trim();
    data.laser.diodeSN = document.getElementById('laserDiodeSN').value.trim();
    saveMaintData(name, data);
    renderLaserSection(name);
    showToast("저장 완료", "Laser 정보 및 누적 시간이 저장되었습니다.");
}

function completeLaserReplace(name) {
    const newDate = document.getElementById('newLaserDate').value;
    if (!newDate) { showToast("오류", "교체 일시를 입력해주세요."); return; }
    const data = getMaintData(name);
    const l = data.laser;

    if (l.replaceDate) {
        const auto = elapsedParts(l.replaceDate);
        const manualHours = l.offsetHours !== undefined ? l.offsetHours : (l.offsetDays ? l.offsetDays * 24 : 0);
        const totalHours = (auto.days * 24) + auto.hours + manualHours;
        l.history.push({
            date: l.replaceDate,
            usedDays: Math.floor(totalHours / 24),
            usedHours: totalHours,
            headSN: l.headSN || "-",
            psSN: l.psSN || "-",
            diodeSN: l.diodeSN || "-"
        });
    }

    l.replaceDate = newDate;
    l.offsetHours = 0;
    l.offsetDays = 0;
    l.headSN = document.getElementById('laserHeadSN').value.trim();
    l.psSN = document.getElementById('laserPsSN').value.trim();
    l.diodeSN = document.getElementById('laserDiodeSN').value.trim();
    saveMaintData(name, data);
    renderLaserSection(name);
    showToast("교체 완료", "새 Laser 기준일이 설정되고 이전 기록이 이력에 보관되었습니다.");
}

function deleteLaserHistory(name, index) {
    if (!confirm('이 교체 이력을 삭제하시겠습니까?')) return;
    const data = getMaintData(name);
    data.laser.history.splice(index, 1);
    saveMaintData(name, data);
    renderLaserSection(name);
    showToast("삭제 완료", "교체 이력이 삭제되었습니다.");
}

/** Scale Head 5개 축 유지보수 섹션 렌더링 */
function toggleScaleHeadHistory(key) { 
    document.getElementById(`scaleHeadHist_${key}`).classList.toggle('hidden'); 
}

function saveScaleHeadAxisDate(name, key, value) {
    const data = getMaintData(name);
    data.scaleHead[key].replaceDate = value || null;
    const snInput = document.getElementById(`scaleHeadSn_${key}`);
    if (snInput) data.scaleHead[key].sn = snInput.value.trim();
    saveMaintData(name, data);
    renderScaleHeadSection(name);
    showToast("저장 완료", `Scale Head [${key}] 축 교체일이 저장되었습니다.`);
}

function renderScaleHeadSection(name) {
    const data = getMaintData(name);
    const wrap = document.getElementById('detailScaleHeadWrap');
    wrap.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${SCALE_AXES.map(a => {
                const item = data.scaleHead[a.key] || { replaceDate: null, history: [] };
                const days = daysSince(item.replaceDate);
                const hasDate = !!item.replaceDate;
                const histCount = item.history ? item.history.length : 0;
                return `
                    <div class="card-base p-4 rounded-md border border-border bg-background/50 flex flex-col justify-between">
                        <div>
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-sm font-black text-primary">${a.label} 축</span>
                                <span class="text-xs font-bold ${hasDate ? 'text-primary' : 'text-text-muted'}">${hasDate ? `${days}일 사용 중` : '기록 없음'}</span>
                            </div>
                            <div class="space-y-2 mb-3">
                                <div><label class="label-base mb-1 text-[10px]">교체일자</label><input type="date" class="input-base h-8 px-2 text-xs rounded" id="scaleHeadDate_${a.key}" value="${item.replaceDate || ''}" onchange="saveScaleHeadAxisDate('${escapeHtml(name)}', '${a.key}', this.value)"></div>
                                <div><label class="label-base mb-1 text-[10px]">Scale Head S/N</label><input class="input-base h-8 px-2 text-xs rounded" id="scaleHeadSn_${a.key}" value="${escapeHtml(item.sn || '')}" placeholder="S/N" onchange="saveScaleHeadAxisDate('${escapeHtml(name)}', '${a.key}', document.getElementById('scaleHeadDate_${a.key}').value)"></div>
                            </div>
                        </div>
                        <div class="border-t border-border/50 pt-2 flex items-center justify-between">
                            <button class="btn-text text-[10px]" onclick="toggleScaleHeadHistory('${a.key}')">이력 (${histCount}건)</button>
                            <button class="btn-text text-[10px] text-primary hover:underline" onclick="completeScaleHeadReplace('${escapeHtml(name)}', '${a.key}')">교체완료</button>
                        </div>
                        <div id="scaleHeadHist_${a.key}" class="hidden mt-2 pt-2 border-t border-border/50 text-[10px] space-y-1">
                            ${histCount > 0 ? item.history.slice().reverse().map((h, hIdx) => {
                                const originalIndex = item.history.length - 1 - hIdx;
                                return `<div class="flex justify-between items-center text-text-muted"><span>${escapeHtml(h.date)} (${escapeHtml(h.sn || '-')})</span><button class="text-red-500 hover:underline" onclick="deleteScaleHeadHistory('${escapeHtml(name)}', '${a.key}', ${originalIndex})">삭제</button></div>`;
                            }).join('') : '<p class="text-text-muted">이전 이력 없음</p>'}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function completeScaleHeadReplace(name, key) {
    const input = document.getElementById(`scaleHeadDate_${key}`);
    const snInput = document.getElementById(`scaleHeadSn_${key}`);
    const dateVal = input ? input.value : '';
    const snVal = snInput ? snInput.value.trim() : '';
    if (!dateVal) { showToast("오류", "교체일자를 먼저 선택해주세요."); return; }
    
    const data = getMaintData(name);
    const target = data.scaleHead[key];
    if (target.replaceDate) {
        target.history.push({ date: target.replaceDate, sn: target.sn || '-' });
    }
    const today = new Date().toISOString().slice(0, 10);
    target.replaceDate = today;
    if (snVal) target.sn = snVal;
    saveMaintData(name, data);
    renderScaleHeadSection(name);
    showToast("교체 완료", `[${key}] 축이 오늘(${today}) 일자로 갱신되었습니다.`);
}

function deleteScaleHeadHistory(name, key, index) {
    if (!confirm('이 교체 이력을 삭제하시겠습니까?')) return;
    const data = getMaintData(name);
    data.scaleHead[key].history.splice(index, 1);
    saveMaintData(name, data);
    renderScaleHeadSection(name);
    showToast("삭제 완료", "이력이 삭제되었습니다.");
}

/** 기타 소모품 (Consumables) 섹션 렌더링 및 관리 */
function renderConsumablesSection(name) {
    const data = getMaintData(name);
    const list = data.consumables || [];
    const wrap = document.getElementById('detailConsumablesWrap');
    wrap.innerHTML = `
        <div class="mb-4 bg-background p-4 border border-border rounded flex flex-wrap gap-3 items-end">
            <div class="flex-1 min-w-[140px]"><label class="label-base mb-1 text-[10px]">부품명</label><input class="input-base h-9 px-2 text-xs rounded" id="newConsumName" placeholder="예: Mirror, Lens"></div>
            <div class="w-36"><label class="label-base mb-1 text-[10px]">교체일자</label><input type="date" class="input-base h-9 px-2 text-xs rounded" id="newConsumDate" value="${new Date().toISOString().slice(0, 10)}"></div>
            <div class="flex-[2] min-w-[180px]"><label class="label-base mb-1 text-[10px]">메모 (선택)</label><input class="input-base h-9 px-2 text-xs rounded" id="newConsumNote" placeholder="비고 / 작업자 등"></div>
            <button class="btn-primary h-9 px-4 text-[10px] rounded" onclick="addConsumableEntry('${escapeHtml(name)}')">추가</button>
        </div>
        ${list.length > 0 ? `
            <div class="border border-border rounded overflow-hidden">
                <table class="w-full text-xs">
                    <thead class="bg-background">
                        <tr><th class="th-base">부품명</th><th class="th-base">교체일자</th><th class="th-base">경과일</th><th class="th-base">메모</th><th class="th-base text-right">삭제</th></tr>
                    </thead>
                    <tbody>
                        ${list.slice().reverse().map(item => `
                            <tr class="border-t border-border hover:bg-background/40">
                                <td class="td-base font-bold text-text-main">${escapeHtml(item.name)}</td>
                                <td class="td-base font-mono">${escapeHtml(item.date)}</td>
                                <td class="td-base text-text-muted">${daysSince(item.date)}일 경과</td>
                                <td class="td-base text-text-muted">${escapeHtml(item.note || '-')}</td>
                                <td class="td-base text-right"><button class="btn-text hover:!text-red-600" onclick="deleteConsumableEntry('${escapeHtml(name)}', '${item.id}')">삭제</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        ` : '<p class="text-text-muted text-xs">등록된 소모품 교환 이력이 없습니다.</p>'}
    `;
}

function addConsumableEntry(name) {
    const cName = document.getElementById('newConsumName').value.trim();
    const cDate = document.getElementById('newConsumDate').value;
    const cNote = document.getElementById('newConsumNote').value.trim();
    if (!cName) { showToast("오류", "부품명을 입력해주세요."); return; }
    if (!cDate) { showToast("오류", "교체일자를 선택해주세요."); return; }
    
    const data = getMaintData(name);
    data.consumables.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: cName,
        date: cDate,
        note: cNote,
        savedAt: new Date().toISOString()
    });
    saveMaintData(name, data);
    renderConsumablesSection(name);
    showToast("추가 완료", `[${cName}] 소모품 교환 이력이 등록되었습니다.`);
}

function deleteConsumableEntry(name, id) {
    if (!confirm('삭제하시겠습니까?')) return;
    const data = getMaintData(name);
    data.consumables = data.consumables.filter(c => c.id !== id);
    saveMaintData(name, data);
    renderConsumablesSection(name);
}


// ==============================================================================
