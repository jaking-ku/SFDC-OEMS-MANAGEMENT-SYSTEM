import os
import sys
import re

def split_index_html():
    with open('index.html', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. CSS 추출
    tw_layer_match = re.search(r'<style type="text/tailwindcss">(.*?)</style>', content, re.DOTALL)
    if tw_layer_match:
        with open('src/manager/styles/tailwind_layer.css', 'w', encoding='utf-8') as sf:
            sf.write(tw_layer_match.group(1).strip() + '\n')

    custom_css_match = re.search(r'<style>(.*?)</style>', content, re.DOTALL)
    if custom_css_match:
        full_css = custom_css_match.group(1).strip()
        if '@media (max-width: 767px)' in full_css:
            parts = full_css.split('@media (max-width: 767px)')
            custom_part = parts[0].strip()
            mobile_part = '@media (max-width: 767px)' + parts[1].strip()
        else:
            custom_part = full_css
            mobile_part = ''

        with open('src/manager/styles/custom.css', 'w', encoding='utf-8') as sf:
            sf.write(custom_part + '\n')
        with open('src/manager/styles/mobile.css', 'w', encoding='utf-8') as sf:
            sf.write(mobile_part + '\n')

    # 2. HTML 템플릿 추출 (head부터 body 마지막 전까지, style과 script 태그 제외)
    # <script> 시작 전까지의 body 및 head
    script_start_idx = content.rfind('<script>')
    body_part = content[:script_start_idx].strip()
    
    # 템플릿용 index.html 작성 (CSS/JS placeholder 주석 포함)
    with open('src/manager/index.html', 'w', encoding='utf-8') as hf:
        hf.write(body_part + '\n<!-- INJECT_SCRIPTS_HERE -->\n</body>\n</html>\n')

    # 3. JS 스크립트 분해
    js_content = content[script_start_idx + len('<script>'):content.rfind('</script>')].strip()
    
    # 섹션별 구분점 찾기
    section_patterns = [
        ('state.js', r'// 1\. \[Constants & Global State\]', r'// 2\. \[Storage Layer\]'),
        ('storage_box.js', r'// 2\. \[Storage Layer\]', r'// 4\. \[Business: Extraction & Email\]'),
        ('extraction_email.js', r'// 4\. \[Business: Extraction & Email\]', r'// 5\. \[Business: Maintenance\]'),
        ('maintenance.js', r'// 5\. \[Business: Maintenance\]', r'// 6\. \[Business: Management\]'),
        ('database.js', r'// 6\. \[Business: Management\]', r'// 7\. \[UI & View Renderers\]'),
        ('ui.js', r'// 7\. \[UI & View Renderers\]', r'// 8\. \[Lifecycle & Initialization\]'),
        ('app.js', r'// 8\. \[Lifecycle & Initialization\]', None)
    ]

    for filename, start_pat, end_pat in section_patterns:
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
        with open(os.path.join('src/manager/js', filename), 'w', encoding='utf-8') as jf:
            jf.write(sec_code + '\n')
        print(f'Created src/manager/js/{filename} ({len(sec_code.splitlines())} lines)')

if __name__ == '__main__':
    split_index_html()
    print('SFDC/OEMS Manager split completed successfully.')
