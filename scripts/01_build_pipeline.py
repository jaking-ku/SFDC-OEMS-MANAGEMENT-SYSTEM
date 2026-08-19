import os
import sys
import json
import time
from datetime import datetime

# 콘솔 UTF 8 출력 설정
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def read_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(filepath, content):
    dirname = os.path.dirname(filepath)
    if dirname:
        os.makedirs(dirname, exist_ok=True)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

def build_manager():
    print('[1/2] Building SFDC/OEMS Manager...')
    
    # 1. 템플릿 로드
    template = read_file('src/manager/index.html')
    
    # 2. 스타일 로드
    tw_layer_css = read_file('src/manager/styles/tailwind_layer.css')
    custom_css = read_file('src/manager/styles/custom.css')
    mobile_css = read_file('src/manager/styles/mobile.css')
    
    # 스타일 결합
    full_custom_css = custom_css.strip() + '\n\n' + mobile_css.strip()
    
    # 템플릿 내 style 태그 교체
    if '<style type="text/tailwindcss">' in template:
        before_tw = template.split('<style type="text/tailwindcss">')[0]
        after_tw = template.split('</style>', 1)[1]
        template = before_tw + f'<style type="text/tailwindcss">\n{tw_layer_css.strip()}\n    </style>' + after_tw
        
    if '<style>' in template:
        # 두번째 style 태그 교체
        parts = template.split('<style>')
        before_style = parts[0]
        # parts[1]에 style 내용과 </style>이 있음
        after_parts = parts[1].split('</style>', 1)
        after_style = after_parts[1]
        template = before_style + f'<style>\n{full_custom_css.strip()}\n    </style>' + after_style

    # 3. JS 모듈 로드 및 순서대로 결합
    js_modules = [
        'state.js',
        'storage_box.js',
        'extraction_email.js',
        'maintenance.js',
        'database.js',
        'ui.js',
        'app.js'
    ]
    
    bundled_js = []
    for mod in js_modules:
        mod_path = os.path.join('src/manager/js', mod)
        if os.path.exists(mod_path):
            code = read_file(mod_path).strip()
            bundled_js.append(f'// [Module: {mod}]\n{code}')
        else:
            print(f'  Warning: Module not found -> {mod_path}')
            
    full_js = '\n\n'.join(bundled_js)
    
    # 4. 스크립트 주입
    if '<!-- INJECT_SCRIPTS_HERE -->' in template:
        final_html = template.replace('<!-- INJECT_SCRIPTS_HERE -->', f'<script>\n{full_js}\n</script>')
    else:
        final_html = template.replace('</body>', f'<script>\n{full_js}\n</script>\n</body>')
        
    # 5. 산출물 저장
    write_file('dist/index.html', final_html)
    write_file('index.html', final_html) # 루트 동기화
    
    line_count = len(final_html.splitlines())
    byte_size = len(final_html.encode('utf-8'))
    print(f'  Manager build complete: {line_count:,} lines, {byte_size:,} bytes -> dist/index.html, index.html')
    return {
        'target': 'SFDC/OEMS Manager',
        'dist': 'dist/index.html',
        'lines': line_count,
        'bytes': byte_size,
        'modules': js_modules
    }

def build_scheduler():
    print('[2/2] Building HITACHI Team Scheduler...')
    
    # 1. 템플릿 로드
    template = read_file('src/scheduler/index.html')
    
    # 2. 스타일 로드
    scheduler_css = read_file('src/scheduler/styles/scheduler.css')
    
    if '<style>' in template:
        before_style = template.split('<style>')[0]
        after_style = template.split('</style>', 1)[1]
        template = before_style + f'<style>\n{scheduler_css.strip()}\n    </style>' + after_style
        
    # 3. JS 모듈 로드 및 순서대로 결합
    js_modules = [
        'config.js',
        'google_sheets.js',
        'calendar.js',
        'action_drawer.js',
        'dashboard.js',
        'sidebar_notify.js',
        'setup_manager.js',
        'search_modal.js'
    ]
    
    bundled_js = []
    for mod in js_modules:
        mod_path = os.path.join('src/scheduler/js', mod)
        if os.path.exists(mod_path):
            code = read_file(mod_path).strip()
            bundled_js.append(f'// [Module: {mod}]\n{code}')
        else:
            print(f'  Warning: Module not found -> {mod_path}')
            
    full_js = '\n\n'.join(bundled_js)
    
    # 4. 스크립트 주입
    if '<!-- INJECT_SCRIPTS_HERE -->' in template:
        final_html = template.replace('<!-- INJECT_SCRIPTS_HERE -->', f'<script>\n{full_js}\n</script>')
    else:
        final_html = template.replace('</body>', f'<script>\n{full_js}\n</script>\n</body>')
        
    # 5. 산출물 저장
    write_file('dist/team_schedule.html', final_html)
    write_file('team_schedule_fixed.html', final_html) # 루트 동기화
    
    line_count = len(final_html.splitlines())
    byte_size = len(final_html.encode('utf-8'))
    print(f'  Scheduler build complete: {line_count:,} lines, {byte_size:,} bytes -> dist/team_schedule.html, team_schedule_fixed.html')
    return {
        'target': 'HITACHI Team Scheduler',
        'dist': 'dist/team_schedule.html',
        'lines': line_count,
        'bytes': byte_size,
        'modules': js_modules
    }

def main():
    start_time = time.time()
    print('====================================================')
    print('  Starting Unified Modular Build Pipeline')
    print('====================================================')
    
    res_mgr = build_manager()
    res_sch = build_scheduler()
    
    elapsed = time.time() - start_time
    
    manifest = {
        'build_timestamp': datetime.now().isoformat(),
        'elapsed_seconds': round(elapsed, 4),
        'targets': [res_mgr, res_sch]
    }
    
    write_file('intermediate_results/build_manifest.json', json.dumps(manifest, indent=2, ensure_ascii=False))
    
    print('====================================================')
    print(f'  Build Succeeded in {elapsed:.3f}s')
    print('  Manifest saved to intermediate_results/build_manifest.json')
    print('====================================================')

if __name__ == '__main__':
    main()
