// 7. [UI & View Renderers] 화면 전환, 렌더링, 타임라인, 다크모드 및 유틸리티
// ==============================================================================

/** 테마 및 UI 유틸리티 */
function toggleDarkMode() { 
    const h = document.documentElement; 
    h.classList.toggle('dark'); 
    const is = h.classList.contains('dark'); 
    localStorage.setItem('darkMode', is ? 'yes' : 'no'); 
    document.getElementById('darkModeIcon').innerText = is ? 'light_mode' : 'dark_mode'; 
    const mobileIcon = document.getElementById('darkModeIconMobile'); 
    if (mobileIcon) mobileIcon.innerText = is ? 'light_mode' : 'dark_mode'; 
}
function initTheme() { 
    if (localStorage.getItem('darkMode') === 'yes') { 
        document.documentElement.classList.add('dark'); 
        document.getElementById('darkModeIcon').innerText = 'light_mode'; 
    } 
}
function openSidebar() { 
    document.getElementById('sidebar').classList.add('open'); 
    document.getElementById('sidebar-overlay').style.display = 'block'; 
}
function closeSidebar() { 
    document.getElementById('sidebar').classList.remove('open'); 
    document.getElementById('sidebar-overlay').style.display = 'none'; 
}
function switchTab(t, e) { 
    document.querySelectorAll('.tab-content').forEach(s => { 
        s.classList.remove('block'); 
        s.classList.add('hidden'); 
    }); 
    document.getElementById(t).classList.remove('hidden'); 
    document.getElementById(t).classList.add('block'); 
    document.querySelectorAll('nav a').forEach(a => { 
        a.classList.remove('nav-active', 'text-text-main'); 
        a.classList.add('text-text-muted'); 
    }); 
    if (e) {
        e.classList.remove('text-text-muted'); 
        e.classList.add('nav-active', 'text-text-main'); 
    }
    if (t === 'history') renderHistory(); 
    if (window.innerWidth < 768) closeSidebar(); 
}
function showToast(t, m) { 
    const ts = document.getElementById('toast'); 
    document.getElementById('toast-title').innerText = t; 
    document.getElementById('toast-msg').innerText = m; 
    ts.classList.remove('translate-y-32', 'opacity-0'); 
    setTimeout(() => ts.classList.add('translate-y-32', 'opacity-0'), 3000); 
}
function escapeHtml(s) { 
    return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); 
}
function copyRow() { 
    const t = `${document.getElementById("resDate").innerText}\t${document.getElementById("resMachine").innerText}\t${document.getElementById("resLine").innerText}\t${document.getElementById("resContent").innerText}\t${document.getElementById("resWorker").innerText}`; 
    navigator.clipboard.writeText(t).then(() => showToast("복사 완료", "데이터가 복사되었습니다.")); 
}
function copyToClipboard(id, type) { 
    navigator.clipboard.writeText(document.getElementById(id).innerText).then(() => showToast("복사 완료", `${type} 복사됨`)); 
}

/** 사이드바 히스토리 개수 배지 업데이트 */
async function updateHistoryBadge() { 
    const raw = await getIDBHistory();
    const h = raw.filter(e => !e.isDeleted); 
    const b = document.getElementById("historyBadge"); 
    if (h.length > 0) { 
        b.textContent = h.length; 
        b.classList.remove("hidden"); 
    } else {
        b.classList.add("hidden"); 
    }
}

/** 설비별 특이사항 / 메모 저장 */
function saveMachineNote(m, t) { 
    let ns = JSON.parse(localStorage.getItem("machineNotes") || "{}"); 
    ns[m] = t.trim(); 
    localStorage.setItem("machineNotes", JSON.stringify(ns)); 
    showToast("메모 저장", `[${m}] 특이사항이 저장되었습니다.`); 
    autoMergeAndSave({ scope: 'notes' }); 
}

/** 🕒 작업 히스토리 타임라인 및 설비 칩 아코디언 렌더링 */
async function renderHistory() {
    const raw = await getIDBHistory();
    const searchVal = (document.getElementById("historySearch")?.value || "").toLowerCase();
    const sortOrder = document.getElementById("historySortOrder")?.value || "desc";
    const chipsWrap = document.getElementById("historyEquipChips");
    const timelineWrap = document.getElementById("historyTimelineWrap");
    const emptyEl = document.getElementById("historyEmpty");
    
    const filtered = raw.filter(e => !e.isDeleted && (
        e.machine.toLowerCase().includes(searchVal) || 
        e.content.toLowerCase().includes(searchVal) || 
        (e.worker || "").toLowerCase().includes(searchVal) || 
        (e.rawText || "").toLowerCase().includes(searchVal)
    ));
    
    if (filtered.length === 0) { 
        chipsWrap.innerHTML = ""; 
        timelineWrap.innerHTML = ""; 
        emptyEl.classList.remove("hidden"); 
        return; 
    }
    emptyEl.classList.add("hidden");

    // 라인별 설비 그룹화
    const lineMap = {}; 
    let firstMachine = null;
    filtered.forEach(e => { 
        const line = e.line || "미분류"; 
        if (!lineMap[line]) lineMap[line] = {}; 
        if (!lineMap[line][e.machine]) lineMap[line][e.machine] = 0; 
        lineMap[line][e.machine]++; 
        if (!firstMachine) firstMachine = e.machine; 
    });

    let selectedLine = null; 
    let isSelectedValid = false; 
    for (let l in lineMap) { 
        if (lineMap[l][selectedChip]) { 
            isSelectedValid = true; 
            selectedLine = l; 
            break; 
        } 
    }
    if (!selectedChip || !isSelectedValid) selectedChip = firstMachine; 
    for (let l in lineMap) { 
        if (lineMap[l][selectedChip]) { 
            selectedLine = l; 
            break; 
        } 
    }

    // 칩 아코디언 렌더링
    chipsWrap.innerHTML = ""; 
    chipsWrap.className = "flex flex-col gap-2 p-4 w-full";
    Object.keys(lineMap).sort().forEach(line => {
        const ms = lineMap[line];
        const mks = Object.keys(ms).sort();
        const isOpen = line === selectedLine;

        const groupDiv = document.createElement("div"); 
        groupDiv.className = `border border-border/50 rounded overflow-hidden transition-colors ${isOpen ? 'accordion-open' : ''}`;
        
        const headerBtn = document.createElement("button"); 
        headerBtn.className = "w-full px-4 py-3 bg-background/50 flex justify-between items-center hover:opacity-80 text-left";
        headerBtn.onclick = function() { this.parentElement.classList.toggle('accordion-open'); };
        headerBtn.innerHTML = `
            <span class="label-base text-text-main !mb-0 flex items-center gap-2">
                <span class="material-symbols-outlined text-base text-primary">factory</span> ${escapeHtml(line)} 
                <span class="bg-primary text-white text-[9px] px-1.5 py-0.5 rounded">${mks.reduce((sum, m) => sum + ms[m], 0)}건</span>
            </span>
            <span class="material-symbols-outlined accordion-rotate text-text-main">expand_more</span>
        `;
        
        const contentDiv = document.createElement("div"); 
        contentDiv.className = "accordion-content bg-surface/50";
        
        const chipsContainer = document.createElement("div"); 
        chipsContainer.className = "p-4 flex flex-wrap gap-2 border-t border-border/50";
        
        mks.forEach(m => {
            const active = m === selectedChip; 
            const chip = document.createElement("button");
            chip.className = `px-4 py-2 text-xs font-bold uppercase tracking-widest border transition-all flex items-center gap-2 rounded ${active ? "bg-primary text-white border-primary" : "bg-surface/50 text-text-muted border-border hover:border-primary hover:text-primary"}`;
            chip.innerHTML = `
                <span class="material-symbols-outlined text-sm">precision_manufacturing</span> ${escapeHtml(m)} 
                <span class="ml-1 ${active ? 'bg-surface text-primary' : 'bg-background text-text-muted'} text-[9px] font-black px-1.5 py-0.5 rounded">${ms[m]}</span>
            `;
            chip.onclick = () => { selectedChip = m; renderHistory(); }; 
            chipsContainer.appendChild(chip);
        });
        
        contentDiv.appendChild(chipsContainer); 
        groupDiv.appendChild(headerBtn); 
        groupDiv.appendChild(contentDiv); 
        chipsWrap.appendChild(groupDiv);
    });

    // 선택된 호기의 타임라인 렌더링
    const entries = filtered.filter(e => e.machine === selectedChip).sort((a, b) => { 
        const da = new Date(a.savedAt), db = new Date(b.savedAt); 
        return sortOrder === "desc" ? db - da : da - db; 
    });

    timelineWrap.innerHTML = ""; 
    const wrap = document.createElement("div"); 
    wrap.className = "card-base overflow-hidden rounded-md shadow-sm";
    wrap.innerHTML = `
        <div class="px-6 py-4 bg-background/50 border-b border-border flex justify-between items-center">
            <div>
                <span class="text-sm font-black text-primary uppercase tracking-widest">${escapeHtml(selectedChip)}</span>
                <span class="ml-3 text-xs text-text-muted">총 ${entries.length}건 기록</span>
            </div>
            <button class="btn-text hover:!text-red-600" onclick="deleteEquipHistory('${escapeHtml(selectedChip)}')">
                <span class="material-symbols-outlined text-sm">delete</span> 삭제
            </button>
        </div>
    `;

    // 설비 특이사항 메모 영역
    const noteDiv = document.createElement("div"); 
    noteDiv.className = "p-6 border-b border-border/50 bg-background/30";
    const noteContent = JSON.parse(localStorage.getItem("machineNotes") || "{}")[selectedChip] || "";
    const noteItems = noteContent.split(/\n\n+/).filter(s => s.trim());
    const noteListHtml = noteItems.length ? noteItems.map(item => {
        const lines = item.trim().split('\n');
        const header = lines[0];
        const body = lines.slice(1).join('\n').trim();
        return `
            <div class="border border-border rounded p-2 mb-2 bg-background text-xs">
                <div class="font-bold text-primary mb-1">${escapeHtml(header)}</div>
                ${body ? `<div class="text-text-muted whitespace-pre-wrap">${escapeHtml(body)}</div>` : ''}
            </div>
        `;
    }).join('') : '<p class="text-text-muted text-xs">등록된 특이사항이 없습니다.</p>';

    noteDiv.innerHTML = `
        <label class="label-base text-primary mb-2 flex items-center gap-1">
            <span class="material-symbols-outlined text-[16px]">edit_note</span>
            [${escapeHtml(selectedChip)}] 특이사항 및 부품차용
            <button onclick="(function(btn){
                    var rv=document.getElementById('noteReadView_${escapeHtml(selectedChip)}');
                    var ea=document.getElementById('noteEditArea_${escapeHtml(selectedChip)}');
                    var isEdit=!ea.classList.contains('hidden');
                    rv.classList.toggle('hidden');
                    ea.classList.toggle('hidden');
                    btn.textContent=isEdit?'편집':'목록';
                })(this)"
                class="ml-auto text-[10px] bg-surface border border-border px-2 py-0.5 rounded hover:bg-primary hover:text-white transition-colors">
                편집
            </button>
        </label>
        <div id="noteReadView_${escapeHtml(selectedChip)}" class="mb-3 max-h-40 overflow-y-auto">
            ${noteListHtml}
        </div>
        <textarea class="input-base h-20 p-3 resize-y rounded hidden" id="noteEditArea_${escapeHtml(selectedChip)}"
            placeholder="메모 입력\n\n새 항목은 기존 내용 아래에 이어서 작성하세요.\n예) -2026/06/11- [Laser 교체]\n상세 내용"
            onchange="saveMachineNote('${escapeHtml(selectedChip)}', this.value)">${escapeHtml(noteContent)}</textarea>
    `;
    wrap.appendChild(noteDiv);

    // 타임라인 리스트
    const body = document.createElement("div"); 
    body.className = "p-8"; 
    const ul = document.createElement("ul"); 
    ul.className = "relative space-y-0 pl-8";
    ul.innerHTML = '<div class="timeline-line"></div>';

    entries.forEach((e, idx) => {
        const li = document.createElement("li"); 
        li.className = "timeline-item relative flex gap-5 pb-8"; 
        li.style.animationDelay = `${idx * 50}ms`;
        
        const savedDate = new Date(e.savedAt); 
        const savedStr = `${savedDate.getFullYear()}.${savedDate.getMonth() + 1}.${savedDate.getDate()} ${savedDate.getHours()}:${savedDate.getMinutes()}`;
        
        li.innerHTML = `
            <div class="timeline-dot mt-1"></div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                    <span class="px-2 py-0.5 border border-border text-primary text-[10px] font-bold rounded">EVENT</span>
                    <span class="text-sm font-black text-text-main">${escapeHtml(e.date || "날짜 미상")}</span>
                </div>
                <div class="${e.rawText ? 'cursor-pointer hover:text-primary transition-colors' : ''}" ${e.rawText ? `onclick="document.getElementById('rawText_${e.id}').classList.toggle('hidden')"` : ''}>
                    <p class="text-sm text-text-main font-medium leading-relaxed">${escapeHtml(e.content || "—")}</p>
                    ${e.rawText ? '<span class="material-symbols-outlined text-sm text-text-muted mt-1 block">open_in_full</span>' : ''}
                </div>
                ${e.rawText ? `<div id="rawText_${e.id}" class="hidden mt-3 p-4 bg-background/70 text-text-main border border-border text-xs leading-relaxed whitespace-pre-wrap rounded backdrop-blur-sm">${escapeHtml(e.rawText)}</div>` : ''}
                <div class="mt-3 text-[10px] text-text-muted flex gap-3 items-center flex-wrap">
                    <span>👤 ${escapeHtml(e.worker || "—")}</span>
                    <span>⏱️ Recorded: ${savedStr}</span>
                    <button class="ml-2 bg-text-main text-surface px-2 py-1 rounded hover:bg-primary font-bold transition-colors" onclick="loadToMailGen('${escapeHtml(e.machine)}', '${escapeHtml(e.content).replace(/'/g, "\\'")}')">메일 작성</button>
                </div>
            </div>
            <button class="btn-text self-start mt-1 ml-2 hover:!text-red-500" onclick="deleteSingleHistory('${e.id}')">
                <span class="material-symbols-outlined text-base">close</span>
            </button>
        `;
        ul.appendChild(li);
    });

    body.appendChild(ul); 
    wrap.appendChild(body); 
    timelineWrap.appendChild(wrap);
}

/** 새 작업 이력 저장 */
async function saveHistoryEntry(entry) { 
    let history = await getIDBHistory();
    entry.id = Date.now() + "_" + Math.floor(Math.random() * 1000); 
    entry.updatedAt = Date.now();
    entry.yearMonth = getYearMonthFromDate(entry.date, entry.savedAt);
    
    if (!entry.sn) {
        const eqList = JSON.parse(localStorage.getItem("equipmentData") || "[]");
        const matched = eqList.find(eq => eq.name === entry.machine);
        if (matched && matched.sn) entry.sn = matched.sn;
    }
    
    if (history.some(e => e.machine === entry.machine && e.date === entry.date && e.content === entry.content)) return; 
    history.push(entry); 
    await putIDBHistory(history);
    await updateHistoryBadge(); 
    autoMergeAndSave({ scope: 'history', yearMonths: [entry.yearMonth] }); 
}

/** 특정 설비의 이력 일괄 삭제 (소프트 삭제) */
async function deleteEquipHistory(m) { 
    if (!confirm(`[${m}] 기록을 모두 삭제하시겠습니까?`)) return; 
    let h = await getIDBHistory();
    const affectedMonths = new Set();
    h.forEach(e => { 
        if (e.machine === m) { 
            e.isDeleted = true; 
            e.updatedAt = Date.now(); 
            affectedMonths.add(e.yearMonth || getYearMonthFromDate(e.date, e.savedAt));
        } 
    });
    await putIDBHistory(h); 
    selectedChip = null; 
    await updateHistoryBadge(); 
    await renderHistory(); 
    autoMergeAndSave({ scope: 'history', yearMonths: Array.from(affectedMonths) }); 
}

/** 단일 작업 이력 삭제 (소프트 삭제) */
async function deleteSingleHistory(id) { 
    if (!confirm("이 작업 이력을 삭제하시겠습니까?")) return; 
    let h = await getIDBHistory(); 
    let item = h.find(e => e.id === id);
    let ym = null;
    if (item) { 
        item.isDeleted = true; 
        item.updatedAt = Date.now(); 
        ym = item.yearMonth || getYearMonthFromDate(item.date, item.savedAt);
    }
    await putIDBHistory(h); 
    await updateHistoryBadge(); 
    await renderHistory(); 
    autoMergeAndSave({ scope: 'history', yearMonths: ym ? [ym] : [] }); 
}

/** 🔒 관리자 권한(비밀번호: 4437) 전체 이력 일괄 삭제 */
async function clearAllHistory() { 
    const pwd = prompt("관리자 권한이 필요합니다.\n비밀번호를 입력하세요.");
    if (pwd !== "4437") { 
        if (pwd !== null) alert("⛔ 비밀번호가 일치하지 않습니다. 일괄 삭제가 취소됩니다."); 
        return; 
    }
    if (!confirm("⚠️ [경고] 정말 모든 기록을 일괄 삭제하시겠습니까?\n이후 [Sync] 시 팀원 모두의 화면에서도 삭제 처리됩니다!")) return; 
    
    let h = await getIDBHistory();
    h.forEach(e => { 
        e.isDeleted = true; 
        e.updatedAt = Date.now(); 
    });
    await putIDBHistory(h);
    selectedChip = null; 
    await updateHistoryBadge(); 
    await renderHistory(); 
    autoMergeAndSave({ scope: 'history' }); 
}

/** 전체 데이터 초기화 */
async function resetAllData() { 
    if (!confirm("⚠️ [경고] 모든 데이터를 완전히 초기화하시겠습니까?")) return; 
    localStorage.setItem("equipmentData", "[]"); 
    localStorage.setItem("recipientData", "{}"); 
    localStorage.setItem("machineNotes", "{}"); 
    localStorage.setItem("equipMaintenance", "{}"); 
    await putIDBHistory([]);
    renderTable(); 
    renderRecipientTable(); 
    await updateHistoryBadge(); 
    if (document.getElementById('history').classList.contains('block')) await renderHistory(); 
    showToast("초기화 완료", "모든 데이터가 삭제되었습니다."); 
    autoMergeAndSave(); 
}


// ==============================================================================
