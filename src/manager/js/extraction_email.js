// 4. [Business: Extraction & Email] 작업 메일 분석/추출 및 이메일 양식 생성
// ==============================================================================

/**
 * 📩 작업 메일 텍스트 분석 및 정보 추출 (데이터 추출 실행)
 */
async function extractData() {
    if (!(await ensureFreshTeamDb())) return;
    
    const text = document.getElementById("mailInput").value; 
    if (!text.trim()) return alert("메일 내용을 입력하세요.");

    // 1) 작업일자 추출 (어떤 형태의 날짜든 YYYY/MM/DD로 정규화)
    let df = "미상";
    const dateMatch = text.match(/(\d{2,4})[\.\/\-년\s]+(\d{1,2})[\.\/\-월\s]+(\d{1,2})[일\s]*/);
    
    if (dateMatch) {
        let year = dateMatch[1];
        let month = dateMatch[2];
        let day = dateMatch[3];

        if (year.length === 2) year = "20" + year;
        month = month.padStart(2, '0');
        day = day.padStart(2, '0');

        df = `${year}/${month}/${day}`;
    }

    // 2) 라인 및 설비호기 추출
    const lm = text.match(/\b(P\d[A-Z0-9]+)\b/); 
    const line = lm ? lm[1] : "미상";
    
    let machine = "미상"; 
    const mdi = text.match(/MD[IF][A-Z]?[A-Za-z0-9]+/); 
    if (mdi) {
        machine = mdi[0];
    } else { 
        const ism = text.match(/IS[A-Za-z0-9]+/); 
        if (ism) machine = ism[0]; 
    }
    
    // 3) 작업내용 추출
    let content = "미상";
    const p1 = text.match(/(?:에서|진행한|작업한)\s+(.*?)\s+내용\s*(?:전송|공유|보내|송부)/); 
    if (p1) {
        content = p1[1].trim();
    } else { 
        const p2 = text.match(/(?:호기(?:\s*\(.*?\))?|에서|진행한|작업한|진행|확인)\s+(.*?)\s+작업\s*(?:내용)?\s*(?:전송|공유|보내|송부)/); 
        if (p2) {
            content = p2[1].trim(); 
        } else if (machine !== "미상") { 
            const p3 = text.match(new RegExp(machine + "(?:호기)?(?:\\s*\\(.*?\\))?\\s+(.*?)\\s+작업\\s*(?:의\\s*건|전송|진행|완료|내용)")); 
            if (p3) content = p3[1].trim(); 
        } 
    }
    content = content
        .replace(/\(.*?\)/g, "")
        .replace(/^(?:에서|진행한|작업한|진행|한|확인)\s+/, "")
        .replace(/\s+작업$/, "")
        .trim();
    
    // 4) 작업자 추출 (대아 여부 판별 및 히타치 서명 파싱)
    let worker = "미상";
    const workerLineMatch = text.match(/작업자\s*:?\s*([가-힣a-zA-Z].{0,60})/);
    if (workerLineMatch) {
        const wLine = workerLineMatch[1].trim();
        const hasDaea = /대아/i.test(wLine);
        const hasHitachi = /히타치|hitachi/i.test(wLine);
        if (hasDaea && !hasHitachi) {
            worker = "대아";
        }
    }
    if (worker === "미상") {
        const signMatch = text.match(/HITACHI\s*[\r\n]+\s*([가-힣]{2,4})\s*(?:배상|드림|올림)?/i);
        if (signMatch) worker = signMatch[1];
    }
    
    // 5) UI 결과 영역 출력
    document.getElementById("resDate").innerText = df; 
    document.getElementById("resMachine").innerText = machine; 
    document.getElementById("resLine").innerText = line; 
    document.getElementById("resContent").innerText = content; 
    document.getElementById("resWorker").innerText = worker; 
    document.getElementById("extractResult").style.display = "block";
    
    // 6) 유효한 설비인 경우 히스토리 저장 및 유지보수 특이사항 자동 반영
    if (machine !== "미상") { 
        await saveHistoryEntry({ 
            machine, 
            line, 
            date: df, 
            content, 
            worker, 
            rawText: text, 
            savedAt: new Date().toISOString() 
        }); 
        document.getElementById("autoSavedBadge").classList.remove("hidden"); 

        const extraNote = document.getElementById("extraNoteInput") ? document.getElementById("extraNoteInput").value.trim() : "";
        const extraCategory = document.getElementById("extraNoteCategory") ? document.getElementById("extraNoteCategory").value.trim() : "";
        
        let maintSummary = "";
        if (extraCategory) {
            maintSummary = applyExtractedMaintenance(machine, extraCategory, df);
        }
        
        if (extraNote || extraCategory) {
            let ns = JSON.parse(localStorage.getItem("machineNotes") || "{}");
            let prevNote = ns[machine] || "";
            let categoryPart = extraCategory ? `[${extraCategory}]` : "";
            let summaryPart = maintSummary ? `\n${maintSummary}` : "";
            let notePart = extraNote ? `\n${extraNote}` : "";
            let newEntry = `-${df}- ${categoryPart}${summaryPart}${notePart}`.trim();
            ns[machine] = prevNote ? (prevNote + "\n\n" + newEntry) : newEntry;
            localStorage.setItem("machineNotes", JSON.stringify(ns));
            
            document.getElementById("extraNoteInput").value = "";
            document.getElementById("extraNoteCategory").value = "";
            onExtraCategoryChange();
        }
    }
}

/** 특이사항 카테고리 선택 시 추가 입력 폼 토글 */
function onExtraCategoryChange() {
    const cat = document.getElementById("extraNoteCategory").value;
    document.getElementById("extraLaserFields").classList.toggle("hidden", cat !== "Laser 교체");
    document.getElementById("extraScaleFields").classList.toggle("hidden", cat !== "Scale Head");
    document.getElementById("extraConsumFields").classList.toggle("hidden", cat !== "기타 소모품");
}

/** 메일 추출 시 입력된 부품 교체 정보를 유지보수 데이터(S/N 키)에 자동 반영 */
function applyExtractedMaintenance(machine, category, mailDate) {
    const eqList = JSON.parse(localStorage.getItem("equipmentData") || "[]");
    const eq = eqList.find(e => e.name === machine);
    if (!eq || !eq.sn) {
        showToast("⚠️ 설비 미등록", `[${machine}] 설비가 관리 목록에 없거나 S/N이 비어있어 유지보수 이력에 반영하지 못했습니다. (노트에만 기록됨)`);
        return "";
    }
    const snKey = eq.sn;
    const dm = (mailDate || "").match(/(\d{4})[.\-\/년\s]*(\d{1,2})[.\-\/월\s]*(\d{1,2})/);
    const fallbackDate = dm ? `${dm[1]}-${String(dm[2]).padStart(2,'0')}-${String(dm[3]).padStart(2,'0')}` : new Date().toISOString().slice(0, 10);
    let summary = "";

    if (category === "Laser 교체") {
        const dtVal = document.getElementById("extraLaserDate").value || (fallbackDate + "T00:00");
        const snHead = document.getElementById("extraLaserHead").value.trim();
        const snPs = document.getElementById("extraLaserPs").value.trim();
        const snDiode = document.getElementById("extraLaserDiode").value.trim();
        const data = getMaintData(snKey); 
        const l = data.laser;

        if (l.replaceDate) {
            const oldAuto = elapsedParts(l.replaceDate);
            const oldManual = l.offsetHours !== undefined ? l.offsetHours : (l.offsetDays ? l.offsetDays * 24 : 0);
            const totalHours = (oldAuto.days * 24) + oldAuto.hours + oldManual;
            l.history.push({
                date: l.replaceDate,
                usedDays: Math.floor(totalHours / 24),
                usedHours: totalHours,
                headSN: l.headSN || "-",
                psSN: l.psSN || "-",
                diodeSN: l.diodeSN || "-"
            });
        }
        l.replaceDate = dtVal;
        l.offsetHours = 0;
        l.offsetDays = 0;
        l.headSN = snHead || l.headSN;
        l.psSN = snPs || l.psSN;
        l.diodeSN = snDiode || l.diodeSN;
        saveMaintData(snKey, data);

        document.getElementById("extraLaserDate").value = "";
        document.getElementById("extraLaserHead").value = "";
        document.getElementById("extraLaserPs").value = "";
        document.getElementById("extraLaserDiode").value = "";

        const parts = [snHead && `Head: ${snHead}`, snPs && `P/S: ${snPs}`, snDiode && `Diode: ${snDiode}`].filter(Boolean);
        summary = `교체일시: ${dtVal.replace('T', ' ')}${parts.length ? ' (' + parts.join(', ') + ')' : ''}`;
        showToast("✅ 자동 반영", `[${machine}] Laser 교체 정보가 설비 유지보수 데이터에 반영되었습니다.`);

    } else if (category === "Scale Head") {
        const data = getMaintData(snKey);
        const updatedAxes = [];
        SCALE_AXES.forEach(a => {
            const dateInput = document.getElementById(`extraShDate_${a.key}`);
            const snInput = document.getElementById(`extraShSn_${a.key}`);
            const shDate = dateInput ? dateInput.value.trim() : "";
            const shSn = snInput ? snInput.value.trim() : "";
            if (shDate) {
                const target = data.scaleHead[a.key];
                if (target.replaceDate) {
                    target.history.push({ date: target.replaceDate, sn: target.sn || "-" });
                }
                target.replaceDate = shDate;
                if (shSn) target.sn = shSn;
                updatedAxes.push(`${a.label}: ${shDate}${shSn ? ' (S/N: ' + shSn + ')' : ''}`);
                if (dateInput) dateInput.value = "";
                if (snInput) snInput.value = "";
            }
        });
        if (updatedAxes.length) {
            saveMaintData(snKey, data);
            summary = updatedAxes.join(' / ');
            showToast("✅ 자동 반영", `[${machine}] Scale Head 교체 정보가 설비 데이터에 반영되었습니다.`);
        }

    } else if (category === "기타 소모품") {
        const cName = document.getElementById("extraConsumName").value.trim();
        const cDate = document.getElementById("extraConsumDate").value.trim() || fallbackDate;
        const cNote = document.getElementById("extraConsumNote").value.trim();
        if (!cName) {
            showToast("⚠️ 부품명 누락", "소모품 부품명이 입력되지 않아 유지보수 이력에 기록하지 못했습니다.");
            return "";
        }
        const data = getMaintData(snKey);
        data.consumables.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name: cName,
            date: cDate,
            note: cNote,
            savedAt: new Date().toISOString()
        });
        saveMaintData(snKey, data);
        
        document.getElementById("extraConsumName").value = "";
        document.getElementById("extraConsumDate").value = "";
        document.getElementById("extraConsumNote").value = "";
        
        summary = `${cName} (${cDate})${cNote ? ' - ' + cNote : ''}`;
        showToast("✅ 자동 반영", `[${machine}] 소모품(${cName}) 교환 이력이 설비 정보에 반영되었습니다.`);
    }
    return summary;
}

/** 메일 템플릿 전환 ('work' 일반 보고 / 'ship' 반출 배차) */
function setTemplate(t) { 
    currentMailTemplate = t; 
    const is = t === 'work'; 
    document.getElementById('btn-tpl-work').className = `px-6 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${is ? 'bg-primary text-white' : 'bg-surface text-text-muted hover:text-primary'}`; 
    document.getElementById('btn-tpl-ship').className = `px-6 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${!is ? 'bg-primary text-white' : 'bg-surface text-text-muted hover:text-primary'}`; 
    document.getElementById('area-work-only').className = is ? 'space-y-6 block' : 'space-y-6 hidden'; 
    document.getElementById('area-ship-only').className = !is ? 'space-y-6 block' : 'space-y-6 hidden'; 
}

/** 반출 배차 메일용 장비 블록 추가 */
function addShipBlock() {
    const container = document.getElementById("ship-blocks-container"); 
    const idx = shipBlockCount++; 
    const lines = Object.keys(JSON.parse(localStorage.getItem("recipientData") || "{}")).sort(); 
    
    let opts = '<option value="">라인 선택</option>'; 
    lines.forEach(l => opts += `<option value="${l}">${l}</option>`);

    const blockDiv = document.createElement("div"); 
    blockDiv.className = "ship-block p-4 border border-border bg-background/50 rounded space-y-4 relative animate-[fadeIn_0.2s_ease-in-out]";
    blockDiv.innerHTML = `
        ${idx > 0 ? `
        <button class="btn-text absolute top-2 right-2 !text-text-muted hover:!text-red-500" onclick="this.closest('.ship-block').remove()">
            <span class="material-symbols-outlined text-sm">close</span>
        </button>` : ''}
        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="label-base mb-2">설비호기 (검색)</label>
                <input class="ship-equip input-base h-10 px-4 rounded" id="shipEquip_${idx}" placeholder="예: MDIXXXX" type="text" onkeyup="syncShipLine(${idx})"/>
            </div>
            <div>
                <label class="label-base mb-2">수신처 라인 선택</label>
                <select class="ship-line input-base h-10 px-4 rounded" id="shipLine_${idx}" onchange="updateShipCheckboxes(${idx})">${opts}</select>
            </div>
        </div>
        <div class="p-3 bg-surface/50 border border-dashed border-border rounded space-y-2">
            <label class="label-base text-primary mb-2">담당자 선택</label>
            <div id="shipCheckboxes_${idx}" class="flex flex-wrap gap-3">
                <p class="text-[10px] text-text-muted">설비를 입력하십시오.</p>
            </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="label-base mb-2">반출 품목</label>
                <input class="ship-item input-base h-10 px-4 rounded" placeholder="품목명" type="text"/>
            </div>
            <div>
                <label class="label-base mb-2">반입구 명</label>
                <input class="ship-gate input-base h-10 px-4 rounded" placeholder="예: G" type="text"/>
            </div>
            <div>
                <label class="label-base mb-2">반출 일시</label>
                <input class="ship-datetime input-base h-10 px-4 rounded" type="datetime-local"/>
            </div>
            <div>
                <label class="label-base mb-2">반출 사유</label>
                <input class="ship-reason input-base h-10 px-4 rounded" placeholder="사유" type="text"/>
            </div>
        </div>
        <div>
            <label class="label-base mb-2">S/N / 번호</label>
            <textarea class="ship-sn input-base h-16 p-4 rounded" placeholder="추가 정보"></textarea>
        </div>
    `;
    container.appendChild(blockDiv);
}

/** 반출 배차: 설비 입력 시 해당 설비의 라인 자동 매칭 */
function syncShipLine(idx) { 
    const search = document.getElementById(`shipEquip_${idx}`).value.trim().toLowerCase(); 
    const found = JSON.parse(localStorage.getItem("equipmentData") || "[]").find(i => i.name.toLowerCase() === search); 
    if (found) { 
        const lineVal = found.line.toUpperCase(); 
        const sel = document.getElementById(`shipLine_${idx}`); 
        if (sel.options.length <= 1) { 
            const ls = Object.keys(JSON.parse(localStorage.getItem("recipientData") || "{}")).sort(); 
            sel.innerHTML = '<option value="">라인 선택</option>'; 
            ls.forEach(l => { 
                const o = document.createElement("option"); 
                o.value = l; 
                o.textContent = l; 
                sel.appendChild(o); 
            }); 
        } 
        sel.value = lineVal; 
        updateShipCheckboxes(idx); 
    } 
}

/** 반출 배차: 라인 선택 시 담당자 체크박스 렌더링 */
function updateShipCheckboxes(idx) { 
    const line = document.getElementById(`shipLine_${idx}`).value; 
    const area = document.getElementById(`shipCheckboxes_${idx}`); 
    const data = JSON.parse(localStorage.getItem("recipientData") || "{}"); 
    area.innerHTML = ""; 
    
    if (!line || !data[line]) {
        area.innerHTML = '<p class="text-[10px] text-text-muted">담당자 없음</p>';
        return;
    }
    
    data[line].split(/[,;]+/).map(e => e.trim()).filter(Boolean).forEach((email, i) => { 
        const name = email.includes('<') ? email.split('<')[0].trim() : email.split('@')[0]; 
        area.innerHTML += `
            <div class="flex items-center gap-2 bg-background/50 px-3 py-1 border border-border rounded">
                <input type="checkbox" id="recip_${idx}_${i}" value="${email}" class="ship-email-check w-3 h-3 text-primary focus:ring-0">
                <label for="recip_${idx}_${i}" class="text-xs text-text-main cursor-pointer whitespace-nowrap">${name}</label>
            </div>
        `; 
    }); 
}

/** ✉️ 전체 이메일 양식 생성 및 본문/수신처 조립 */
function generateFullMail() {
    const myName = document.getElementById("mailMyName").value.trim();
    const inform = document.getElementById("mailInform").value.trim();
    if (!myName) return alert("작업자명을 입력하세요."); 
    localStorage.setItem("storedMyName", myName);

    const data = JSON.parse(localStorage.getItem("equipmentData") || "[]");
    const recipientMap = JSON.parse(localStorage.getItem("recipientData") || "{}");
    let subject = "", fullText = "";

    if (currentMailTemplate === 'work') {
        const es = document.getElementById("mailWorkEquipSearch").value.trim().toLowerCase();
        const cn = document.getElementById("mailCustName").value.trim();
        const jt = document.getElementById("mailJobTitle").value.trim();
        const jd = document.getElementById("mailDate").value.replace(/-/g, '/');
        const jdt = document.getElementById("mailJobDetail").value.trim();

        if (!es || !cn || !jt) return alert("필수 항목을 모두 입력하세요.");
        const f = data.find(i => i.name.toLowerCase() === es); 
        if (!f) return alert("등록되지 않은 설비입니다.");

        document.getElementById("resRecipientsOut").closest('.space-y-2').style.display = "block"; 
        document.getElementById("resRecipientsOut").innerText = recipientMap[f.line.toUpperCase()] || "미등록";
        
        subject = `삼성전자_${f.line} Line_${f.model}_${f.name}호기_${f.sn}_${jt} 작업 전송의 건`;
        fullText = `삼성전자 / (${cn})님\n이하 관계자 각위\n\n업무에 수고가 많으십니다.\n히타치 ${myName}입니다.\n\n${f.line} Line ${f.model} ${f.name}호기에서 진행한 ${jt} 작업 내용 전송드립니다.\n\n작업일: ${jd}\n\n작업내용 :\n${jdt}\n\n작업자 : 히타치 ${myName}\n\n인폼내용 : ${inform}\n\n이상입니다.\n\n상기 내용 중 불명확점 있으시면 연락 부탁드리겠습니다.\n\nHITACHI\n${myName} 배상`;

    } else {
        const blocks = document.querySelectorAll('.ship-block'); 
        if (blocks.length === 0) return alert("항목이 없습니다.");
        
        let allEmails = new Set();
        let ilt = "";
        let firstModel = "";
        let firstItem = "";

        for (let i = 0; i < blocks.length; i++) {
            const b = blocks[i];
            const eq = b.querySelector('.ship-equip').value.trim().toLowerCase();
            const gt = b.querySelector('.ship-gate').value.trim();
            const dtr = b.querySelector('.ship-datetime').value;
            const itm = b.querySelector('.ship-item').value.trim();
            const rea = b.querySelector('.ship-reason').value.trim();
            const sn = b.querySelector('.ship-sn').value.trim();

            if (!eq || !gt || !dtr || !itm || !rea) return alert(`${i + 1}번째 항목이 누락되었습니다.`);
            const fo = data.find(x => x.name.toLowerCase() === eq); 
            if (!fo) return alert(`${i + 1}번째 설비가 등록되어 있지 않습니다.`);

            if (i === 0) { 
                firstModel = fo.model; 
                firstItem = itm; 
            }
            
            const cbs = b.querySelectorAll('.ship-email-check:checked'); 
            if (cbs.length === 0) return alert(`${i + 1}번째 담당자를 최소 1명 선택해주세요.`);

            let be = []; 
            cbs.forEach(c => { 
                allEmails.add(c.value); 
                be.push(c.value); 
            });

            const dt = new Date(dtr);
            const fd = `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
            const pic = be.map(e => e.includes('<') ? e : `${e.split('@')[0]} <${e}>`).join(', ');

            ilt += `${i + 1}) ${fo.line} Line ${fo.model} ${fo.name}호기 ${itm} [사유: ${rea}]\n- 장소 및 시간 : 삼성 ${fo.line} Line ${gt} 반입구, ${fd}\n- 반출 정보 : ${sn.replace(/\n/g, '\n  ')}\n- 현업 담당자: ${pic}\n${i < blocks.length - 1 ? '\n' : ''}`;
        }

        document.getElementById("resRecipientsOut").innerText = Array.from(allEmails).join(', '); 
        document.getElementById("resRecipientsOut").closest('.space-y-2').style.display = "none";
        
        subject = `[배차요청] ${firstModel} ${blocks.length > 1 ? firstItem + ' 외 ' + (blocks.length - 1) + '건' : firstItem} 반출 배차 요청`;
        fullText = `SCM / ( 이 희진 ) 과장님\n이하 관계자 각위\n\n연일 업무에 노고가 많으십니다.\n평가4부 ${myName}입니다.\n\n${firstModel} 반출 일정 Arrange 부탁드리며,\n하기와 같이 반출 정보 송부 드리오니 확인 부탁드리겠습니다.\n\n[반출]\n${ilt}\n이상입니다.\n\n${inform ? `(인폼내용) ${inform}\n\n` : ''}감사합니다.\n\n평가 4부\n${myName} 드림`;
    }

    document.getElementById("email-subject").innerText = subject; 
    document.getElementById("email-body").innerText = fullText; 
    document.getElementById("fullMailOutputArea").style.display = "block";
}

/** 작업 이력 카드에서 메일 작성 탭으로 전환 및 폼 자동 채우기 */
function loadToMailGen(m, c) { 
    document.getElementById('mailWorkEquipSearch').value = m; 
    document.getElementById('mailJobDetail').value = c; 
    document.getElementById('mailJobTitle').value = c.substring(0, 20) + (c.length > 20 ? "..." : ""); 
    switchTab('email-gen', document.querySelectorAll('nav a')[1]); 
    showToast("데이터 로드", "메일 작성 탭으로 전환되었습니다."); 
}


// ==============================================================================
