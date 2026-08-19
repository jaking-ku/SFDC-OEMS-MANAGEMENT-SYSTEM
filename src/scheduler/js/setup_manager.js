// ===== 🔧 셋업 관리 (설비 현황판, 일정과 무관한 별개 기능) =====
    let cachedEquipments = []; // [{ id, lineName, ipuBracket, dvr, chemFilter }]
    const EQUIP_NONE = 'X'; // 미적용 표시값

    function isEquipNone(v) {
        return !v || v === EQUIP_NONE;
    }

    async function loadEquipments() {
        if (!SCRIPT_URL.startsWith("https")) return;
        try {
            const url = SCRIPT_URL + "?t=" + new Date().getTime() + "&action=readEquip";
            const res = await fetch(url);
            const data = await res.json();
            cachedEquipments = Array.isArray(data) ? data : [];
        } catch (err) {
            console.error('설비 데이터 로드 실패:', err);
        }
    }

    function sendEquipToSheet(payload) {
        if (!SCRIPT_URL.startsWith("https")) return Promise.resolve();
        // 일정 저장과 같은 큐를 사용해 동시 요청으로 행이 밀리는 문제를 방지
        pendingWrites++;
        sheetQueue = sheetQueue.then(async () => {
            try {
                await fetch(SCRIPT_URL + "?t=" + new Date().getTime(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify(payload)
                });
            } catch (err) {
                console.error('설비 데이터 전송 실패:', err);
            } finally {
                pendingWrites--;
            }
        });
        return sheetQueue;
    }

    function renderEquipTable() {
        const tbody = document.getElementById('equip-tbody');
        if (cachedEquipments.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-text-muted py-8 text-sm">등록된 설비가 없습니다. 아래 '설비 추가' 버튼을 눌러주세요.</td></tr>`;
            return;
        }
        tbody.innerHTML = cachedEquipments.map(eq => `
            <tr class="border-b border-border/50 align-middle" data-equip-id="${eq.id}">
                <td class="py-2 px-2">
                    <input type="text" value="${eq.lineName || ''}" placeholder="예: P1F-01"
                        class="w-full bg-background border border-border text-text-main text-sm rounded-lg p-2 outline-none"
                        onchange="updateEquipField('${eq.id}', 'lineName', this.value)">
                </td>
                <td class="py-2 px-2">${renderEquipDateCell(eq.id, 'ipuBracket', eq.ipuBracket)}</td>
                <td class="py-2 px-2">${renderEquipDateCell(eq.id, 'dvr', eq.dvr)}</td>
                <td class="py-2 px-2">${renderEquipDateCell(eq.id, 'chemFilter', eq.chemFilter)}</td>
                <td class="py-2 px-2 text-center">
                    <button onclick="deleteEquipRow('${eq.id}')" class="text-text-muted hover:text-red-500" title="설비 삭제">
                        <span class="material-symbols-outlined text-[20px]">delete</span>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    function renderEquipDateCell(id, field, value) {
        const none = isEquipNone(value);
        return `
            <div class="flex items-center gap-1.5">
                <label class="flex items-center gap-1 text-xs text-text-muted cursor-pointer select-none">
                    <input type="checkbox" ${none ? 'checked' : ''} class="w-3.5 h-3.5 accent-gray-400 cursor-pointer"
                        onchange="toggleEquipNone('${id}', '${field}', this.checked)"> X
                </label>
                <input type="date" value="${none ? '' : value}" ${none ? 'disabled' : ''}
                    class="flex-1 bg-background border border-border text-text-main text-xs rounded-lg p-2 outline-none disabled:opacity-40"
                    onchange="updateEquipField('${id}', '${field}', this.value)">
            </div>
        `;
    }

    function findEquip(id) {
        return cachedEquipments.find(e => e.id === id);
    }

    function updateEquipField(id, field, value) {
        const eq = findEquip(id);
        if (!eq) return;
        if (field === 'lineName') {
            eq[field] = value; // 호기명은 빈 값이어도 그대로 둠
        } else {
            eq[field] = value || EQUIP_NONE; // 날짜 필드가 비면 미적용(X) 처리
        }
        sendEquipToSheet({ action: 'updateEquip', ...eq });
    }

    function toggleEquipNone(id, field, checked) {
        const eq = findEquip(id);
        if (!eq) return;
        if (checked) {
            eq[field] = EQUIP_NONE;
        } else {
            // 체크 해제 시 오늘 날짜를 기본값으로 채워 'X' 판정에서 벗어나도록 함
            const todayStr = new Date().toISOString().slice(0, 10);
            eq[field] = todayStr;
        }
        renderEquipTable();
        sendEquipToSheet({ action: 'updateEquip', ...eq });
    }

    function addEquipRow() {
        const newEq = {
            id: 'EQUIP_' + Date.now(),
            lineName: '',
            ipuBracket: EQUIP_NONE,
            dvr: EQUIP_NONE,
            chemFilter: EQUIP_NONE
        };
        cachedEquipments.push(newEq);
        renderEquipTable();
        sendEquipToSheet({ action: 'addEquip', ...newEq });
    }

    function deleteEquipRow(id) {
        if (!confirm('이 설비를 삭제하시겠습니까?')) return;
        cachedEquipments = cachedEquipments.filter(e => e.id !== id);
        renderEquipTable();
        sendEquipToSheet({ action: 'deleteEquip', id });
    }

    async function openEquipModal() {
        document.getElementById('equip-modal').classList.remove('hidden');
        document.getElementById('equip-tbody').innerHTML = `<tr><td colspan="5" class="text-center text-text-muted py-8 text-sm">불러오는 중...</td></tr>`;
        await loadEquipments();
        renderEquipTable();
    }

    function closeEquipModal() {
        document.getElementById('equip-modal').classList.add('hidden');
    }
    // ===========================

    // modal-line select 옵션을 딱 한 번만 초기화 (generateCalendarPC 재실행 시 리셋되지 않도록)
    function initLineSelect() {
        const sel = document.getElementById('modal-line');
        sel.innerHTML = lines.map(l => `<option value="${l}">${l}</option>`).join('');
    }

    // 초기 렌더링 실행
    checkUsername();
    renderNotifyControl();
    initLineSelect();
    loadEventsFromSheet();
    setInterval(loadEventsFromSheet, 60000);

    // ==========================================
