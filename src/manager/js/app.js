// 8. [Lifecycle & Initialization] 애플리케이션 시작 및 주기적 백그라운드 태스크
// ==============================================================================

/** 애플리케이션 진입점 (Window Load) */
window.onload = async function() {
    // 1) 최초 Box 동기화 게이트 확인
    checkSyncGateOnLoad();

    // 2) 테마 및 기본 스토리지 키 초기화
    initTheme();
    ["equipmentData"].forEach(k => { if (!localStorage.getItem(k)) localStorage.setItem(k, "[]"); });
    if (!localStorage.getItem("recipientData")) localStorage.setItem("recipientData", "{}");
    if (!localStorage.getItem("machineNotes")) localStorage.setItem("machineNotes", "{}");
    
    // 3) 스토리지 마이그레이션 (IndexedDB & S/N 정합성)
    await migrateToIndexedDB();
    await migrateEquipmentDataToSN();

    // 4) UI 테이블 및 배지 렌더링
    renderTable(); 
    renderRecipientTable(); 
    await updateHistoryBadge();
    
    // 5) 기본 입력 폼 초기값 설정
    if (localStorage.getItem("storedMyName")) {
        document.getElementById("mailMyName").value = localStorage.getItem("storedMyName");
    }
    document.getElementById("mailDate").valueAsDate = new Date();
    addShipBlock();

    // 6) 1주일 주기 PC 자동 백업 점검
    await autoLocalBackup();

    // 7) Box 연결 핸들 권한 상태 점검
    let dirHandle = await getFileHandle('boxDirectoryHandle');
    let fileHandle = await getFileHandle('boxBackupFile');
    let activeHandle = dirHandle || fileHandle;
    if (activeHandle && !(await verifyPermission(activeHandle, true, false))) {
        const btn = document.getElementById("syncBtn");
        if (btn) { 
            btn.classList.add("text-red-500", "font-black"); 
            document.getElementById("syncIcon").innerText = "error"; 
            document.getElementById("syncText").innerText = "연결 끊김(클릭)"; 
        }
    }

    // 8) 상태 배너 갱신 및 주기적 감시 리스너 등록
    await updateSyncStatusBanner();
    window.addEventListener('focus', updateSyncStatusBanner);
    document.addEventListener('visibilitychange', () => { 
        if (document.visibilityState === 'visible') updateSyncStatusBanner(); 
    });
    setInterval(updateSyncStatusBanner, 5 * 60 * 1000);

    // 9) 1시간 간격 주기적 백그라운드 자동 Sync
    function updateAutoSyncLabel(ts) {
        let el = document.getElementById('autoSyncLabel');
        if (!el) {
            el = document.createElement('p');
            el.id = 'autoSyncLabel';
            el.style.cssText = 'font-size:9px;color:var(--text-muted,#888);text-align:center;margin-top:4px;opacity:0.7;';
            const syncBtn = document.getElementById('syncBtn');
            if (syncBtn && syncBtn.parentNode) syncBtn.parentNode.appendChild(el);
        }
        const d = new Date(ts);
        const revision = localStorage.getItem('teamDbRevision') || '0';
        el.textContent = `TEAM DB 최신 확인: ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')} · Rev. ${revision}`;
    }

    function runAutoSync() {
        syncWithBox(false, false, false);
        updateAutoSyncLabel(Date.now());
    }

    runAutoSync();
    setInterval(runAutoSync, AUTO_SYNC_INTERVAL);
};

/** URL Hash 라우팅 복원 (설비 상세페이지 #detail-SN) */
window.addEventListener('load', () => {
    if (location.hash.startsWith('#detail-')) {
        const sn = decodeURIComponent(location.hash.replace('#detail-', ''));
        openEquipDetail(sn);
    }
});
