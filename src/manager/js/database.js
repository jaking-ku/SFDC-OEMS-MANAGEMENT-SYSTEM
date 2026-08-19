// 6. [Business: Management] 설비 마스터 데이터, 수신처 목록 및 SFDC 검색 연동
// ==============================================================================

/** 설비 상세 페이지 열기 */
function openEquipDetail(sn) {
    const data = JSON.parse(localStorage.getItem("equipmentData") || "[]");
    const eq = data.find(d => d.sn === sn);
    if (!eq) { 
        showToast("오류", "해당 설비를 찾을 수 없습니다."); 
        return; 
    }
    window.location.hash = `detail-${encodeURIComponent(sn)}`;
    document.querySelectorAll('.tab-content').forEach(s => { 
        s.classList.remove('block'); 
        s.classList.add('hidden'); 
    });
    document.getElementById('equipDetail').classList.remove('hidden');
    document.getElementById('equipDetail').classList.add('block');
    document.querySelectorAll('nav a').forEach(a => { 
        a.classList.remove('nav-active', 'text-text-main'); 
        a.classList.add('text-text-muted'); 
    });
    renderEquipDetail(eq);
    if (window.innerWidth < 768) closeSidebar();
}

/** 설비 상세 페이지 닫기 (Management 탭으로 복귀) */
function closeEquipDetail() {
    window.location.hash = '';
    const dbNav = Array.from(document.querySelectorAll('nav a')).find(a => (a.getAttribute('onclick') || '').includes("'database'"));
    switchTab('database', dbNav);
}

/** 설비 상세 페이지 종합 렌더링 */
async function renderEquipDetail(eq) {
    document.getElementById('detailTitle').textContent = eq.name;
    document.getElementById('detailSubtitle').textContent = `${eq.line || '-'} Line · ${eq.model || '-'} · ${eq.location || '-'}`;
    document.getElementById('detailInfoGrid').innerHTML = `
        <div><span class="label-base">라인</span><p class="text-sm font-bold text-text-main mt-1">${escapeHtml(eq.line || '-')}</p></div>
        <div><span class="label-base">모델명</span><p class="text-sm font-bold text-text-main mt-1">${escapeHtml(eq.model || '-')}</p></div>
        <div><span class="label-base">S/N</span><p class="text-sm font-mono text-text-main mt-1">${escapeHtml(eq.sn || '-')}</p></div>
        <div><span class="label-base">위치</span><p class="text-sm font-bold text-text-main mt-1">${escapeHtml(eq.location || '-')}</p></div>
    `;
    
    const wrap = document.getElementById('detailHistoryWrap');
    wrap.innerHTML = '<p class="text-text-muted text-xs">불러오는 중...</p>';
    
    const raw = await getIDBHistory();
    const entries = raw
        .filter(e => !e.isDeleted && (e.sn === eq.sn || (!e.sn && e.machine === eq.name)))
        .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

    if (entries.length === 0) {
        wrap.innerHTML = '<p class="text-text-muted text-xs">등록된 작업 이력이 없습니다.</p>';
    } else {
        const ul = document.createElement('ul'); 
        ul.className = 'relative space-y-0 pl-8';
        ul.innerHTML = '<div class="timeline-line"></div>';
        
        entries.forEach((e, idx) => {
            const li = document.createElement('li'); 
            li.className = 'timeline-item relative flex gap-5 pb-8'; 
            li.style.animationDelay = `${idx * 50}ms`;
            
            const d = new Date(e.savedAt); 
            const savedStr = `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
            
            li.innerHTML = `
                <div class="timeline-dot mt-1"></div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="px-2 py-0.5 border border-border text-primary text-[10px] font-bold rounded">EVENT</span>
                        <span class="text-sm font-black text-text-main">${escapeHtml(e.date || '날짜 미상')}</span>
                    </div>
                    <div class="${e.rawText ? 'cursor-pointer hover:text-primary transition-colors' : ''}" ${e.rawText ? `onclick="document.getElementById('detailRaw_${e.id}').classList.toggle('hidden')"` : ''}>
                        <p class="text-sm text-text-main font-medium leading-relaxed">${escapeHtml(e.content || '—')}</p>
                        ${e.rawText ? '<span class="material-symbols-outlined text-sm text-text-muted mt-1 block">open_in_full</span>' : ''}
                    </div>
                    ${e.rawText ? `<div id="detailRaw_${e.id}" class="hidden mt-3 p-4 bg-background/70 text-text-main border border-border text-xs leading-relaxed whitespace-pre-wrap rounded backdrop-blur-sm">${escapeHtml(e.rawText)}</div>` : ''}
                    <div class="mt-3 text-[10px] text-text-muted flex gap-3 items-center flex-wrap">
                        <span>👤 ${escapeHtml(e.worker || '—')}</span>
                        <span>⏱️ Recorded: ${savedStr}</span>
                        <button class="ml-2 bg-text-main text-surface px-2 py-1 rounded hover:bg-primary font-bold transition-colors" onclick="loadToMailGen('${escapeHtml(eq.name)}', '${escapeHtml(e.content).replace(/'/g, "\\'")}')">메일 작성</button>
                    </div>
                </div>
            `;
            ul.appendChild(li);
        });
        wrap.innerHTML = ''; 
        wrap.appendChild(ul);
    }
    
    renderLaserSection(eq.sn);
    renderScaleHeadSection(eq.sn);
    renderConsumablesSection(eq.sn);
}

/** 설비 마스터 테이블 렌더링 */
function renderTable() { 
    const tbody = document.getElementById("dataTableBody"); 
    const raw = JSON.parse(localStorage.getItem("equipmentData") || "[]"); 
    tbody.innerHTML = ""; 
    
    const data = raw.map((item, i) => ({ item, i }))
        .sort((a, b) => a.item.line.localeCompare(b.item.line, 'ko', { numeric: true }) || a.i - b.i); 
    
    data.forEach(({ item, i }) => { 
        if (item.isEditing) { 
            tbody.innerHTML += `
                <tr class="bg-background/60">
                    <td class="td-base px-6"><input class="input-base h-8 px-2 rounded" id="editLine_${i}" value="${escapeHtml(item.line)}"></td>
                    <td class="td-base px-6"><input class="input-base h-8 px-2 rounded" id="editModel_${i}" value="${escapeHtml(item.model)}"></td>
                    <td class="td-base px-6"><input class="input-base h-8 px-2 rounded" id="editName_${i}" value="${escapeHtml(item.name)}"></td>
                    <td class="td-base px-6"><input class="input-base h-8 px-2 rounded" id="editSN_${i}" value="${escapeHtml(item.sn)}"></td>
                    <td class="td-base px-6"><input class="input-base h-8 px-2 rounded" id="editLoc_${i}" value="${escapeHtml(item.location)}"></td>
                    <td class="td-base px-6"><div class="flex items-center justify-end gap-3"><button class="btn-primary px-3 py-1 text-[10px] rounded" onclick="saveEdit(${i})">Save</button></div></td>
                </tr>
            `; 
        } else { 
            tbody.innerHTML += `
                <tr class="hover:bg-background/40 transition-colors">
                    <td class="td-base px-6 font-medium">${escapeHtml(item.line)}</td>
                    <td class="td-base px-6 text-text-muted">${escapeHtml(item.model)}</td>
                    <td class="td-base px-6 text-primary font-bold equip-link cursor-pointer hover:underline" data-sn="${escapeHtml(item.sn)}">${escapeHtml(item.name)}</td>
                    <td class="td-base px-6 text-xs text-text-muted font-mono">${escapeHtml(item.sn)}</td>
                    <td class="td-base px-6 text-text-muted">${escapeHtml(item.location)}</td>
                    <td class="td-base px-6"><div class="flex items-center justify-end gap-3"><button class="btn-text" onclick="enableEdit(${i})">Edit</button><button class="btn-text hover:!text-red-600" onclick="deleteData(${i})">Del</button></div></td>
                </tr>
            `; 
        } 
    }); 

    tbody.querySelectorAll(".equip-link").forEach(el => {
        el.addEventListener("click", () => { 
            if (!el.dataset.sn) { 
                showToast("오류", "S/N이 없는 설비는 상세페이지를 열 수 없습니다. S/N을 먼저 입력해주세요."); 
                return; 
            } 
            openEquipDetail(el.dataset.sn); 
        });
    }); 
    filterTable(); 
}

/** 설비 테이블 검색 필터 */
function filterTable() { 
    const v = document.getElementById("searchInput").value.toLowerCase(); 
    const r = document.getElementById("dataTableBody").getElementsByTagName("tr"); 
    for (let x of r) {
        x.style.display = x.innerText.toLowerCase().includes(v) ? "" : "none";
    }
}

/** 설비 인라인 편집 모드 활성화 */
function enableEdit(i) { 
    const d = JSON.parse(localStorage.getItem("equipmentData") || "[]"); 
    d[i].isEditing = true; 
    localStorage.setItem("equipmentData", JSON.stringify(d)); 
    renderTable(); 
}

/** 설비 인라인 편집 저장 */
function saveEdit(i) { 
    const d = JSON.parse(localStorage.getItem("equipmentData") || "[]"); 
    const oldSN = d[i].sn; 
    const newSN = document.getElementById(`editSN_${i}`).value.trim(); 
    
    d[i] = { 
        line: document.getElementById(`editLine_${i}`).value.trim(), 
        model: document.getElementById(`editModel_${i}`).value.trim(), 
        name: document.getElementById(`editName_${i}`).value.trim(), 
        sn: newSN, 
        location: document.getElementById(`editLoc_${i}`).value.trim(), 
        isEditing: false 
    }; 
    
    localStorage.setItem("equipmentData", JSON.stringify(d)); 
    renderTable(); 
    autoMergeAndSave({ scope: 'equipment' }); 
    if (oldSN && newSN && oldSN !== newSN) {
        migrateEquipmentSN(oldSN, newSN); 
    }
}

/** 엑셀 붙여넣기 텍스트 대량 등록 */
function importFromExcel() { 
    const v = document.getElementById("excelInput").value.trim(); 
    if (!v) return; 
    const d = JSON.parse(localStorage.getItem("equipmentData") || "[]"); 
    let added = 0; 
    
    v.split('\n').forEach(r => { 
        const c = r.split('\t'); 
        if (c.length >= 3) { 
            d.push({
                line: c[0]?.trim() || "",
                model: c[1]?.trim() || "",
                name: c[2]?.trim() || "",
                sn: c[3]?.trim() || "",
                location: c[4]?.trim() || ""
            }); 
            added++; 
        } 
    }); 
    
    if (added > 0) { 
        localStorage.setItem("equipmentData", JSON.stringify(d)); 
        renderTable(); 
        document.getElementById("excelInput").value = ""; 
        showToast("등록 완료", `${added}개 설비가 추가되었습니다.`); 
        autoMergeAndSave({ scope: 'equipment' }); 
    } 
}

/** 단일 설비 추가 */
function addNewData() { 
    const name = document.getElementById("newName").value.trim(); 
    if (!name) return alert("호기명은 필수입니다."); 
    const d = JSON.parse(localStorage.getItem("equipmentData") || "[]"); 
    d.push({
        line: document.getElementById("newLine").value, 
        model: document.getElementById("newModel").value, 
        name: name, 
        sn: document.getElementById("newSN").value, 
        location: document.getElementById("newLocation").value
    }); 
    localStorage.setItem("equipmentData", JSON.stringify(d)); 
    renderTable(); 
    autoMergeAndSave({ scope: 'equipment' }); 
}

/** 단일 설비 삭제 */
function deleteData(i) { 
    if (confirm("정말 이 설비를 삭제하시겠습니까?")) { 
        const d = JSON.parse(localStorage.getItem("equipmentData") || "[]"); 
        d.splice(i, 1); 
        localStorage.setItem("equipmentData", JSON.stringify(d)); 
        renderTable(); 
        autoMergeAndSave({ scope: 'equipment' }); 
    } 
}

/** 수신처 테이블 렌더링 */
function renderRecipientTable() { 
    const tbody = document.getElementById("recipientTableBody"); 
    const data = JSON.parse(localStorage.getItem("recipientData") || "{}"); 
    tbody.innerHTML = ""; 
    
    Object.keys(data).sort().forEach(line => { 
        tbody.innerHTML += `
            <tr class="hover:bg-background/40 transition-colors">
                <td class="td-base font-medium px-6">${escapeHtml(line)}</td>
                <td class="td-base text-text-muted px-6" id="recip_${line}">${escapeHtml(data[line])}</td>
                <td class="td-base px-6">
                    <div class="flex items-center justify-end gap-3">
                        <button class="btn-text" onclick="copyRecipient('${line}')">Copy</button>
                        <button class="btn-text" onclick="editRecipient('${line}')">Edit</button>
                        <button class="btn-text hover:!text-red-600" onclick="deleteRecipient('${line}')">Del</button>
                    </div>
                </td>
            </tr>
        `; 
    }); 
}

function copyRecipient(l) { 
    const d = JSON.parse(localStorage.getItem("recipientData") || "{}"); 
    const rawData = d[l] || ""; 
    navigator.clipboard.writeText(rawData).then(() => showToast("복사 완료", `[${l}] 수신처가 복사되었습니다.`)); 
}
function editRecipient(l) { 
    const d = JSON.parse(localStorage.getItem("recipientData") || "{}"); 
    const n = prompt(`[${l}] 라인 수신처 수정:`, d[l]); 
    if (n !== null && n.trim()) { 
        d[l] = n.trim(); 
        localStorage.setItem("recipientData", JSON.stringify(d)); 
        renderRecipientTable(); 
        autoMergeAndSave({ scope: 'recipient' }); 
    } 
}
function addRecipient() { 
    const l = document.getElementById("newRecipLine").value.trim().toUpperCase();
    const e = document.getElementById("newRecipEmails").value.trim(); 
    if (!l || !e) return alert("라인과 이메일을 모두 입력하세요."); 
    const d = JSON.parse(localStorage.getItem("recipientData") || "{}"); 
    d[l] = e; 
    localStorage.setItem("recipientData", JSON.stringify(d)); 
    renderRecipientTable(); 
    autoMergeAndSave({ scope: 'recipient' }); 
}
function deleteRecipient(l) { 
    if (confirm(`[${l}] 라인의 수신처를 삭제하시겠습니까?`)) { 
        const d = JSON.parse(localStorage.getItem("recipientData") || "{}"); 
        delete d[l]; 
        localStorage.setItem("recipientData", JSON.stringify(d)); 
        renderRecipientTable(); 
        autoMergeAndSave({ scope: 'recipient' }); 
    } 
}

/** 🔎 Salesforce Lightning 전용 Base64 URL 검색 생성기 */
function searchSalesforce() {
    const query = document.getElementById('sfSearchInput').value.trim();
    if (!query) { alert("검색어를 입력해주세요."); return; }
    
    const sfData = {
        "componentDef": "forceSearch:searchPageDesktop",
        "attributes": {
            "term": query,
            "scopeMap": { "type": "TOP_RESULTS" },
            "context": {
                "FILTERS": {},
                "searchSource": "ASSISTANT_DIALOG",
                "disableIntentQuery": false,
                "disableSpellCorrection": false
            },
            "groupId": "DEFAULT"
        },
        "state": {}
    };
    
    const jsonString = JSON.stringify(sfData);
    const encodedData = btoa(unescape(encodeURIComponent(jsonString)));
    const targetPath = "/one/one.app#" + encodedData;
    const sfSearchUrl = "https://hht.my.salesforce.com/?startURL=" + encodeURIComponent(targetPath);
    
    window.open(sfSearchUrl, "_blank");
}


// ==============================================================================
