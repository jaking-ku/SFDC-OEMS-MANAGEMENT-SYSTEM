import os
import sys

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

mgr_expected = [
    'checkSyncGateOnLoad', 'initTheme', 'migrateToIndexedDB', 
    'renderTable', 'renderRecipientTable', 'updateHistoryBadge', 
    'autoLocalBackup', 'syncWithBox', 'switchTab', 'toggleDarkMode', 
    'openEquipDetail', 'extractData', 'generateFullMail',
    'setSyncGateState', 'updateSyncGateProgress', 'gateRetry'
]

sch_expected = [
    'generateCalendarPC', 'renderActionList', 'openDashboard', 
    'performSearch', 'toggleSidebar', 'updateActionBadge',
    'openEditModal', 'renderDashboard', 'downloadSearchResultsCSV'
]

with open('dist/index.html', 'r', encoding='utf-8') as f:
    mgr_content = f.read()

with open('dist/team_schedule.html', 'r', encoding='utf-8') as f:
    sch_content = f.read()

all_pass = True
print('====================================================')
print('  SFDC/OEMS Manager Function Integrity Check')
print('====================================================')
for fn in mgr_expected:
    found = fn in mgr_content
    if not found:
        all_pass = False
    status = 'PASS' if found else 'FAIL'
    print(f'  [{status}] {fn}')

print('\n====================================================')
print('  Team Scheduler Function Integrity Check')
print('====================================================')
for fn in sch_expected:
    found = fn in sch_content
    if not found:
        all_pass = False
    status = 'PASS' if found else 'FAIL'
    print(f'  [{status}] {fn}')

print('====================================================')
if all_pass:
    print('  Result: ALL INTEGRITY CHECKS PASSED (100%)')
else:
    print('  Result: SOME CHECKS FAILED')
print('====================================================')
