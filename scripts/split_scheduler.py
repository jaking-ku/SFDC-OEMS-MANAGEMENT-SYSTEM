import os
import sys
import re

def split_scheduler_html():
    with open('team_schedule_fixed.html', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. CSS 추출
    style_match = re.search(r'<style>(.*?)</style>', content, re.DOTALL)
    if style_match:
        full_css = style_match.group(1).strip()
        with open('src/scheduler/styles/scheduler.css', 'w', encoding='utf-8') as sf:
            sf.write(full_css + '\n')

    # 2. HTML 템플릿 추출
    script_matches = list(re.finditer(r'<script>', content))
    main_script_start = script_matches[-1].start()
    main_script_end = content.find('</script>', main_script_start)

    html_part_before = content[:main_script_start].strip()
    html_part_after = content[main_script_end + len('</script>'):].strip()

    template_html = html_part_before + '\n<!-- INJECT_SCRIPTS_HERE -->\n' + html_part_after
    with open('src/scheduler/index.html', 'w', encoding='utf-8') as hf:
        hf.write(template_html + '\n')

    # 3. JS 스크립트 분해
    js_content = content[main_script_start + len('<script>'):main_script_end].strip()

    section_patterns = [
        ('config.js', 0, r'// ===== ☁️ 시트 쓰기 요청 직렬화'),
        ('google_sheets.js', r'// ===== ☁️ 시트 쓰기 요청 직렬화', r'// ===== 🔗 연속 일정 그룹 관리'),
        ('calendar.js', r'// ===== 🔗 연속 일정 그룹 관리', r'// ===== ✅ Action Required List'),
        ('action_drawer.js', r'// ===== ✅ Action Required List', r'// ===== 📊 대시보드'),
        ('dashboard.js', r'// ===== 📊 대시보드', r'// ===== 🧭 사이드바'),
        ('sidebar_notify.js', r'// ===== 🧭 사이드바', r'// ===== 🔧 셋업 관리'),
        ('setup_manager.js', r'// ===== 🔧 셋업 관리', r'// 🔍 통합 일정 및 작업 이력 검색'),
        ('search_modal.js', r'// 🔍 통합 일정 및 작업 이력 검색', None)
    ]

    for filename, start_pat, end_pat in section_patterns:
        if isinstance(start_pat, int):
            start_pos = start_pat
        else:
            start_m = re.search(start_pat, js_content)
            if not start_m:
                print(f'Warning: Start pattern not found for {filename}')
                continue
            start_pos = start_m.start()

        if end_pat:
            end_m = re.search(end_pat, js_content)
            if not end_m:
                print(f'Warning: End pattern not found for {filename}')
                end_pos = len(js_content)
            else:
                end_pos = end_m.start()
        else:
            end_pos = len(js_content)

        sec_code = js_content[start_pos:end_pos].strip()
        with open(os.path.join('src/scheduler/js', filename), 'w', encoding='utf-8') as jf:
            jf.write(sec_code + '\n')
        print(f'Created src/scheduler/js/{filename} ({len(sec_code.splitlines())} lines)')

if __name__ == '__main__':
    split_scheduler_html()
    print('Team Scheduler split completed successfully.')
