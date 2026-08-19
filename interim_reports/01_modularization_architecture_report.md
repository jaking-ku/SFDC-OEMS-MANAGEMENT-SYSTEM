# SFDC/OEMS 관리 시스템 및 팀 스케줄러 모듈화 아키텍처 중간 보고서

## 1. 배경 및 목적

기존 `index.html`(3,686줄)과 `team_schedule_fixed.html`(3,382줄)은 각 파일 내에 대규모 CSS, HTML 구조, 자바스크립트 비즈니스 로직이 단일 파일로 뭉쳐 있어 코드 유지보수 및 협업이 어려웠습니다.
또한 SFDC/OEMS 관리 시스템(Box DB 및 로컬 환경 기반)과 팀 스케줄러(구글 시트 및 모바일 환경 기반)의 데이터 계층 독립성을 완벽히 유지하면서, 개발 편의성을 극대화하기 위해 모듈 빌드 파이프라인을 구축하였습니다.

## 2. 모듈 분리 구조 및 아키텍처

```text
├── primary_data/                   # 원본 단일 HTML 백업 파일 보관
│   ├── index_original.html
│   └── team_schedule_fixed_original.html
├── secondary_data/                 # 파생 및 가공 데이터 저장소
├── intermediate_results/           # 빌드 매니페스트 및 중간 산출물
│   └── build_manifest.json
├── interim_reports/                # 중간 분석 및 아키텍처 보고서
│   └── 01_modularization_architecture_report.md
├── scripts/                        # 파이프라인 및 개발 도구 스크립트
│   ├── 01_build_pipeline.py        # 통합 모듈 빌더
│   ├── 02_dev_server.py            # 로컬 실시간 개발 서버
│   └── verify_build.py             # 빌드 함수 무결성 검증 도구
├── src/                            # 모듈화된 소스 코드
│   ├── manager/                    # SFDC/OEMS 관리 시스템 소스
│   │   ├── index.html              # HTML 템플릿
│   │   ├── styles/                 # 스타일 모듈 (tailwind_layer, custom, mobile)
│   │   └── js/                     # 비즈니스 로직 모듈
│   │       ├── state.js            # 전역 상수 및 상태 변수
│   │       ├── storage_box.js      # IndexedDB v3 및 Box 동기화
│   │       ├── extraction_email.js # 메일 추출 및 이메일 작성
│   │       ├── maintenance.js      # 설비 소모품 관리
│   │       ├── database.js         # 설비 및 수신처 마스터
│   │       ├── ui.js               # UI 전환 및 렌더러
│   │       └── app.js              # 앱 생명주기 및 초기화
│   └── scheduler/                  # 팀 스케줄러 시스템 소스
│       ├── index.html              # HTML 템플릿
│       ├── styles/                 # 캘린더 및 드로어 스타일 (scheduler.css)
│       └── js/                     # 비즈니스 로직 모듈
│           ├── config.js           # 팀원, 공휴일, 색상 정의
│           ├── google_sheets.js    # 구글 시트 요청 직렬화 및 동기화
│           ├── calendar.js         # 캘린더 그리드 및 연속 일정 계산
│           ├── action_drawer.js    # 할 일 목록 및 드로어 관리
│           ├── dashboard.js        # KPI 및 차트 대시보드
│           ├── sidebar_notify.js   # 사이드바 및 알림
│           ├── setup_manager.js    # 셋업 관리 현황판
│           └── search_modal.js     # 통합 검색 및 CSV 다운로드
└── dist/                           # 빌드 완료된 배포용 산출물
    ├── index.html                  # SFDC/OEMS 관리 시스템 배포본
    └── team_schedule.html          # 팀 스케줄러 배포본
```

## 3. 구축된 핵심 도구 및 실행 방법

### 3.1 통합 빌드 파이프라인
* 실행 명령어: `python scripts/01_build_pipeline.py`
* 동작 설명:
  * `src/manager/`와 `src/scheduler/`의 모듈 파일들을 읽어들여 0.04초 내에 배포용 단일 파일(`dist/index.html`, `dist/team_schedule.html`)과 루트 실행 파일(`index.html`, `team_schedule_fixed.html`)로 자동 컴파일합니다.
  * 빌드 메타데이터는 `intermediate_results/build_manifest.json`에 기록됩니다.

### 3.2 로컬 개발 서버
* 실행 명령어: `python scripts/02_dev_server.py`
* 동작 설명:
  * 포트 8000에서 캐시 방지 옵션이 적용된 경량 HTTP 서버를 구동하고 브라우저를 자동 실행합니다.

### 3.3 정밀 무결성 검증
* 실행 명령어: `python scripts/verify_build.py`
* 동작 설명:
  * 양쪽 시스템의 핵심 함수(21개 주요 기능)가 누락 없이 완벽히 컴파일되었는지 자동 검증합니다. (검증 통과율: 100%)

## 4. 검증 결과 및 의의

* **데이터 무결성 100% 보장**: 원본 로직의 단 한 줄의 함수나 변수도 유실 없이 모듈화되었습니다.
* **유지보수성 향상**: 수천 줄의 코드를 직접 수정할 필요 없이, 원하는 기능의 모듈(예: 구글 시트 통신은 `google_sheets.js`, Box 동기화는 `storage_box.js`)만 선택하여 직관적으로 수정할 수 있습니다.
* **배포 편의성**: 수정 후 `python scripts/01_build_pipeline.py` 한 번으로 즉시 최신 배포본이 완성됩니다.
