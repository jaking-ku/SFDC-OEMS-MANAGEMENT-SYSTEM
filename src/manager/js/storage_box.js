// 2. [Storage Layer] IndexedDB v3 및 LocalStorage 데이터 접근 계층
// ==============================================================================

/**
 * 날짜 문자열에서 'YYYY-MM' 연월 키를 안전하게 추출합니다.
 * @param {string|number} dateStr 날짜 문자열 (예: '2026-02-17', '2026.02.17', '20260217')
 * @param {string|number} [fallbackTimestamp] 누락 시 대체 타임스탬프
 * @returns {string} 'YYYY-MM' 형식의 연월 키
 */
function getYearMonthFromDate(dateStr, fallbackTimestamp) {
    if (dateStr) {
        const clean = String(dateStr).trim().replace(/[^0-9]/g, '');
        if (clean.length >= 6) {
            return `${clean.substring(0, 4)}-${clean.substring(4, 6)}`;
        }
    }
    const d = fallbackTimestamp ? new Date(fallbackTimestamp) : new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * IndexedDB 연결 및 스키마 v3 업그레이드
 * @returns {Promise<IDBDatabase>}
 */
function initDB() { 
    return new Promise((resolve, reject) => { 
        const req = indexedDB.open(DB_N, 3); 
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(ST_N)) {
                db.createObjectStore(ST_N);
            }
            
            let histStore;
            if (!db.objectStoreNames.contains(HIST_STORE)) {
                histStore = db.createObjectStore(HIST_STORE, { keyPath: 'id' });
            } else {
                histStore = req.transaction.objectStore(HIST_STORE);
            }

            if (histStore) {
                if (!histStore.indexNames.contains('yearMonth')) histStore.createIndex('yearMonth', 'yearMonth', { unique: false });
                if (!histStore.indexNames.contains('date')) histStore.createIndex('date', 'date', { unique: false });
                if (!histStore.indexNames.contains('machine')) histStore.createIndex('machine', 'machine', { unique: false });
                if (!histStore.indexNames.contains('sn')) histStore.createIndex('sn', 'sn', { unique: false });
                if (!histStore.indexNames.contains('updatedAt')) histStore.createIndex('updatedAt', 'updatedAt', { unique: false });
            }

            if (!db.objectStoreNames.contains(SYNC_STORE)) {
                db.createObjectStore(SYNC_STORE, { keyPath: 'key' });
            }
        };
        req.onsuccess = () => resolve(req.result); 
        req.onerror = () => reject(req.error); 
    }); 
}

/**
 * IndexedDB에 파일 또는 디렉터리 핸들을 저장합니다.
 */
async function saveFileHandle(key, handle) { 
    const db = await initDB(); 
    return new Promise((resolve, reject) => { 
        const tx = db.transaction(ST_N, 'readwrite'); 
        tx.objectStore(ST_N).put(handle, key); 
        tx.oncomplete = resolve; 
        tx.onerror = () => reject(tx.error); 
    }); 
}

/**
 * IndexedDB에서 저장된 파일 또는 디렉터리 핸들을 조회합니다.
 */
async function getFileHandle(key) { 
    const db = await initDB(); 
    return new Promise((resolve, reject) => { 
        const tx = db.transaction(ST_N, 'readonly'); 
        const req = tx.objectStore(ST_N).get(key); 
        req.onsuccess = () => resolve(req.result); 
        req.onerror = () => reject(tx.error); 
    }); 
}

/**
 * IndexedDB에 동기화 상태 메타데이터를 저장합니다.
 */
async function saveSyncState(key, value) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(SYNC_STORE, 'readwrite');
        tx.objectStore(SYNC_STORE).put({ key, value, updatedAt: Date.now() });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * IndexedDB에서 동기화 상태 메타데이터를 조회합니다.
 */
async function getSyncState(key) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(SYNC_STORE, 'readonly');
        const req = tx.objectStore(SYNC_STORE).get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
        req.onerror = () => reject(tx.error);
    });
}

/**
 * IndexedDB에서 전체 작업 히스토리를 가져옵니다. (연월 키 자동 보정 포함)
 */
async function getIDBHistory() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(HIST_STORE, 'readonly');
        const req = tx.objectStore(HIST_STORE).getAll();
        req.onsuccess = () => {
            const list = req.result || [];
            list.forEach(item => {
                if (!item.yearMonth) {
                    item.yearMonth = getYearMonthFromDate(item.date, item.savedAt);
                }
            });
            resolve(list);
        };
        req.onerror = () => reject(tx.error);
    });
}

/**
 * 특정 연월(yearMonth)의 작업 히스토리만 선별 조회합니다.
 */
async function getIDBHistoryByMonth(yearMonth) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(HIST_STORE, 'readonly');
        const store = tx.objectStore(HIST_STORE);
        if (store.indexNames.contains('yearMonth')) {
            const index = store.index('yearMonth');
            const req = index.getAll(yearMonth);
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(tx.error);
        } else {
            const req = store.getAll();
            req.onsuccess = () => {
                const filtered = (req.result || []).filter(e => getYearMonthFromDate(e.date, e.savedAt) === yearMonth);
                resolve(filtered);
            };
            req.onerror = () => reject(tx.error);
        }
    });
}

/**
 * IndexedDB의 작업 히스토리를 통째로 덮어씁니다.
 */
async function putIDBHistory(dataArray) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(HIST_STORE, 'readwrite');
        const store = tx.objectStore(HIST_STORE);
        store.clear();
        dataArray.forEach(item => {
            if (!item.yearMonth) {
                item.yearMonth = getYearMonthFromDate(item.date, item.savedAt);
            }
            store.put(item);
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * 작업 히스토리 목록을 스마트 병합(Upsert)합니다.
 */
async function upsertIDBHistoryItems(items) {
    if (!items || items.length === 0) return;
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(HIST_STORE, 'readwrite');
        const store = tx.objectStore(HIST_STORE);
        items.forEach(item => {
            if (!item.yearMonth) {
                item.yearMonth = getYearMonthFromDate(item.date, item.savedAt);
            }
            store.put(item);
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * 최초 접속 시 기존 localStorage의 히스토리 데이터를 IndexedDB로 1회 안전 마이그레이션합니다.
 */
async function migrateToIndexedDB() {
    const local = JSON.parse(localStorage.getItem("workHistory") || "[]");
    if (local.length > 0) {
        const currentIDB = await getIDBHistory();
        if (currentIDB.length === 0) {
            await putIDBHistory(local);
            console.log("✅ [스토리지] 구버전 localStorage 데이터가 IndexedDB로 성공적으로 이전되었습니다.");
        }
        localStorage.removeItem("workHistory");
    }
}


// ==============================================================================
// 3. [Sync Engine] Box 공용 폴더 분할 차등 동기화(Partitioned Sync) 엔진
// ==============================================================================

/**
 * File System Access API: 디렉터리 내 JSON 파일을 읽어옵니다.
 */
async function readJsonFromDir(dirHandle, filename, defaultVal = null) {
    try {
        const fileHandle = await dirHandle.getFileHandle(filename);
        const file = await fileHandle.getFile();
        const text = await file.text();
        return text ? JSON.parse(text) : defaultVal;
    } catch (e) {
        return defaultVal;
    }
}

/**
 * File System Access API: 디렉터리 내 JSON 파일을 저장합니다.
 */
async function writeJsonToDir(dirHandle, filename, data) {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
}

/**
 * File System Access API: 서브 디렉터리를 조회하거나 생성합니다.
 */
async function getOrCreateSubdir(dirHandle, dirname) {
    return await dirHandle.getDirectoryHandle(dirname, { create: true });
}

/**
 * 파일 또는 폴더 핸들의 접근 권한을 확인하고 필요 시 요청합니다.
 */
async function verifyPermission(handle, rw, isUserGesture = false) { 
    if (!handle) return false;
    const options = { mode: rw ? 'readwrite' : 'read' }; 
    try {
        if ((await handle.queryPermission(options)) === 'granted') return true;
        if (isUserGesture) { 
            return (await handle.requestPermission(options)) === 'granted'; 
        }
    } catch (e) { 
        return false; 
    }
    return false;
}

/**
 * 팀 메타데이터 객체의 정규화
 */
function normalizeTeamMeta(data) {
    if (!data) data = {};
    return {
        schemaVersion: Math.max(Number(data.schemaVersion) || 1, TEAM_SCHEMA_VERSION),
        dbRevision: Number(data.dbRevision) || 0,
        lastUpdatedAt: Number(data.lastUpdatedAt) || 0,
        lastUpdatedBy: data.lastUpdatedBy || "알 수 없음",
        partitions: data.partitions || {
            master_config: { revision: 0, updatedAt: 0 },
            notes: { revision: 0, updatedAt: 0 },
            maintenance: { revision: 0, updatedAt: 0 },
            history: {}
        }
    };
}

/**
 * 팀 메타데이터를 로컬스토리지 및 상단 라벨에 반영합니다.
 */
function rememberTeamMeta(data) {
    const meta = normalizeTeamMeta(data);
    localStorage.setItem('teamDbRevision', String(meta.dbRevision));
    localStorage.setItem('teamDbLastUpdatedAt', String(meta.lastUpdatedAt));
    localStorage.setItem('teamDbLastUpdatedBy', meta.lastUpdatedBy);
    
    const label = document.getElementById('autoSyncLabel');
    if (label) {
        const d = meta.lastUpdatedAt ? new Date(meta.lastUpdatedAt) : new Date();
        const hh = d.getHours().toString().padStart(2, '0');
        const mm = d.getMinutes().toString().padStart(2, '0');
        label.textContent = `TEAM DB 최신 확인: ${hh}:${mm} · Rev. ${meta.dbRevision}`;
    }
}

/**
 * 현재 작업자의 이름을 반환합니다.
 */
function getTeamEditorName() {
    return (document.getElementById('mailMyName')?.value || localStorage.getItem('storedMyName') || '알 수 없음').trim() || '알 수 없음';
}

/**
 * 작업 이력 배열 병합 (중복 제거 및 최신 수정 우선)
 */
function mergeHistory(boxHistory, localHistory) {
    const map = new Map();
    const getLegacyId = (item) => "LEGACY_" + item.date + "_" + item.machine + "_" + (item.content || "").substring(0, 10);
    
    [...(boxHistory || []), ...(localHistory || [])].forEach(item => {
        const copy = { ...item }; 
        if (!copy.id) copy.id = getLegacyId(copy);
        if (!copy.yearMonth) copy.yearMonth = getYearMonthFromDate(copy.date, copy.savedAt);
        
        const old = map.get(copy.id);
        if (!old || (copy.updatedAt || 0) >= (old.updatedAt || 0)) {
            map.set(copy.id, copy);
        }
    });

    const seen = new Set();
    return Array.from(map.values())
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .filter(item => {
            const cleanMachine = (item.machine || '').trim().toUpperCase();
            const cleanDate = (item.date || '').replace(/[^0-9]/g, '');
            const cleanContent = (item.content || '').trim().replace(/\s/g, '');
            const key = `${cleanMachine}|${cleanDate}|${cleanContent}`;
            
            if (seen.has(key)) return false; 
            seen.add(key); 
            return true;
        });
}

/**
 * 설비 마스터 목록 병합
 */
function mergeEquipment(boxEquipment, localEquipment) {
    const map = new Map();
    const keyOf = (e) => (e.sn || '').trim() || `${(e.line || '').trim()}|${(e.name || '').trim()}`;
    
    (boxEquipment || []).forEach(e => map.set(keyOf(e), { ...e }));
    (localEquipment || []).forEach(e => { 
        const copy = { ...e }; 
        delete copy.isEditing; 
        map.set(keyOf(copy), copy); 
    });
    
    return Array.from(map.values());
}

/**
 * 설비별 메모(Notes) 병합
 */
function mergeNotes(boxNotes, localNotes) {
    const result = { ...(boxNotes || {}) };
    Object.entries(localNotes || {}).forEach(([key, value]) => {
        if (!result[key] || result[key] === value) {
            result[key] = value;
        } else if (value && !result[key].includes(value)) {
            result[key] += `\n\n${value}`;
        }
    });
    return result;
}

/**
 * 유지보수 데이터 객체 병합
 */
function mergeMaintenance(boxMaint, localMaint) {
    const result = {};
    Object.entries(boxMaint || {}).forEach(([key, value]) => {
        result[key] = normalizeMaintShape(value);
    });
    Object.entries(localMaint || {}).forEach(([key, value]) => {
        result[key] = result[key] ? mergeMaintDataObjects(result[key], value) : normalizeMaintShape(value);
    });
    return result;
}

/**
 * 레거시 단일 DB.txt를 감지하여 폴더 분할 구조로 1회 자동 마이그레이션합니다.
 */
async function autoMigrateLegacyDbTxt(dirHandle) {
    try {
        const existingMeta = await readJsonFromDir(dirHandle, 'meta.json', null);
        if (existingMeta) return; // 이미 분할 구조가 완성되어 있음

        let legacyData = null;
        for (const fname of ['DB.txt', 'SFDC_DB.txt', 'Hitachi_DB.txt']) {
            legacyData = await readJsonFromDir(dirHandle, fname, null);
            if (legacyData) break;
        }

        // 폴더가 비어있고 로컬에 기존 데이터가 있는 경우 로컬 데이터로 초기 분할 생성
        if (!legacyData) {
            const localHist = await getIDBHistory();
            const localEq = JSON.parse(localStorage.getItem('equipmentData') || '[]');
            const localRecip = JSON.parse(localStorage.getItem('recipientData') || '{}');
            const localNotes = JSON.parse(localStorage.getItem('machineNotes') || '{}');
            const localMaint = JSON.parse(localStorage.getItem('equipMaintenance') || '{}');
            
            legacyData = {
                workHistory: localHist,
                equipment: localEq,
                recipient: localRecip,
                machineNotes: localNotes,
                equipMaintenance: localMaint,
                schemaVersion: 2,
                dbRevision: 1,
                lastUpdatedAt: Date.now(),
                lastUpdatedBy: getTeamEditorName()
            };
        }

        console.log("🚀 [분할 마이그레이션] 레거시 데이터를 폴더 분할 구조로 자동 변환합니다...");

        // 1) 마스터 설정 및 메모/유지보수 분할 저장
        await writeJsonToDir(dirHandle, 'master_config.json', {
            equipment: legacyData.equipment || [],
            recipient: legacyData.recipient || {}
        });
        await writeJsonToDir(dirHandle, 'notes.json', {
            machineNotes: legacyData.machineNotes || {}
        });
        await writeJsonToDir(dirHandle, 'maintenance.json', {
            equipMaintenance: legacyData.equipMaintenance || {}
        });

        // 2) 작업 이력 월별 분할 저장
        const historySubdir = await getOrCreateSubdir(dirHandle, 'history');
        const historyByMonth = {};
        (legacyData.workHistory || []).forEach(item => {
            const ym = getYearMonthFromDate(item.date, item.savedAt);
            if (!historyByMonth[ym]) historyByMonth[ym] = [];
            historyByMonth[ym].push(item);
        });

        const historyPartitions = {};
        for (const ym of Object.keys(historyByMonth)) {
            await writeJsonToDir(historySubdir, `${ym}.json`, historyByMonth[ym]);
            historyPartitions[ym] = {
                revision: 1,
                updatedAt: Date.now(),
                updatedBy: legacyData.lastUpdatedBy || "초기생성",
                count: historyByMonth[ym].length
            };
        }

        // 3) 총괄 meta.json 생성
        const meta = {
            schemaVersion: 3,
            dbRevision: Number(legacyData.dbRevision) || 1,
            lastUpdatedAt: Number(legacyData.lastUpdatedAt) || Date.now(),
            lastUpdatedBy: legacyData.lastUpdatedBy || getTeamEditorName(),
            partitions: {
                master_config: { revision: 1, updatedAt: Date.now(), updatedBy: legacyData.lastUpdatedBy || "초기생성" },
                notes: { revision: 1, updatedAt: Date.now(), updatedBy: legacyData.lastUpdatedBy || "초기생성" },
                maintenance: { revision: 1, updatedAt: Date.now(), updatedBy: legacyData.lastUpdatedBy || "초기생성" },
                history: historyPartitions
            }
        };

        await writeJsonToDir(dirHandle, 'meta.json', meta);
        await saveSyncState('teamMeta', meta);
        console.log("✅ [분할 마이그레이션 완료] 폴더 분할 구조 생성이 완료되었습니다.");
    } catch (e) {
        console.error("자동 마이그레이션 중 오류:", e);
    }
}

/**
 * 📥 차등 분할 PULL: 변경된 파티션 파일만 선택적으로 다운로드 및 병합 (실시간 진행률 콜백 지원)
 */
async function pullPartitionedTeamData(dirHandle, isUserGesture = false, isManualButton = false, progressCb = null) {
    if (progressCb) progressCb(5, '메타데이터 조회', 'Box 폴더의 meta.json 파일을 읽고 있습니다.', '');
    let meta = await readJsonFromDir(dirHandle, 'meta.json', null);
    if (!meta) {
        if (progressCb) progressCb(8, '레거시 데이터 변환', '이전 버전 데이터를 신규 분할 구조로 변환 중...', '');
        await autoMigrateLegacyDbTxt(dirHandle);
        meta = await readJsonFromDir(dirHandle, 'meta.json', null);
    }
    if (!meta) return false;

    if (progressCb) progressCb(12, '메타데이터 분석', '팀 DB 파티션 및 리비전을 검사하고 있습니다.', '');
    const normalizedMeta = normalizeTeamMeta(meta);
    const localMeta = (await getSyncState('teamMeta')) || {};
    const localParts = localMeta.partitions || {};
    const remoteParts = normalizedMeta.partitions;

    // 1) 마스터 설정 (설비, 수신처) 파티션 점검
    const remoteMasterRev = remoteParts.master_config?.revision || 0;
    const localMasterRev = localParts.master_config?.revision || 0;
    if (remoteMasterRev > localMasterRev || !localMeta.dbRevision) {
        if (progressCb) progressCb(18, '마스터 설정 동기화', '설비 목록 및 메일 수신처 데이터를 동기화 중입니다.', 'master_config.json');
        const masterData = await readJsonFromDir(dirHandle, 'master_config.json', null);
        if (masterData) {
            const localEquipment = JSON.parse(localStorage.getItem('equipmentData') || '[]');
            const isEditingEquipment = localEquipment.some(item => item.isEditing);
            const mergedEq = mergeEquipment(masterData.equipment || [], localEquipment);
            if (!isEditingEquipment) {
                localStorage.setItem('equipmentData', JSON.stringify(mergedEq));
                renderTable();
            }
            const localRecip = JSON.parse(localStorage.getItem('recipientData') || '{}');
            const mergedRecip = { ...(masterData.recipient || {}), ...localRecip };
            localStorage.setItem('recipientData', JSON.stringify(mergedRecip));
            renderRecipientTable();
        }
    }

    // 2) 메모 파티션 점검
    const remoteNotesRev = remoteParts.notes?.revision || 0;
    const localNotesRev = localParts.notes?.revision || 0;
    if (remoteNotesRev > localNotesRev || !localMeta.dbRevision) {
        if (progressCb) progressCb(24, '설비 메모 동기화', '설비별 특이사항 및 메모를 동기화 중입니다.', 'notes.json');
        const notesData = await readJsonFromDir(dirHandle, 'notes.json', null);
        if (notesData && notesData.machineNotes) {
            const localNotes = JSON.parse(localStorage.getItem('machineNotes') || '{}');
            const mergedNotes = mergeNotes(notesData.machineNotes, localNotes);
            localStorage.setItem('machineNotes', JSON.stringify(mergedNotes));
        }
    }

    // 3) 유지보수 / 소모품 파티션 점검
    const remoteMaintRev = remoteParts.maintenance?.revision || 0;
    const localMaintRev = localParts.maintenance?.revision || 0;
    if (remoteMaintRev > localMaintRev || !localMeta.dbRevision) {
        if (progressCb) progressCb(30, '유지보수 데이터 동기화', '설비별 소모품 및 유지보수 이력을 동기화 중입니다.', 'maintenance.json');
        const maintData = await readJsonFromDir(dirHandle, 'maintenance.json', null);
        if (maintData && maintData.equipMaintenance) {
            applyIncomingMaintenance(maintData.equipMaintenance);
        }
    }

    // 4) 작업 이력 월별 파티션 점검 (변경된 월 파일만 선택적 로드)
    const remoteHistoryParts = remoteParts.history || {};
    const localHistoryParts = localParts.history || {};
    const historySubdir = await getOrCreateSubdir(dirHandle, 'history');
    const ymKeys = Object.keys(remoteHistoryParts);
    const totalYm = ymKeys.length;

    if (totalYm === 0) {
        if (progressCb) progressCb(80, '작업 이력 점검', '등록된 작업 이력 파티션이 없습니다.', '');
    } else {
        for (let i = 0; i < totalYm; i++) {
            const ym = ymKeys[i];
            const rRev = remoteHistoryParts[ym]?.revision || 0;
            const lRev = localHistoryParts[ym]?.revision || 0;
            const pct = 30 + Math.round(((i + 1) / totalYm) * 55);
            
            if (progressCb) {
                progressCb(pct, '작업 이력 동기화', `월별 데이터 로드 중: ${ym}.json`, `${i + 1} / ${totalYm}`);
                await new Promise(r => setTimeout(r, 5));
            }

            if (rRev > lRev || !localMeta.dbRevision) {
                const monthData = await readJsonFromDir(historySubdir, `${ym}.json`, []);
                if (monthData && monthData.length > 0) {
                    const localMonthHistory = await getIDBHistoryByMonth(ym);
                    const mergedMonthHistory = mergeHistory(monthData, localMonthHistory);
                    await upsertIDBHistoryItems(mergedMonthHistory);
                }
            }
        }
    }

    // 동기화 상태 로컬 영속화 및 UI 최신화
    if (progressCb) progressCb(88, '데이터 영속화', 'IndexedDB 데이터베이스 및 동기화 상태 저장 중...', '');
    await saveSyncState('teamMeta', normalizedMeta);
    rememberTeamMeta(normalizedMeta);
    localStorage.setItem('lastSyncSuccessAt', Date.now().toString());

    if (progressCb) progressCb(94, '화면 UI 갱신', '작업 이력 뱃지 및 테이블 렌더링 중...', '');
    await updateHistoryBadge();
    if (document.getElementById('history')?.classList.contains('block')) {
        await renderHistory();
    }
    await updateSyncStatusBanner();

    if (progressCb) progressCb(100, '동기화 완료', '모든 팀 데이터가 최신 상태로 반영되었습니다.', '');

    if (isManualButton) {
        showToast('최신화 완료', `TEAM DB Revision ${normalizedMeta.dbRevision} (분할 동기화)`);
    } else if (normalizedMeta.dbRevision > Number(localStorage.getItem('teamDbRevision') || 0)) {
        showToast('TEAM DB 최신화', `Revision ${normalizedMeta.dbRevision} 최신 변경사항을 반영했습니다.`);
    }

    return true;
}

/**
 * 📤 차등 분할 PUSH: 변경된 파티션 파일만 선택적으로 업로드
 * 🔒 낙관적 동시성 제어(Optimistic Concurrency Control):
 *    쓰기 직전 meta.json의 lastModified 및 dbRevision을 재확인하여 다른 팀원의 동시 저장을 감지하고 자동 재시도합니다.
 */
async function pushPartitionedTeamData(dirHandle, pushScope = {}) {
    const MAX_RETRY = 3;
    const historySubdir = await getOrCreateSubdir(dirHandle, 'history');
    const editorName = getTeamEditorName();
    const scope = pushScope.scope || 'all';
    const targetMonths = new Set(pushScope.yearMonths || []);

    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
        // 1) meta.json 파일 핸들 및 최초 스냅샷 확인
        let metaHandle;
        try {
            metaHandle = await dirHandle.getFileHandle('meta.json', { create: false });
        } catch (e) {
            await autoMigrateLegacyDbTxt(dirHandle);
            try {
                metaHandle = await dirHandle.getFileHandle('meta.json', { create: false });
            } catch (err) {
                metaHandle = null;
            }
        }

        let initialMetaFile = null;
        let initialMeta = null;
        if (metaHandle) {
            initialMetaFile = await metaHandle.getFile();
            const text = await initialMetaFile.text();
            initialMeta = text ? JSON.parse(text) : null;
        }
        const currentMeta = normalizeTeamMeta(initialMeta);
        const now = Date.now();

        // 2) [쓰기 직전 재검증: 낙관적 잠금 (Optimistic Concurrency Check)]
        if (metaHandle && initialMetaFile) {
            const freshMetaFile = await metaHandle.getFile();
            if (freshMetaFile.lastModified !== initialMetaFile.lastModified) {
                console.warn(`[낙관적 잠금] 원격 meta.json 변경(다른 팀원 저장)이 감지되어 최신 데이터를 다시 읽고 병합을 재시도합니다. (시도 ${attempt + 1}/${MAX_RETRY})`);
                continue;
            }
        }

        // 3) 스코프별 데이터 읽기 및 병합
        // (1) 마스터 설정 (설비, 수신처)
        let masterToSave = null;
        if (scope === 'all' || scope === 'master' || scope === 'equipment' || scope === 'recipient') {
            const localEquipment = JSON.parse(localStorage.getItem('equipmentData') || '[]').map(e => {
                const copy = { ...e }; 
                delete copy.isEditing; 
                return copy;
            });
            const localRecipient = JSON.parse(localStorage.getItem('recipientData') || '{}');
            const remoteMaster = await readJsonFromDir(dirHandle, 'master_config.json', { equipment: [], recipient: {} });
            const mergedEq = mergeEquipment(remoteMaster.equipment, localEquipment);
            const mergedRecip = { ...(remoteMaster.recipient || {}), ...localRecipient };

            masterToSave = { equipment: mergedEq, recipient: mergedRecip };
        }

        // (2) 메모
        let notesToSave = null;
        if (scope === 'all' || scope === 'notes') {
            const localNotes = JSON.parse(localStorage.getItem('machineNotes') || '{}');
            const remoteNotes = await readJsonFromDir(dirHandle, 'notes.json', { machineNotes: {} });
            const mergedNotes = mergeNotes(remoteNotes.machineNotes, localNotes);

            notesToSave = { machineNotes: mergedNotes };
        }

        // (3) 유지보수 / 소모품
        let maintToSave = null;
        if (scope === 'all' || scope === 'maintenance') {
            const localMaint = JSON.parse(localStorage.getItem('equipMaintenance') || '{}');
            const remoteMaint = await readJsonFromDir(dirHandle, 'maintenance.json', { equipMaintenance: {} });
            const mergedMaint = mergeMaintenance(remoteMaint.equipMaintenance, localMaint);

            maintToSave = { equipMaintenance: mergedMaint };
        }

        // (4) 작업 이력 월별 파티션
        let historyToSaveByMonth = {};
        if (scope === 'all' || scope === 'history') {
            const allHistory = await getIDBHistory();
            const historyByMonth = {};
            allHistory.forEach(item => {
                const ym = item.yearMonth || getYearMonthFromDate(item.date, item.savedAt);
                if (!historyByMonth[ym]) historyByMonth[ym] = [];
                historyByMonth[ym].push(item);
            });

            const monthsToPush = targetMonths.size > 0 ? Array.from(targetMonths) : Object.keys(historyByMonth);

            for (const ym of monthsToPush) {
                const localMonthItems = historyByMonth[ym] || [];
                const remoteMonthItems = await readJsonFromDir(historySubdir, `${ym}.json`, []);
                const mergedMonthItems = mergeHistory(remoteMonthItems, localMonthItems);
                historyToSaveByMonth[ym] = mergedMonthItems;
            }
        }

        // 4) [최종 쓰기 직전 2차 재검증: 쓰기 충돌 방지]
        if (metaHandle && initialMetaFile) {
            const freshMetaFile = await metaHandle.getFile();
            if (freshMetaFile.lastModified !== initialMetaFile.lastModified) {
                console.warn(`[낙관적 잠금] 파일 저장 직전 다른 팀원의 저장이 감지되어 재시도합니다. (시도 ${attempt + 1}/${MAX_RETRY})`);
                continue;
            }
        }

        // 5) 실제 파일 쓰기 수행
        if (masterToSave) {
            await writeJsonToDir(dirHandle, 'master_config.json', masterToSave);
            currentMeta.partitions.master_config = {
                revision: (currentMeta.partitions.master_config?.revision || 0) + 1,
                updatedAt: now,
                updatedBy: editorName
            };
        }

        if (notesToSave) {
            await writeJsonToDir(dirHandle, 'notes.json', notesToSave);
            currentMeta.partitions.notes = {
                revision: (currentMeta.partitions.notes?.revision || 0) + 1,
                updatedAt: now,
                updatedBy: editorName
            };
        }

        if (maintToSave) {
            await writeJsonToDir(dirHandle, 'maintenance.json', maintToSave);
            currentMeta.partitions.maintenance = {
                revision: (currentMeta.partitions.maintenance?.revision || 0) + 1,
                updatedAt: now,
                updatedBy: editorName
            };
        }

        for (const ym of Object.keys(historyToSaveByMonth)) {
            const mergedMonthItems = historyToSaveByMonth[ym];
            await writeJsonToDir(historySubdir, `${ym}.json`, mergedMonthItems);

            if (!currentMeta.partitions.history) currentMeta.partitions.history = {};
            currentMeta.partitions.history[ym] = {
                revision: (currentMeta.partitions.history[ym]?.revision || 0) + 1,
                updatedAt: now,
                updatedBy: editorName,
                count: mergedMonthItems.length
            };
        }

        // 6) meta.json 총괄 Revision 증가 및 저장
        currentMeta.dbRevision = (currentMeta.dbRevision || 0) + 1;
        currentMeta.lastUpdatedAt = now;
        currentMeta.lastUpdatedBy = editorName;

        await writeJsonToDir(dirHandle, 'meta.json', currentMeta);
        await saveSyncState('teamMeta', currentMeta);
        rememberTeamMeta(currentMeta);
        localStorage.setItem('lastSyncSuccessAt', now.toString());
        await updateSyncStatusBanner();

        return true;
    }

    throw new Error('다른 팀원의 연속 동시 저장으로 인해 재시도 횟수를 초과했습니다.');
}

/**
 * 🚀 통합 동기화 디스패처 (폴더 분할 엔진 및 레거시 파일 호환 지원)
 */
async function syncWithBox(isUserGesture = false, isPushSettings = false, isManualButton = false, pushScope = { scope: 'all' }, progressCb = null) {
    if (activeSyncPromise) { 
        if (isPushSettings) pendingPush = true; 
        return activeSyncPromise; 
    }

    activeSyncPromise = (async () => {
        const dirHandle = await getFileHandle('boxDirectoryHandle');
        const legacyFileHandle = await getFileHandle('boxBackupFile');

        if (!dirHandle && !legacyFileHandle) {
            if (isManualButton) alert("⚠️ 상단의 [DB 폴더 연결] 버튼을 눌러 Box 공용 폴더를 연결해 주세요.");
            await updateSyncStatusBanner(); 
            return false;
        }

        const handle = dirHandle || legacyFileHandle;
        const hasPerm = await verifyPermission(handle, true, isUserGesture);
        if (!hasPerm) { 
            if (isManualButton) alert("Box 폴더 접근 권한이 필요합니다."); 
            await updateSyncStatusBanner(); 
            return false; 
        }

        isSyncing = true;
        const syncIcon = document.getElementById("syncIcon");
        const syncText = document.getElementById("syncText");
        const btn = document.getElementById("syncBtn");
        
        if (btn) btn.classList.remove("text-red-500", "font-black");
        if (syncIcon && isManualButton) { 
            syncIcon.classList.add("animate-spin"); 
            syncText.innerText = "Checking..."; 
            if (btn) btn.style.opacity = "0.7"; 
        }

        try {
            if (dirHandle) {
                // 📂 신규: 디렉터리 분할 동기화
                if (isPushSettings) {
                    return await pushPartitionedTeamData(dirHandle, pushScope);
                } else {
                    return await pullPartitionedTeamData(dirHandle, isUserGesture, isManualButton, progressCb);
                }
            } else {
                // 📄 레거시 단일 파일 동기화 폴백 (낙관적 잠금 재시도 루프 적용)
                const MAX_RETRY = 3;
                for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
                    const file = await legacyFileHandle.getFile();
                    const fileText = await file.text();
                    const boxData = fileText ? JSON.parse(fileText) : {};
                    const boxMeta = normalizeTeamMeta(boxData);

                    if (!isPushSettings) {
                        const localHistory = await getIDBHistory();
                        const localEquipment = JSON.parse(localStorage.getItem('equipmentData') || '[]');
                        const localRecipient = JSON.parse(localStorage.getItem('recipientData') || '{}');
                        const localNotes = JSON.parse(localStorage.getItem('machineNotes') || '{}');
                        const localMaint = JSON.parse(localStorage.getItem('equipMaintenance') || '{}');
                        
                        const merged = {
                            ...boxData,
                            workHistory: mergeHistory(boxData.workHistory, localHistory),
                            equipment: mergeEquipment(boxData.equipment, localEquipment),
                            recipient: { ...(boxData.recipient || {}), ...localRecipient },
                            machineNotes: mergeNotes(boxData.machineNotes, localNotes),
                            equipMaintenance: mergeMaintenance(boxData.equipMaintenance, localMaint),
                            dbRevision: boxMeta.dbRevision,
                            lastUpdatedAt: boxMeta.lastUpdatedAt,
                            lastUpdatedBy: boxMeta.lastUpdatedBy
                        };
                        await putIDBHistory(merged.workHistory || []);
                        localStorage.setItem('equipmentData', JSON.stringify(merged.equipment || []));
                        localStorage.setItem('recipientData', JSON.stringify(merged.recipient || {}));
                        localStorage.setItem('machineNotes', JSON.stringify(merged.machineNotes || {}));
                        localStorage.setItem('equipMaintenance', JSON.stringify(merged.equipMaintenance || {}));
                        rememberTeamMeta(merged);
                        renderTable();
                        renderRecipientTable();
                        await updateHistoryBadge();
                        if (document.getElementById('history')?.classList.contains('block')) await renderHistory();
                        localStorage.setItem('lastSyncSuccessAt', Date.now().toString());
                        await updateSyncStatusBanner();
                        if (isManualButton) showToast('최신화 완료', `TEAM DB Revision ${boxMeta.dbRevision}`);
                        return true;
                    } else {
                        const allHist = await getIDBHistory();
                        const allEq = JSON.parse(localStorage.getItem('equipmentData') || '[]');
                        const allRecip = JSON.parse(localStorage.getItem('recipientData') || '{}');
                        const allNotes = JSON.parse(localStorage.getItem('machineNotes') || '{}');
                        const allMaint = JSON.parse(localStorage.getItem('equipMaintenance') || '{}');
                        
                        const merged = {
                            schemaVersion: TEAM_SCHEMA_VERSION,
                            dbRevision: boxMeta.dbRevision + 1,
                            lastUpdatedAt: Date.now(),
                            lastUpdatedBy: getTeamEditorName(),
                            workHistory: mergeHistory(boxData.workHistory, allHist),
                            equipment: mergeEquipment(boxData.equipment, allEq),
                            recipient: { ...(boxData.recipient || {}), ...allRecip },
                            machineNotes: mergeNotes(boxData.machineNotes, allNotes),
                            equipMaintenance: mergeMaintenance(boxData.equipMaintenance, allMaint)
                        };

                        // [낙관적 잠금: 쓰기 직전 원본 파일 수정시간 재확인]
                        const freshCheck = await legacyFileHandle.getFile();
                        if (freshCheck.lastModified !== file.lastModified) {
                            console.warn(`[낙관적 잠금] 파일 동시 수정 감지: 재시도 ${attempt + 1}/${MAX_RETRY}`);
                            continue;
                        }

                        const writable = await legacyFileHandle.createWritable();
                        await writable.write(JSON.stringify(merged, null, 2));
                        await writable.close();
                        rememberTeamMeta(merged);
                        localStorage.setItem('lastSyncSuccessAt', Date.now().toString());
                        await updateSyncStatusBanner();
                        return true;
                    }
                }
                throw new Error('다른 팀원의 연속 저장으로 재시도 횟수를 초과했습니다.');
            }
        } catch (error) {
            console.error('동기화 실패:', error);
            if (isManualButton) alert('동기화 중 오류가 발생했습니다. Box 폴더 연결 상태를 확인해주세요.');
            await updateSyncStatusBanner(); 
            return false;
        } finally {
            isSyncing = false;
            if (syncIcon) syncIcon.classList.remove('animate-spin');
            if (syncText) syncText.innerText = '강제 최신화';
            if (btn) btn.style.opacity = '1';
        }
    })();

    try { 
        return await activeSyncPromise; 
    } finally {
        activeSyncPromise = null;
        if (pendingPush) { 
            pendingPush = false; 
            autoMergeAndSave(pushScope); 
        }
    }
}

/**
 * 0.7초 디바운스를 거쳐 변경사항을 Box에 자동 Push합니다.
 */
function autoMergeAndSave(scope = { scope: 'all' }) {
    clearTimeout(_autoSyncDebounceTimer);
    _pendingPushScope = scope;
    _autoSyncDebounceTimer = setTimeout(() => { 
        syncWithBox(true, true, false, _pendingPushScope); 
    }, 700);
}

/**
 * 데이터 저장 전 최신 팀 DB 사전 점검 (오래된 데이터 덮어쓰기 방지)
 */
async function ensureFreshTeamDb() {
    const dirHandle = await getFileHandle('boxDirectoryHandle');
    const legacyFileHandle = await getFileHandle('boxBackupFile');
    if (!dirHandle && !legacyFileHandle) {
        return true; // 미연결 상태여도 로컬 저장은 진행
    }
    try {
        const ok = await syncWithBox(true, false, false);
        if (!ok) {
            console.warn('팀 DB 사전 동기화 실패. 로컬 저장을 계속 진행합니다.');
        }
    } catch(e) {
        console.warn('동기화 확인 중 오류:', e);
    }
    return true;
}

/**
 * [강제 최신화] 수동 동기화 실행
 */
function manualSync() { 
    syncWithBox(true, false, true); 
}

/**
 * Box DB 연결 해제 및 로컬 데이터 초기화
 */
async function disconnectDB() {
    if (!confirm("⚠️ 현재 연결된 Box 폴더 설정을 해제하시겠습니까? (로컬 데이터도 초기화됩니다)")) return;
    indexedDB.deleteDatabase('HitachiSfdcDB'); 
    localStorage.clear();
    alert("✅ 연결이 해제되었습니다. 초기 상태로 돌아갑니다."); 
    location.reload();
}

/**
 * 🔒 최초 연결 게이트 화면 상태 전환 ('initial' | 'progress' | 'success' | 'error')
 */
function setSyncGateState(state, info = '') {
    const vInitial = document.getElementById('syncGateViewInitial');
    const vProgress = document.getElementById('syncGateViewProgress');
    const vSuccess = document.getElementById('syncGateViewSuccess');
    const vError = document.getElementById('syncGateViewError');
    if (!vInitial || !vProgress || !vSuccess || !vError) return;

    vInitial.classList.add('hidden');
    vProgress.classList.add('hidden');
    vSuccess.classList.add('hidden');
    vError.classList.add('hidden');

    if (state === 'initial') {
        vInitial.classList.remove('hidden');
    } else if (state === 'progress') {
        vProgress.classList.remove('hidden');
    } else if (state === 'success') {
        vSuccess.classList.remove('hidden');
    } else if (state === 'error') {
        vError.classList.remove('hidden');
        const errElem = document.getElementById('syncGateErrorMsg');
        if (errElem) errElem.innerText = info || '동기화 중 오류가 발생했습니다.';
    }
}

/**
 * 📊 게이트 모달 프로그레스 바 및 텍스트 실시간 갱신
 */
function updateSyncGateProgress(percent, stepText, detailText, counterText = '') {
    const bar = document.getElementById('syncGateProgressBar');
    const pctLabel = document.getElementById('syncGatePercentLabel');
    const stepLabel = document.getElementById('syncGateStepLabel');
    const detailLabel = document.getElementById('syncGateDetailText');
    const counterLabel = document.getElementById('syncGateItemCounter');

    const safePercent = Math.min(100, Math.max(0, Math.round(percent)));

    if (bar) bar.style.width = safePercent + '%';
    if (pctLabel) pctLabel.innerText = safePercent + '%';
    if (stepLabel && stepText) {
        stepLabel.innerHTML = `<span class="w-2 h-2 rounded-full bg-primary animate-ping"></span> ${stepText}`;
    }
    if (detailLabel && detailText) detailLabel.innerText = detailText;
    if (counterLabel) counterLabel.innerText = counterText || '';
}

/** 게이트 동기화 재시도 */
function gateRetry() {
    setSyncGateState('initial');
    gateConnect();
}

/**
 * 🔗 Box 공용 DB 폴더 연결 (PC) 또는 파일 업로드 (모바일)
 */
async function linkBoxFile() {
    if ('showDirectoryPicker' in window) {
        try {
            const copyPath = prompt("👇 [최초 1회 설정] 사내 Box의 공용 DB 폴더(SFDC_DB)를 선택해주세요.", typeof BOX_PATH !== 'undefined' ? BOX_PATH : "");
            if (copyPath === null) {
                setSyncGateState('initial');
                return;
            }

            const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });

            // 폴더 선택 완료 즉시 진행 모드로 전환
            setSyncGateState('progress');
            updateSyncGateProgress(5, '폴더 연결 확인', 'Box 폴더 핸들을 저장하고 권한을 검증합니다...', '');

            await saveFileHandle('boxDirectoryHandle', dirHandle);
            
            if (navigator.storage && navigator.storage.persist) { 
                try { await navigator.storage.persist(); } catch (e) {} 
            }

            updateSyncGateProgress(10, '레거시 호환 점검', '폴더 구조를 점검하고 있습니다...', '');
            await autoMigrateLegacyDbTxt(dirHandle);

            const btn = document.getElementById("syncBtn");
            if (btn) btn.classList.remove("text-red-500", "font-black");
            const syncIconElem = document.getElementById("syncIcon");
            if (syncIconElem) syncIconElem.innerText = "sync"; 
            const syncTextElem = document.getElementById("syncText");
            if (syncTextElem) syncTextElem.innerText = "강제 최신화";

            await completeInitialConnect();
        } catch (e) { 
            if (e.name !== 'AbortError') {
                console.error(e);
                setSyncGateState('error', '폴더 연결에 실패했습니다: ' + (e.message || '접근 권한이 부족합니다.'));
            } else {
                setSyncGateState('initial');
            }
        }
    } else {
        // [모바일/아이폰 전용 파일 선택기 트리거]
        let fileInput = document.getElementById('mobile-db-upload');
        if (!fileInput) {
            fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.id = 'mobile-db-upload';
            fileInput.accept = '.txt,.json';
            fileInput.style.display = 'none';
            fileInput.onchange = handleMobileDB;
            document.body.appendChild(fileInput);
        }
        fileInput.click();
    }
}

/**
 * 최초 연결 완료 후 Pull 실행 및 게이트 닫기 (실시간 진행률 피드백)
 */
async function completeInitialConnect() {
    setSyncGateState('progress');
    updateSyncGateProgress(12, '최신 데이터 수신', '팀 공용 Box DB에서 최신 데이터를 불러옵니다...', '');
    
    const onProg = (percent, step, detail, counter) => {
        updateSyncGateProgress(percent, step, detail, counter);
    };

    const ok = await syncWithBox(true, false, false, { scope: 'all' }, onProg);
    if (!ok) {
        setSyncGateState('error', '팀 DB 폴더를 불러오지 못했습니다. 연결 상태와 권한을 다시 확인해주세요.');
        await updateSyncStatusBanner();
        return;
    }

    localStorage.setItem('hasCompletedInitialSync', 'yes');
    sessionStorage.removeItem('syncGateBypassed');
    setSyncGateState('success');
    updateSyncGateProgress(100, '동기화 완료', '모든 팀 데이터를 성공적으로 불러왔습니다.', '');
    await updateSyncStatusBanner();

    // 0.8초 후 게이트 부드럽게 닫기
    setTimeout(() => {
        hideSyncGate();
        showToast('연결 완료', 'Box DB 폴더가 연결되어 최신 팀 데이터가 동기화되었습니다.');
    }, 800);
}

/** 최초 연결 게이트 확인 */
function checkSyncGateOnLoad() {
    if (sessionStorage.getItem('syncGateBypassed') === 'yes') return;
    if (!localStorage.getItem('hasCompletedInitialSync')) showSyncGate();
}
function showSyncGate() { 
    setSyncGateState('initial');
    const o = document.getElementById('syncGateOverlay'); 
    if (o) o.classList.remove('hidden'); 
}
function hideSyncGate() { 
    const o = document.getElementById('syncGateOverlay'); 
    if (o) o.classList.add('hidden'); 
}
async function gateConnect() { await linkBoxFile(); }
function gateSkip() {
    if (!confirm("⚠️ 연결 없이 계속하면 팀원들의 최신 작업 이력이 보이지 않고, 지금부터 작성하는 내용도 Box에 반영되지 않습니다.\n정말 계속하시겠습니까?")) return;
    hideSyncGate();
    sessionStorage.setItem('syncGateBypassed', 'yes');
    updateSyncStatusBanner();
}

/** 상단 동기화 상태 배너 갱신 */
async function updateSyncStatusBanner() {
    const banner = document.getElementById('syncStatusBanner');
    const icon = document.getElementById('syncStatusIcon');
    const text = document.getElementById('syncStatusText');
    if (!banner || !icon || !text) return;

    const DANGER = "mb-6 px-4 py-3 rounded-md border flex items-center justify-between gap-3 text-xs border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400";
    const WARN   = "mb-6 px-4 py-3 rounded-md border flex items-center justify-between gap-3 text-xs border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400";

    const isDesktop = 'showDirectoryPicker' in window || 'showOpenFilePicker' in window;
    const dirHandle = await getFileHandle('boxDirectoryHandle');
    const fileHandle = await getFileHandle('boxBackupFile');
    const activeHandle = dirHandle || fileHandle;

    if (isDesktop && !activeHandle) {
        banner.className = DANGER; 
        icon.innerText = "folder_off";
        text.innerText = "Box DB 폴더가 연결되어 있지 않습니다. 팀원과 데이터가 어긋날 수 있습니다.";
        banner.classList.remove('hidden'); 
        return;
    }
    if (activeHandle) {
        const hasPerm = await verifyPermission(activeHandle, true, false);
        if (!hasPerm) {
            banner.className = DANGER; 
            icon.innerText = "error";
            text.innerText = "Box 연결 권한이 끊어졌습니다. [지금 동기화]를 눌러 재연결해주세요.";
            banner.classList.remove('hidden'); 
            return;
        }
    }

    const last = parseInt(localStorage.getItem('lastSyncSuccessAt') || '0');
    const elapsed = Date.now() - last;
    if (!last || elapsed > SYNC_STALE_MS) {
        banner.className = WARN; 
        icon.innerText = "schedule";
        text.innerText = last ? `마지막 동기화로부터 ${Math.floor(elapsed / 60000)}분 경과했습니다. 최신 데이터를 위해 동기화해주세요.` : "아직 동기화 기록이 없습니다.";
        banner.classList.remove('hidden'); 
        return;
    }

    banner.classList.add('hidden');
}

/**
 * 📱 모바일/아이폰 전용 DB 업로드 및 다운로드 병합
 */
async function handleMobileDB(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const text = e.target.result;
        try {
            let boxData = text ? JSON.parse(text) : {};
            let boxHistory = boxData.workHistory || [];
            let localHistory = await getIDBHistory();
            let mergedMap = new Map();
            
            const getLegacyId = (item) => "LEGACY_" + item.date + "_" + item.machine + "_" + (item.content || "").substring(0, 10);
            boxHistory.forEach(item => { 
                if (!item.id) item.id = getLegacyId(item); 
                mergedMap.set(item.id, item); 
            });
            localHistory.forEach(item => {
                if (!item.id) item.id = getLegacyId(item);
                let existing = mergedMap.get(item.id);
                if (!existing || (item.updatedAt || 0) >= (existing.updatedAt || 0)) {
                    mergedMap.set(item.id, item);
                }
            });
            
            let finalMergedHistory = Array.from(mergedMap.values());
            let uniqueHistory = [];
            let seenContent = new Set();
            finalMergedHistory.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

            finalMergedHistory.forEach(item => {
                const cleanDate = (item.date || "미상").replace(/[^0-9]/g, ""); 
                const cleanMachine = (item.machine || "").trim().toUpperCase();
                const cleanContent = (item.content || "").trim().replace(/\s/g, "");
                let uniqueKey = `${cleanMachine}|${cleanDate}|${cleanContent}`;
                if (!seenContent.has(uniqueKey)) { 
                    seenContent.add(uniqueKey); 
                    item.yearMonth = getYearMonthFromDate(item.date, item.savedAt);
                    uniqueHistory.push(item); 
                }
            });

            boxData.workHistory = uniqueHistory;
            await putIDBHistory(uniqueHistory);

            const mobileMeta = normalizeTeamMeta(boxData);
            boxData.schemaVersion = TEAM_SCHEMA_VERSION;
            boxData.dbRevision = mobileMeta.dbRevision + 1;
            boxData.lastUpdatedAt = Date.now();
            boxData.lastUpdatedBy = getTeamEditorName();

            let localEq = JSON.parse(localStorage.getItem("equipmentData") || "[]"); 
            let isEditingEq = localEq.some(i => i.isEditing);
            if (boxData.equipment && !isEditingEq) { 
                localStorage.setItem("equipmentData", JSON.stringify(boxData.equipment)); 
                renderTable(); 
            }
            if (boxData.recipient) { 
                localStorage.setItem("recipientData", JSON.stringify(boxData.recipient)); 
                renderRecipientTable(); 
            }
            if (boxData.machineNotes) {
                localStorage.setItem("machineNotes", JSON.stringify(boxData.machineNotes));
            }
            if (boxData.equipMaintenance) {
                applyIncomingMaintenance(boxData.equipMaintenance); 
            }

            await updateHistoryBadge();
            if (document.getElementById('history')?.classList.contains('block')) {
                await renderHistory();
            }

            alert("✅ Box 데이터 로드 및 로컬 데이터 병합 완료!\n(아이폰은 보안상 파일 자동 저장이 불가능합니다.)");
            
            if (confirm("방금 병합된 최신 데이터를 파일로 다운로드 하시겠습니까?\n다운로드 후 Box 폴더에 직접 덮어쓰시면 팀원들에게도 적용됩니다.")) {
                const blob = new Blob([JSON.stringify(boxData, null, 2)], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = "DB.txt";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }

            localStorage.setItem('hasCompletedInitialSync', 'yes');
            localStorage.setItem('lastSyncSuccessAt', Date.now().toString());
            rememberTeamMeta(boxData);
            sessionStorage.removeItem('syncGateBypassed');
            hideSyncGate();
            await updateSyncStatusBanner();

        } catch (error) {
            console.error(error);
            alert('DB 파일 형식이 올바르지 않거나 오류가 발생했습니다.');
        }
        event.target.value = ''; 
    };
    reader.readAsText(file);
}

/**
 * 💾 정기 PC 로컬 자동 백업 (1주일 단위)
 */
async function autoLocalBackup() {
    const lastBackup = localStorage.getItem('lastBackupDate');
    const now = Date.now();
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000; 

    if (!lastBackup || (now - parseInt(lastBackup)) > ONE_WEEK) {
        try {
            let history = await getIDBHistory();
            let equipment = JSON.parse(localStorage.getItem("equipmentData") || "[]").map(e => { 
                let obj = { ...e }; 
                delete obj.isEditing; 
                return obj; 
            });
            let recipient = JSON.parse(localStorage.getItem("recipientData") || "{}");
            let machineNotes = JSON.parse(localStorage.getItem("machineNotes") || "{}");
            let equipMaintenance = JSON.parse(localStorage.getItem("equipMaintenance") || "{}");

            let backupData = {
                workHistory: history,
                equipment: equipment,
                recipient: recipient,
                machineNotes: machineNotes,
                equipMaintenance: equipMaintenance,
                backupDate: new Date().toISOString()
            };

            const dataStr = JSON.stringify(backupData, null, 2);
            const blob = new Blob([dataStr], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            
            const d = new Date();
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const dateString = `${yyyy}${mm}${dd}`;
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `SFDC_Backup_${dateString}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            localStorage.setItem('lastBackupDate', now.toString());
            setTimeout(() => showToast("정기 자동 백업", "PC 다운로드 폴더에 백업 파일이 저장되었습니다."), 1500);
        } catch (error) {
            console.error("자동 백업 실패:", error);
        }
    }
}


// ==============================================================================
