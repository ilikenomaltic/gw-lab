#!/usr/bin/env python3
"""style.css 와 main.js 링크에 파일 내용 해시를 붙인다.

브라우저가 중간에 끊긴 응답을 캐시에 물고 있으면 새로고침으로도 안 빠진다.
URL 자체를 바꾸면 캐시 항목을 찾을 수 없으므로 반드시 새로 받는다.
배포할 때도 같은 이유로 유용하다. 파일을 고칠 때마다 다시 돌리면 된다."""
import hashlib, pathlib, re

root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text(encoding='utf-8')

for name in ('style.css', 'main.js'):
    h = hashlib.sha1((root / name).read_bytes()).hexdigest()[:8]
    html = re.sub(rf'{re.escape(name)}(\?v=[0-9a-f]+)?', f'{name}?v={h}', html)
    print(f'  {name} -> ?v={h}')

(root / 'index.html').write_text(html, encoding='utf-8')
