// 1. [Constants & Global State] 상수 및 전역 런타임 상태 관리
// ==============================================================================

/** 사내 Box 기본 동기화 폴더 경로 안내 텍스트 */
const BOX_PATH = "Box\\@Int_Metrology Systems Service Div (2026)\\1. 統括1部 (2026)\\4. 評価4部 (2026)\\0. 評価4部共通\\002_광학 설비\\02-05_가동리스트(IS_DI_LS)\\SFDC OEMS Manage Program\\";

/** IndexedDB 설정 상수 */
const DB_N = 'HitachiSfdcDB';
const ST_N = 'fileHandles';
const HIST_STORE = 'workHistory';
const SYNC_STORE = 'syncState';

/** 팀 DB 스키마 버전 및 동기화 주기 상수 */
const TEAM_SCHEMA_VERSION = 3;
const SYNC_STALE_MS = 30 * 60 * 1000;       // 30분 이상 미동기화 시 경고
const AUTO_SYNC_INTERVAL = 60 * 60 * 1000;  // 1시간 간격 자동 백그라운드 Sync

/** Scale Head 5개 축 정의 */
const SCALE_AXES = [
    { key: 'X', label: 'X' },
    { key: 'Y1', label: 'Y1 (YL)' },
    { key: 'Y2', label: 'Y2 (YR)' },
    { key: 'Z1', label: 'Z1 (ZL)' },
    { key: 'Z2', label: 'Z2 (ZR)' }
];

/** 전역 런타임 상태 변수 */
let currentMailTemplate = 'work';           // 현재 활성화된 메일 템플릿 ('work' | 'ship')
let shipBlockCount = 0;                     // 반출 배차 블록 인덱스 카운터
let isSyncing = false;                      // 현재 동기화 진행 중 여부 플래그
let pendingPush = false;                    // 동기화 중 추가 변경 발생 시 후속 Push 대기 플래그
let activeSyncPromise = null;               // 동시 실행 방지를 위한 활성 Sync 프로미스
let _autoSyncDebounceTimer = null;          // 자동 저장 디바운스 타이머
let _pendingPushScope = { scope: 'all' };   // 디바운스 Push 대상 스코프
let selectedChip = null;                    // 작업 히스토리에서 현재 선택된 설비 호기명


// ==============================================================================
